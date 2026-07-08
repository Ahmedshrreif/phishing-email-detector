from __future__ import annotations

import csv
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.domain import AuditLog, ModelVersion, TrainingSample, User
from ml.train import train_model


def train_candidate_model(db: Session, admin: User, dataset_version: str, min_precision: float, min_recall: float) -> ModelVersion:
    samples = db.query(TrainingSample).filter(TrainingSample.dataset_version == dataset_version).all()
    records = []
    for sample in samples:
        result = json.loads(sample.email_data_json)
        records.append(
            {
                "id": sample.id,
                "subject": "Approved feedback sample",
                "body": result.get("summary", ""),
                "sender": result.get("sender_analysis", {}).get("sender_address") or "",
                "reply_to": result.get("sender_analysis", {}).get("reply_to_address") or "",
                "headers": json.dumps(result.get("header_findings", {})),
                "urls": json.dumps(result.get("urls", [])),
                "label": sample.verified_label,
                "source": "admin_approved_feedback",
                "created_at": sample.created_at.isoformat(),
                "verified": "true",
            }
        )
    if len(records) < 50:
        raise ValueError("At least 50 approved training samples are required before admin retraining")
    version = datetime.now(timezone.utc).strftime("candidate-%Y%m%d%H%M%S")
    with tempfile.TemporaryDirectory() as tempdir:
        dataset_path = Path(tempdir) / "training.csv"
        fieldnames = ["id", "subject", "body", "sender", "reply_to", "headers", "urls", "label", "source", "created_at", "verified"]
        with dataset_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(records)
        result = train_model(dataset_path, version=version, activate=False)
    metrics = result["metrics"]
    if metrics["precision"] < min_precision or metrics["recall"] < min_recall:
        raise ValueError("Candidate model failed configured quality checks")
    model = ModelVersion(
        version=version,
        model_path=f"ml/artifacts/{version}/model.joblib",
        dataset_version=dataset_version,
        metrics_json=json.dumps(metrics),
        hyperparameters_json=json.dumps({"min_precision": min_precision, "min_recall": min_recall}),
        is_active=False,
        created_by=admin.id,
    )
    db.add(model)
    db.add(AuditLog(user_id=admin.id, action="model.trained", entity_type="model", entity_id=version))
    db.commit()
    db.refresh(model)
    return model
