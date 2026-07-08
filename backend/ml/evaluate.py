from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score

from ml.features.extract import build_feature_frame
from ml.registry import get_active_model_path, model_path_for_version


def evaluate(dataset: Path, version: str | None = None) -> dict:
    model_path = model_path_for_version(version) if version else get_active_model_path()
    if not model_path or not model_path.exists():
        raise FileNotFoundError("No model artifact found. Run python -m ml.train first.")
    bundle = joblib.load(model_path)
    df = pd.read_csv(dataset)
    X = build_feature_frame(df.to_dict(orient="records"))
    y = (df["label"] == "phishing").astype(int)
    probabilities = bundle["pipeline"].predict_proba(X)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)
    return {
        "version": bundle["version"],
        "accuracy": float(accuracy_score(y, predictions)),
        "precision": float(precision_score(y, predictions, zero_division=0)),
        "recall": float(recall_score(y, predictions, zero_division=0)),
        "f1": float(f1_score(y, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y, probabilities)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to a verified CSV dataset in the normalized PhishGuard schema")
    parser.add_argument("--version", default=None)
    args = parser.parse_args()
    print(json.dumps(evaluate(Path(args.dataset), args.version), indent=2))


if __name__ == "__main__":
    main()
