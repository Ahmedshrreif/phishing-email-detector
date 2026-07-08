from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.session import get_db
from ml.inference import predictor

router = APIRouter(tags=["Health"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "phishguard-backend"}


@router.get("/ready")
def ready(response: Response, db: Session = Depends(get_db)) -> dict:
    try:
        db.execute(text("SELECT 1"))
        model_status = predictor.status()
        status = "ready" if model_status.get("available") else "degraded"
    except Exception as exc:
        response.status_code = 503
        return {"status": "not_ready", "error": str(exc)}
    return {"status": status, "model": model_status}


@router.get("/api/model/status")
def model_status() -> dict:
    return predictor.status()
