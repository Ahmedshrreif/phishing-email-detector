from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from ml.features.extract import build_feature_frame
from ml.registry import get_active_model_path

logger = logging.getLogger(__name__)


class ModelPredictor:
    def __init__(self) -> None:
        self.bundle: dict[str, Any] | None = None
        self.path: Path | None = None

    def ensure_loaded(self) -> None:
        path = get_active_model_path()
        if path is None:
            raise RuntimeError("Model artifact is unavailable")
        if self.bundle is None or self.path != path:
            self.bundle = joblib.load(path)
            self.path = path
            logger.info("Loaded model artifact %s", path)

    def predict(self, record: dict[str, Any]) -> dict[str, Any]:
        try:
            self.ensure_loaded()
        except Exception as exc:
            logger.warning("ML model unavailable: %s", exc)
            return {
                "score": 0.0,
                "probability": 0.0,
                "confidence": 0.0,
                "predicted_label": "unavailable",
                "model_version": "unavailable",
                "model_available": False,
                "top_model_factors": [
                    {
                        "feature": "machine-learning model unavailable",
                        "direction": "manual review recommended",
                        "contribution": 0,
                    }
                ],
            }
        assert self.bundle is not None
        frame = build_feature_frame([record])
        pipeline = self.bundle["pipeline"]
        probability = float(pipeline.predict_proba(frame)[0, 1])
        score = probability * 100
        confidence = max(probability, 1 - probability) * 100
        factors = self._top_factors(frame)
        return {
            "score": score,
            "probability": probability,
            "confidence": confidence,
            "predicted_label": "phishing" if probability >= 0.5 else "safe",
            "model_version": self.bundle.get("version", "unknown"),
            "model_available": True,
            "top_model_factors": factors,
        }

    def status(self) -> dict[str, Any]:
        try:
            self.ensure_loaded()
        except Exception as exc:
            return {"available": False, "error": str(exc)}
        assert self.bundle is not None
        return {
            "available": True,
            "version": self.bundle.get("version", "unknown"),
            "metrics": self.bundle.get("metrics", {}),
            "path": str(self.path),
        }

    def _top_factors(self, frame) -> list[dict[str, Any]]:
        if self.bundle is None:
            return []
        pipeline = self.bundle["pipeline"]
        features = pipeline.named_steps["features"]
        classifier = pipeline.named_steps["classifier"]
        transformed = features.transform(frame)
        names = features.get_feature_names_out()
        coefficients = classifier.coef_[0]
        if hasattr(transformed, "multiply"):
            contributions = np.asarray(transformed.multiply(coefficients).toarray())[0]
        else:
            contributions = np.asarray(transformed)[0] * coefficients
        top_indices = np.argsort(np.abs(contributions))[-12:][::-1]
        factors = []
        for idx in top_indices:
            value = float(contributions[idx])
            if abs(value) < 0.001:
                continue
            name = str(names[idx])
            cleaned = (
                name.replace("word_tfidf__", "")
                .replace("char_tfidf__", "")
                .replace("numeric__", "")
                .replace("_", " ")
            )
            factors.append(
                {
                    "feature": cleaned,
                    "direction": "raises risk" if value > 0 else "lowers risk",
                    "contribution": round(value, 4),
                }
            )
        return factors[:8]


predictor = ModelPredictor()
