from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml.features.extract import NUMERIC_COLUMNS, build_feature_frame
from ml.registry import artifact_root, metrics_path_for_version, model_path_for_version, set_active_model

RANDOM_SEED = 42
REQUIRED_COLUMNS = {"subject", "body", "sender", "label"}
MIN_ROWS_PER_CLASS = 4


def _load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")
    df = pd.read_csv(path)
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Training dataset is missing required column(s): {', '.join(sorted(missing))}")
    df = df[df["label"].isin(["safe", "phishing"])].copy()
    if df.empty:
        raise ValueError("Training dataset must contain at least one safe and one phishing record")
    df["_dedupe"] = (df["subject"].fillna("") + "\n" + df["body"].fillna("") + "\n" + df["sender"].fillna("")).str.lower()
    df = df.drop_duplicates("_dedupe")
    class_counts = df["label"].value_counts().to_dict()
    missing_classes = {"safe", "phishing"} - set(class_counts)
    if missing_classes:
        raise ValueError(f"Training dataset must include both safe and phishing labels; missing: {', '.join(sorted(missing_classes))}")
    too_small = {label: count for label, count in class_counts.items() if count < MIN_ROWS_PER_CLASS}
    if too_small:
        details = ", ".join(f"{label}={count}" for label, count in sorted(too_small.items()))
        raise ValueError(f"Training dataset needs at least {MIN_ROWS_PER_CLASS} records per class after deduplication; got {details}")
    return df


def train_model(dataset_path: Path, version: str | None = None, activate: bool = True) -> dict:
    df = _load_dataset(dataset_path)
    records = df.to_dict(orient="records")
    X = build_feature_frame(records)
    y = (df["label"] == "phishing").astype(int)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=RANDOM_SEED, stratify=y)
    preprocessor = ColumnTransformer(
        transformers=[
            ("word_tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=5000), "text"),
            ("char_tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1, max_features=6000), "text"),
            ("numeric", StandardScaler(with_mean=False), NUMERIC_COLUMNS),
        ]
    )
    pipeline = Pipeline(
        steps=[
            ("features", preprocessor),
            (
                "classifier",
                LogisticRegression(
                    max_iter=1000,
                    class_weight="balanced",
                    random_state=RANDOM_SEED,
                    solver="liblinear",
                ),
            ),
        ]
    )
    pipeline.fit(X_train, y_train)
    probabilities = pipeline.predict_proba(X_test)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_test, predictions, labels=[0, 1]).ravel()
    metrics = {
        "accuracy": float(accuracy_score(y_test, predictions)),
        "precision": float(precision_score(y_test, predictions, zero_division=0)),
        "recall": float(recall_score(y_test, predictions, zero_division=0)),
        "f1": float(f1_score(y_test, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)),
        "false_positive_rate": float(fp / max(1, fp + tn)),
        "false_negative_rate": float(fn / max(1, fn + tp)),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "calibration_note": "Logistic regression probabilities are used directly as a lightweight calibrated baseline.",
        "dataset_size": int(len(df)),
        "random_seed": RANDOM_SEED,
    }
    version = version or datetime.now(timezone.utc).strftime("v%Y%m%d%H%M%S")
    model_dir = artifact_root() / version
    model_dir.mkdir(parents=True, exist_ok=True)
    bundle = {
        "version": version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "pipeline": pipeline,
        "numeric_columns": NUMERIC_COLUMNS,
        "metrics": metrics,
        "hyperparameters": {
            "classifier": "LogisticRegression",
            "word_ngram_range": [1, 2],
            "char_ngram_range": [3, 5],
            "random_seed": RANDOM_SEED,
        },
    }
    joblib.dump(bundle, model_path_for_version(version))
    metrics_path_for_version(version).write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    if activate:
        set_active_model(version)
    latest_dir = artifact_root() / "latest"
    if latest_dir.exists() and latest_dir.is_dir():
        shutil.rmtree(latest_dir)
    shutil.copytree(model_dir, latest_dir)
    if activate:
        set_active_model("latest")
    return {"version": version, "active_version": "latest" if activate else version, "metrics": metrics}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to a verified CSV dataset in the normalized PhishGuard schema")
    parser.add_argument("--version", default=None)
    parser.add_argument("--no-activate", action="store_true")
    args = parser.parse_args()
    result = train_model(Path(args.dataset), args.version, activate=not args.no_activate)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
