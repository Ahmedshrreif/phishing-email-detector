from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.analyzers.email_parser import SUPPORTED_UPLOAD_EXTENSIONS, parse_uploaded_file_bytes
from app.core.config import get_settings
from app.database.session import get_db
from app.models.domain import User
from app.schemas.analysis import AnalysisResponse, EmailAnalyzeRequest, HeadersAnalyzeRequest, UrlAnalyzeRequest
from app.security.dependencies import get_current_user
from app.services.analysis_service import (
    analyze_email_request,
    analyze_headers_request,
    analyze_parsed_email,
    analyze_url_request,
)

router = APIRouter(prefix="/api/analyze", tags=["Analysis"])


@router.post("/email", response_model=AnalysisResponse)
def analyze_email(
    request: EmailAnalyzeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return analyze_email_request(db, user, request)


@router.post("/url", response_model=AnalysisResponse)
def analyze_url(
    request: UrlAnalyzeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return analyze_url_request(db, user, request)


@router.post("/headers", response_model=AnalysisResponse)
def analyze_headers(
    request: HeadersAnalyzeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return analyze_headers_request(db, user, request)


@router.post("/file", response_model=AnalysisResponse)
async def analyze_file(
    file: UploadFile = File(...),
    privacy_mode: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    suffix = "." + (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if suffix not in SUPPORTED_UPLOAD_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_UPLOAD_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Supported types: {supported}")
    content = await file.read()
    if len(content) > settings.max_email_file_size_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_email_file_size_mb} MB limit")
    parsed = parse_uploaded_file_bytes(file.filename or "uploaded-file", content, file.content_type)
    return analyze_parsed_email(db, user, parsed, privacy_mode=privacy_mode)
