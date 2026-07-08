from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.domain import AnalyzedUrl, Analysis, EmailIndicator, User
from app.schemas.analysis import AnalysisListItem, DashboardSummary
from app.security.dependencies import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardSummary:
    query = db.query(Analysis)
    if user.role != "admin":
        query = query.filter(Analysis.user_id == user.id)
    analyses = query.order_by(Analysis.created_at.desc()).all()
    today = datetime.now(timezone.utc).date()
    period_start_date = today - timedelta(days=6)
    period_start = datetime.combine(period_start_date, time.min, tzinfo=timezone.utc)
    period_analyses = [item for item in analyses if _aware_datetime(item.created_at) >= period_start]
    total = len(period_analyses)
    avg = round(sum(item.risk_score for item in period_analyses) / total, 1) if total else 0.0
    distribution = Counter(_dashboard_bucket(item.risk_score) for item in period_analyses)
    trend_map: dict[str, list[float]] = {(period_start_date + timedelta(days=offset)).isoformat(): [] for offset in range(7)}
    for item in period_analyses:
        key = item.created_at.date().isoformat() if isinstance(item.created_at, datetime) else str(item.created_at)
        trend_map[key].append(item.risk_score)
    ids = [item.id for item in period_analyses]
    common_indicators = []
    malicious_domains = []
    if ids:
        indicators = db.query(EmailIndicator).filter(EmailIndicator.analysis_id.in_(ids)).all()
        common_indicators = [
            {"indicator": key, "count": value}
            for key, value in Counter(item.indicator_type for item in indicators).most_common(8)
        ]
        urls = db.query(AnalyzedUrl).filter(AnalyzedUrl.analysis_id.in_(ids), AnalyzedUrl.risk_score >= 40).all()
        ignored_domains = {"unknown", "test", "localhost", "127.0.0.1", "::1"}
        domain_stats: dict[str, dict[str, float]] = {}
        for url in urls:
            domain = (url.domain or "").strip().lower()
            if (
                not domain
                or domain in ignored_domains
                or domain.endswith(".test")
                or domain.endswith(".invalid")
                or domain.endswith(".localhost")
            ):
                continue
            stats = domain_stats.setdefault(domain, {"count": 0, "max_risk": 0.0})
            stats["count"] += 1
            stats["max_risk"] = max(stats["max_risk"], float(url.risk_score or 0))
        malicious_domains = [
            {"domain": domain, "count": int(stats["count"]), "max_risk": round(stats["max_risk"], 1)}
            for domain, stats in sorted(domain_stats.items(), key=lambda item: (item[1]["max_risk"], item[1]["count"]), reverse=True)[:8]
        ]
    return DashboardSummary(
        total_analyses=total,
        safe_emails=distribution["safe"],
        low_risk_emails=distribution["low_risk"],
        suspicious_emails=distribution["suspicious"],
        phishing_emails=distribution["phishing"],
        critical_threats=distribution["critical_threat"],
        average_risk_score=avg,
        recent_analyses=[AnalysisListItem.model_validate(item) for item in analyses[:8]],
        classification_distribution=[{"classification": key, "count": value} for key, value in distribution.items()],
        trend=[{"date": key, "average_risk": round(sum(values) / len(values), 1) if values else 0.0, "count": len(values)} for key, values in sorted(trend_map.items())],
        common_indicators=common_indicators,
        malicious_domains=malicious_domains,
    )


def _aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _dashboard_bucket(score: float) -> str:
    if score >= 80:
        return "critical_threat"
    if score >= 60:
        return "phishing"
    if score >= 40:
        return "suspicious"
    if score >= 20:
        return "low_risk"
    return "safe"


@router.get("/trends")
def trends(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    return summary(user, db).trend


@router.get("/indicators")
def indicators(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    return summary(user, db).common_indicators
