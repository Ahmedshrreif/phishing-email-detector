from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.domain import Analysis, AuditLog, Feedback, TrainingSample, User
from app.schemas.analysis import FeedbackRequest


def submit_feedback(db: Session, user: User, analysis_id: str, request: FeedbackRequest) -> Feedback:
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id, Analysis.user_id == user.id).first()
    if not analysis:
        raise ValueError("Analysis not found")
    suggested_label = request.suggested_label
    if request.feedback_type == "correct" and not suggested_label:
        suggested_label = analysis.classification
    feedback = Feedback(
        analysis_id=analysis.id,
        user_id=user.id,
        feedback_type=request.feedback_type,
        suggested_label=suggested_label,
        notes=request.notes,
        status="pending",
    )
    db.add(feedback)
    db.add(AuditLog(user_id=user.id, action="feedback.submitted", entity_type="analysis", entity_id=analysis.id))
    db.commit()
    db.refresh(feedback)
    return feedback


def approve_feedback(db: Session, admin: User, feedback_id: str, dataset_version: str) -> Feedback:
    feedback = db.get(Feedback, feedback_id)
    if not feedback:
        raise ValueError("Feedback not found")
    if not feedback.suggested_label:
        raise ValueError("Approved feedback requires a suggested label")
    analysis = db.get(Analysis, feedback.analysis_id)
    if not analysis:
        raise ValueError("Analysis not found")
    feedback.status = "approved"
    feedback.reviewed_by = admin.id
    feedback.reviewed_at = datetime.now(timezone.utc)
    sample = TrainingSample(
        feedback_id=feedback.id,
        email_data_json=analysis.raw_result_json,
        verified_label="phishing" if feedback.suggested_label in {"phishing", "critical_threat", "suspicious"} else "safe",
        dataset_version=dataset_version,
        approved_by=admin.id,
    )
    db.add(sample)
    db.add(
        AuditLog(
            user_id=admin.id,
            action="feedback.approved",
            entity_type="feedback",
            entity_id=feedback.id,
            metadata_json=json.dumps({"dataset_version": dataset_version}),
        )
    )
    db.commit()
    db.refresh(feedback)
    return feedback


def reject_feedback(db: Session, admin: User, feedback_id: str, reason: str) -> Feedback:
    feedback = db.get(Feedback, feedback_id)
    if not feedback:
        raise ValueError("Feedback not found")
    feedback.status = "rejected"
    feedback.reviewed_by = admin.id
    feedback.reviewed_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            user_id=admin.id,
            action="feedback.rejected",
            entity_type="feedback",
            entity_id=feedback.id,
            metadata_json=json.dumps({"reason": reason}),
        )
    )
    db.commit()
    db.refresh(feedback)
    return feedback
