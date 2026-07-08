from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field

from app.schemas.auth import UserRead


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    email: EmailStr | None = None
    role: str | None = Field(default=None, pattern="^(user|analyst|admin)$")
    is_active: bool | None = None


class AdminPasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=10, max_length=128)


class AdminFeedbackRead(BaseModel):
    id: str
    analysis_id: str
    user_id: str
    submitter_name: str | None = None
    submitter_email: str | None = None
    feedback_type: str
    suggested_label: str | None
    notes: str | None
    status: str
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackReviewRequest(BaseModel):
    dataset_version: str = "verified-feedback"
    notes: str | None = None


class ModelVersionRead(BaseModel):
    id: str
    version: str
    model_path: str
    dataset_version: str
    metrics_json: str
    hyperparameters_json: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TrainModelRequest(BaseModel):
    dataset_version: str = "verified-feedback"
    min_precision: float = 0.60
    min_recall: float = 0.60
    notes: str | None = None


class SystemHealth(BaseModel):
    status: str
    database: str
    model: dict[str, Any]
    optional_reputation_apis: dict[str, bool]


class AdminOverview(BaseModel):
    users: list[UserRead]
    pending_feedback: int
    active_model: ModelVersionRead | None
