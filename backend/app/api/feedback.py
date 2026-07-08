from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.domain import Feedback, User
from app.schemas.analysis import FeedbackRead, FeedbackRequest
from app.security.dependencies import get_current_user
from app.services.feedback_service import submit_feedback

router = APIRouter(tags=["Feedback"])


@router.post("/api/analyses/{analysis_id}/feedback", response_model=FeedbackRead)
def create_feedback(
    analysis_id: str,
    request: FeedbackRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Feedback:
    try:
        return submit_feedback(db, user, analysis_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/feedback/my-feedback", response_model=list[FeedbackRead])
def my_feedback(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Feedback]:
    return db.query(Feedback).filter(Feedback.user_id == user.id).order_by(Feedback.created_at.desc()).all()
