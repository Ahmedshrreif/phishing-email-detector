from __future__ import annotations

import json

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db
from app.models.domain import (
    Analysis,
    AnalyzedUrl,
    Attachment,
    AuditLog,
    EmailIndicator,
    Feedback,
    ModelVersion,
    SystemSetting,
    TrainingSample,
    User,
)
from app.schemas.admin import (
    AdminPasswordResetRequest,
    AdminFeedbackRead,
    FeedbackReviewRequest,
    ModelVersionRead,
    SystemHealth,
    TrainModelRequest,
    UserUpdateRequest,
)
from app.schemas.auth import MessageResponse
from app.schemas.auth import UserRead
from app.security.dependencies import require_admin
from app.security.passwords import hash_password, is_strong_password
from app.services.admin_model_service import train_candidate_model
from app.services.feedback_service import approve_feedback, reject_feedback
from ml.inference import predictor
from ml.registry import model_path_for_version, set_active_model

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def _active_admin_count(db: Session) -> int:
    return db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count()


def _load_user_or_404(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _is_last_active_admin(db: Session, user: User) -> bool:
    return user.role == "admin" and user.is_active and _active_admin_count(db) <= 1


def _protect_admin_access(db: Session, admin: User, user: User, *, new_role: str | None = None, new_active: bool | None = None, deleting: bool = False) -> None:
    removes_admin_role = new_role is not None and new_role != "admin" and user.role == "admin"
    disables_admin = new_active is False and user.role == "admin" and user.is_active
    if user.id == admin.id and (removes_admin_role or disables_admin or deleting):
        raise HTTPException(status_code=400, detail="You cannot remove access from your own active admin account")
    if _is_last_active_admin(db, user) and (removes_admin_role or disables_admin or deleting):
        raise HTTPException(status_code=400, detail="At least one active admin account is required")


def _delete_analyses_for_user(db: Session, user_id: str) -> int:
    analysis_ids = [row[0] for row in db.query(Analysis.id).filter(Analysis.user_id == user_id).all()]
    if not analysis_ids:
        return 0
    feedback_ids = [row[0] for row in db.query(Feedback.id).filter(Feedback.analysis_id.in_(analysis_ids)).all()]
    if feedback_ids:
        db.query(TrainingSample).filter(TrainingSample.feedback_id.in_(feedback_ids)).update({TrainingSample.feedback_id: None}, synchronize_session=False)
    db.query(Feedback).filter(Feedback.analysis_id.in_(analysis_ids)).delete(synchronize_session=False)
    db.query(EmailIndicator).filter(EmailIndicator.analysis_id.in_(analysis_ids)).delete(synchronize_session=False)
    db.query(AnalyzedUrl).filter(AnalyzedUrl.analysis_id.in_(analysis_ids)).delete(synchronize_session=False)
    db.query(Attachment).filter(Attachment.analysis_id.in_(analysis_ids)).delete(synchronize_session=False)
    return db.query(Analysis).filter(Analysis.id.in_(analysis_ids)).delete(synchronize_session=False)


@router.get("/users", response_model=list[UserRead])
def users(_: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[User]:
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    request: UserUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    user = _load_user_or_404(db, user_id)
    _protect_admin_access(db, admin, user, new_role=request.role, new_active=request.is_active)
    if request.full_name is not None:
        user.full_name = request.full_name
    if request.email is not None:
        email = request.email.lower()
        existing = db.query(User).filter(User.email == email, User.id != user.id).first()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        user.email = email
    if request.role is not None:
        user.role = request.role
    if request.is_active is not None:
        user.is_active = request.is_active
    db.add(AuditLog(user_id=admin.id, action="admin.user_updated", entity_type="user", entity_id=user.id))
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password", response_model=MessageResponse)
def reset_user_password(
    user_id: str,
    request: AdminPasswordResetRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> MessageResponse:
    user = _load_user_or_404(db, user_id)
    if not is_strong_password(request.new_password):
        raise HTTPException(status_code=400, detail="Password must include uppercase, lowercase, number, and symbol")
    user.password_hash = hash_password(request.new_password)
    db.add(AuditLog(user_id=admin.id, action="admin.user_password_reset", entity_type="user", entity_id=user.id))
    db.commit()
    return MessageResponse(message="Password reset successfully")


@router.delete("/users/{user_id}/analyses", response_model=MessageResponse)
def clear_user_analyses(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> MessageResponse:
    user = _load_user_or_404(db, user_id)
    deleted = _delete_analyses_for_user(db, user.id)
    db.add(AuditLog(user_id=admin.id, action="admin.user_analyses_deleted", entity_type="user", entity_id=user.id, metadata_json=json.dumps({"deleted": deleted})))
    db.commit()
    return MessageResponse(message=f"Deleted {deleted} analyses")


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> MessageResponse:
    user = _load_user_or_404(db, user_id)
    _protect_admin_access(db, admin, user, deleting=True)
    deleted_analyses = _delete_analyses_for_user(db, user.id)
    feedback_ids = [row[0] for row in db.query(Feedback.id).filter(Feedback.user_id == user.id).all()]
    if feedback_ids:
        db.query(TrainingSample).filter(TrainingSample.feedback_id.in_(feedback_ids)).update({TrainingSample.feedback_id: None}, synchronize_session=False)
    db.query(Feedback).filter(Feedback.user_id == user.id).delete(synchronize_session=False)
    db.query(AuditLog).filter(AuditLog.user_id == user.id).update({AuditLog.user_id: None}, synchronize_session=False)
    db.query(Feedback).filter(Feedback.reviewed_by == user.id).update({Feedback.reviewed_by: None}, synchronize_session=False)
    db.query(TrainingSample).filter(TrainingSample.approved_by == user.id).update({TrainingSample.approved_by: None}, synchronize_session=False)
    db.query(ModelVersion).filter(ModelVersion.created_by == user.id).update({ModelVersion.created_by: None}, synchronize_session=False)
    db.query(SystemSetting).filter(SystemSetting.updated_by == user.id).update({SystemSetting.updated_by: None}, synchronize_session=False)
    db.add(
        AuditLog(
            user_id=admin.id,
            action="admin.user_deleted",
            entity_type="user",
            entity_id=user.id,
            metadata_json=json.dumps({"email": user.email, "deleted_analyses": deleted_analyses}),
        )
    )
    db.delete(user)
    db.commit()
    return MessageResponse(message="User deleted")


@router.get("/feedback", response_model=list[AdminFeedbackRead])
def feedback_queue(_: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[dict]:
    items = db.query(Feedback).order_by(Feedback.created_at.desc()).all()
    return _feedback_list(db, items)


@router.post("/feedback/{feedback_id}/approve", response_model=AdminFeedbackRead)
def approve(
    feedback_id: str,
    request: FeedbackReviewRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return _feedback_item(db, approve_feedback(db, admin, feedback_id, request.dataset_version))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/feedback/{feedback_id}/reject", response_model=AdminFeedbackRead)
def reject(
    feedback_id: str,
    request: FeedbackReviewRequest = Body(default=FeedbackReviewRequest()),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    if not request.notes or not request.notes.strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    try:
        return _feedback_item(db, reject_feedback(db, admin, feedback_id, request.notes.strip()))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _feedback_list(db: Session, items: list[Feedback]) -> list[dict]:
    user_ids = {item.user_id for item in items if item.user_id}
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    users_by_id = {user.id: user for user in users}
    return [_feedback_item(db, item, users_by_id.get(item.user_id)) for item in items]


def _feedback_item(db: Session, item: Feedback, submitter: User | None = None) -> dict:
    user = submitter or db.get(User, item.user_id)
    return {
        "id": item.id,
        "analysis_id": item.analysis_id,
        "user_id": item.user_id,
        "submitter_name": user.full_name if user else None,
        "submitter_email": user.email if user else None,
        "feedback_type": item.feedback_type,
        "suggested_label": item.suggested_label,
        "notes": item.notes,
        "status": item.status,
        "reviewed_by": item.reviewed_by,
        "reviewed_at": item.reviewed_at,
        "created_at": item.created_at,
    }


@router.get("/models", response_model=list[ModelVersionRead])
def models(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[ModelVersion]:
    status = predictor.status()
    version = status.get("version")
    if status.get("available") and version:
        model = db.query(ModelVersion).filter(ModelVersion.version == version).first()
        if not model:
            model = ModelVersion(
                version=version,
                model_path=str(status.get("path", "")),
                dataset_version="external-verified",
                metrics_json=json.dumps(status.get("metrics", {})),
                hyperparameters_json=json.dumps({"source": "active artifact"}),
                created_by=admin.id,
            )
            db.add(model)
        else:
            model.model_path = str(status.get("path", model.model_path))
            model.metrics_json = json.dumps(status.get("metrics", {}))
        db.query(ModelVersion).update({ModelVersion.is_active: False})
        model.is_active = True
        db.commit()
    return db.query(ModelVersion).order_by(ModelVersion.created_at.desc()).all()


@router.post("/models/train", response_model=ModelVersionRead)
def train_model_endpoint(
    request: TrainModelRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelVersion:
    try:
        return train_candidate_model(db, admin, request.dataset_version, request.min_precision, request.min_recall)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/models/{version}/activate")
def activate_model(version: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    model = db.query(ModelVersion).filter(ModelVersion.version == version).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model version not found")
    path = model_path_for_version(version)
    if not path.exists():
        raise HTTPException(status_code=400, detail="Model artifact is missing or corrupted")
    db.query(ModelVersion).update({ModelVersion.is_active: False})
    model.is_active = True
    set_active_model(version)
    predictor.bundle = None
    db.add(AuditLog(user_id=admin.id, action="model.activated", entity_type="model", entity_id=version))
    db.commit()
    return {"message": f"Activated model {version}"}


@router.post("/models/{version}/rollback")
def rollback_model(version: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    return activate_model(version, admin, db)


@router.get("/system-health", response_model=SystemHealth)
def system_health(_: User = Depends(require_admin), db: Session = Depends(get_db)) -> SystemHealth:
    settings = get_settings()
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "unavailable"
    return SystemHealth(
        status="ok" if db_status == "ok" and predictor.status().get("available") else "degraded",
        database=db_status,
        model=predictor.status(),
        optional_reputation_apis={
            "safe_browsing": bool(settings.safe_browsing_api_key),
            "virustotal": bool(settings.virustotal_api_key),
        },
    )


@router.get("/audit-logs")
def audit_logs(_: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[dict]:
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()
    user_ids = {item.user_id for item in logs if item.user_id}
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    user_email_by_id = {user.id: user.email for user in users}
    return [
        {
            "id": item.id,
            "user_id": item.user_id,
            "user_email": user_email_by_id.get(item.user_id or ""),
            "action": item.action,
            "entity_type": item.entity_type,
            "entity_id": item.entity_id,
            "metadata": json.loads(item.metadata_json) if item.metadata_json else None,
            "ip_address": item.ip_address,
            "status": "recorded",
            "created_at": item.created_at,
        }
        for item in logs
    ]
