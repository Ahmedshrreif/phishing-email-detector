from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.domain import Analysis, AuditLog, Feedback, User
from app.schemas.auth import UserRead
from app.security.dependencies import get_current_user

router = APIRouter(prefix="/api/settings", tags=["Settings"])


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)


@router.patch("/profile", response_model=UserRead)
def update_profile(request: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    user.full_name = request.full_name
    db.add(AuditLog(user_id=user.id, action="settings.profile_updated", entity_type="user", entity_id=user.id))
    db.commit()
    db.refresh(user)
    return user


@router.get("/export")
def export_personal_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    analyses = db.query(Analysis).filter(Analysis.user_id == user.id).all()
    feedback = db.query(Feedback).filter(Feedback.user_id == user.id).all()
    return {
        "user": UserRead.model_validate(user).model_dump(mode="json"),
        "analyses": [json.loads(item.raw_result_json) for item in analyses],
        "feedback": [
            {
                "id": item.id,
                "analysis_id": item.analysis_id,
                "feedback_type": item.feedback_type,
                "suggested_label": item.suggested_label,
                "notes": item.notes,
                "status": item.status,
                "created_at": item.created_at.isoformat(),
            }
            for item in feedback
        ],
    }


@router.delete("/analyses")
def delete_all_analyses(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    deleted = db.query(Analysis).filter(Analysis.user_id == user.id).delete()
    db.add(AuditLog(user_id=user.id, action="settings.analyses_deleted", entity_type="user", entity_id=user.id))
    db.commit()
    return {"message": f"Deleted {deleted} analyses"}


@router.delete("/account")
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    db.add(AuditLog(user_id=user.id, action="settings.account_deleted", entity_type="user", entity_id=user.id))
    db.delete(user)
    db.commit()
    return {"message": "Account deleted"}
