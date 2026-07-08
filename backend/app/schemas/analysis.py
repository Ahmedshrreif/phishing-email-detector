from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

URL_INPUT_RE = re.compile(r"(?i)\b((?:https?://|www\.)[^\s<>'\"]+)")


def _clean_url_input(value: str) -> str:
    return value.strip().rstrip(").,;]}>\"'")


def _normalize_url_values(value: Any) -> list[str]:
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in values:
        text = str(item or "").strip()
        if not text:
            continue
        matches = URL_INPUT_RE.findall(text)
        candidates = matches or ([text] if not re.search(r"\s", text) else [])
        for candidate in candidates:
            url = _clean_url_input(candidate)
            key = url.lower()
            if url and key not in seen:
                seen.add(key)
                cleaned.append(url)
    return cleaned


class EmailAnalyzeRequest(BaseModel):
    sender_name: str | None = Field(default=None, max_length=255)
    sender_email: str | None = Field(default=None, max_length=320)
    reply_to: str | None = Field(default=None, max_length=320)
    subject: str | None = Field(default=None, max_length=500)
    body: str = Field(min_length=1, max_length=200_000)
    headers: str | None = Field(default=None, max_length=80_000)
    urls: list[str] = Field(default_factory=list)
    privacy_mode: bool = False

    @field_validator("urls", mode="before")
    @classmethod
    def normalize_urls(cls, value: Any) -> list[str]:
        return _normalize_url_values(value)


class UrlAnalyzeRequest(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=100)
    privacy_mode: bool = False

    @field_validator("urls", mode="before")
    @classmethod
    def clean_urls(cls, value: Any) -> list[str]:
        cleaned = _normalize_url_values(value)
        if not cleaned:
            raise ValueError("At least one URL is required")
        return cleaned


class HeadersAnalyzeRequest(BaseModel):
    headers: str = Field(min_length=1, max_length=100_000)
    privacy_mode: bool = False


class IndicatorRead(BaseModel):
    type: str
    title: str
    severity: str
    explanation: str
    evidence: str
    score_contribution: float


class UrlRead(BaseModel):
    original_url: str
    display_text: str | None = None
    actual_destination: str
    domain: str | None = None
    subdomain: str | None = None
    top_level_domain: str | None = None
    uses_https: bool
    uses_ip_address: bool
    url_length: int
    number_of_subdomains: int
    suspicious_characters: list[str]
    punycode_detected: bool
    shortening_detected: bool
    risk_score: float
    risk_level: str
    safety_verdict: str = "unknown"
    risk_explanation: str
    live_checked: bool = False
    reachable: bool | None = None
    http_status: int | None = None
    final_url: str | None = None
    redirect_chain: list[dict[str, Any]] = Field(default_factory=list)
    content_type: str | None = None
    tls_valid: bool | None = None
    probe_error: str | None = None
    blocked_reason: str | None = None


class AttachmentRead(BaseModel):
    filename: str
    mime_type: str | None = None
    extension: str | None = None
    file_size: int
    sha256: str | None = None
    risk_level: str
    findings: dict[str, Any]


class ComponentScores(BaseModel):
    machine_learning: dict[str, float]
    urls: dict[str, float]
    sender: dict[str, float]
    authentication: dict[str, float]
    attachments: dict[str, float]
    language: dict[str, float]


class AnalysisResponse(BaseModel):
    analysis_id: str
    classification: str
    risk_score: float
    confidence: float
    severity: str
    model_version: str
    summary: str
    recommended_action: str
    components: ComponentScores
    indicators: list[IndicatorRead]
    urls: list[UrlRead]
    attachments: list[AttachmentRead]
    header_findings: dict[str, Any]
    sender_analysis: dict[str, Any]
    language_analysis: dict[str, Any]
    top_model_factors: list[dict[str, Any]]
    sanitized_preview: str
    remote_content_blocked: bool
    created_at: datetime


class AnalysisListItem(BaseModel):
    id: str
    subject: str | None
    sender: str | None
    reply_to: str | None
    classification: str
    risk_score: float
    confidence: float
    model_version: str
    analysis_source: str
    summary: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackRequest(BaseModel):
    feedback_type: Literal["correct", "false_positive", "false_negative", "unsure"]
    suggested_label: Literal["safe", "low_risk", "suspicious", "phishing", "critical_threat"] | None = None
    notes: str | None = Field(default=None, max_length=4000)


class FeedbackRead(BaseModel):
    id: str
    analysis_id: str
    feedback_type: str
    suggested_label: str | None
    notes: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardSummary(BaseModel):
    total_analyses: int
    safe_emails: int
    low_risk_emails: int = 0
    suspicious_emails: int
    phishing_emails: int
    critical_threats: int
    average_risk_score: float
    recent_analyses: list[AnalysisListItem]
    classification_distribution: list[dict[str, Any]]
    trend: list[dict[str, Any]]
    common_indicators: list[dict[str, Any]]
    malicious_domains: list[dict[str, Any]]
