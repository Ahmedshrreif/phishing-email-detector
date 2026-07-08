from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.domain import Analysis, AuditLog, User
from app.schemas.analysis import AnalysisListItem, AnalysisResponse
from app.security.dependencies import get_current_user
from app.services.report_service import load_analysis_for_user, make_history_csv, make_pdf_report

router = APIRouter(prefix="/api/analyses", tags=["Analysis History"])


@router.get("", response_model=list[AnalysisListItem])
def list_analyses(
    search: str | None = None,
    classification: str | None = None,
    source: str | None = None,
    model_version: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: str = Query("created_at_desc", pattern="^(created_at_desc|created_at_asc|risk_desc|risk_asc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Analysis]:
    query = db.query(Analysis)
    if user.role != "admin":
        query = query.filter(Analysis.user_id == user.id)
    filters = []
    if search:
        like = f"%{search}%"
        filters.append(or_(Analysis.subject.ilike(like), Analysis.sender.ilike(like), Analysis.summary.ilike(like)))
    if classification:
        filters.append(Analysis.classification == classification)
    if source:
        filters.append(Analysis.analysis_source == source)
    if model_version:
        filters.append(Analysis.model_version == model_version)
    if date_from:
        filters.append(Analysis.created_at >= date_from)
    if date_to:
        filters.append(Analysis.created_at <= date_to)
    if filters:
        query = query.filter(and_(*filters))
    ordering = {
        "created_at_desc": Analysis.created_at.desc(),
        "created_at_asc": Analysis.created_at.asc(),
        "risk_desc": Analysis.risk_score.desc(),
        "risk_asc": Analysis.risk_score.asc(),
    }[sort]
    return query.order_by(ordering).offset((page - 1) * page_size).limit(page_size).all()


@router.get("/export.csv")
def export_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    query = db.query(Analysis)
    if user.role != "admin":
        query = query.filter(Analysis.user_id == user.id)
    csv_text = make_history_csv(query.order_by(Analysis.created_at.desc()).all())
    return Response(csv_text, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=phishguard-history.csv"})


@router.get("/{analysis_id}", response_model=AnalysisResponse)
def get_analysis(analysis_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    try:
        analysis = load_analysis_for_user(db, analysis_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return json.loads(analysis.raw_result_json)


@router.delete("/{analysis_id}")
def delete_analysis(analysis_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    try:
        analysis = load_analysis_for_user(db, analysis_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    db.delete(analysis)
    db.add(AuditLog(user_id=user.id, action="analysis.deleted", entity_type="analysis", entity_id=analysis_id))
    db.commit()
    return {"message": "Analysis deleted"}


@router.get("/{analysis_id}/report")
def report(
    analysis_id: str,
    format: str = Query("pdf", pattern="^(pdf|json)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    try:
        analysis = load_analysis_for_user(db, analysis_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if format == "json":
        return Response(analysis.raw_result_json, media_type="application/json")
    pdf = make_pdf_report(analysis)
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=phishguard-{analysis_id}.pdf"},
    )
