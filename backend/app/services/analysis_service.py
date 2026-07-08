from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.analyzers.attachment_analyzer import analyze_attachments
from app.analyzers.email_parser import parse_headers_only, parse_manual_email
from app.analyzers.header_analyzer import analyze_headers
from app.analyzers.language_analyzer import analyze_language
from app.analyzers.sender_analyzer import analyze_sender
from app.analyzers.types import ParsedEmail
from app.analyzers.url_analyzer import analyze_urls
from app.models.domain import AnalyzedUrl, Analysis, Attachment, AuditLog, EmailIndicator, User
from app.schemas.analysis import EmailAnalyzeRequest, HeadersAnalyzeRequest, UrlAnalyzeRequest
from ml.inference import predictor

WEIGHTS = {
    "machine_learning": 0.45,
    "urls": 0.20,
    "sender": 0.15,
    "authentication": 0.10,
    "attachments": 0.05,
    "language": 0.05,
}


def classification_for_score(score: float) -> tuple[str, str]:
    if score >= 80:
        return "critical_threat", "critical"
    if score >= 60:
        return "phishing", "high"
    if score >= 40:
        return "suspicious", "medium"
    if score >= 20:
        return "low_risk", "low"
    return "safe", "informational"


def recommended_action(classification: str) -> str:
    actions = {
        "safe": "No major phishing indicators were found. Continue normal caution and verify unexpected requests through official channels.",
        "low_risk": "Review the sender and links before clicking. Use official websites when the message asks for account or payment action.",
        "suspicious": "Do not click links until the sender is verified through a trusted channel. Forward the message to your security team if available.",
        "phishing": "Do not click links or open attachments. Report the email, preserve the original message, and verify the request outside email.",
        "critical_threat": "Quarantine or delete the message. If any credentials were entered or attachments opened, reset credentials and scan the device.",
    }
    return actions[classification]


def _confidence(model_confidence: float, parsed: ParsedEmail, indicators: list[dict], final_score: float) -> float:
    completeness = 0.55
    if parsed.analysis_text.strip():
        completeness += 0.15
    if parsed.headers:
        completeness += 0.15
    if parsed.urls:
        completeness += 0.05
    if parsed.sender_email:
        completeness += 0.10
    evidence_strength = min(100.0, 45 + len(indicators) * 8 + abs(final_score - 50) * 0.45)
    return round(max(35.0, min(99.0, model_confidence * 0.65 + evidence_strength * 0.35)) * min(1.0, completeness), 1)


def _summary(classification: str, indicators: list[dict], confidence: float) -> str:
    summary_indicators = [
        item
        for item in indicators
        if not (item.get("type") == "risk_override" and item.get("severity") == "informational")
    ]
    if not summary_indicators:
        if classification == "safe":
            return "No strong phishing indicators were found in the supplied content."
        return "The system found mixed evidence. Manual security review is recommended."
    top = sorted(summary_indicators, key=lambda item: item.get("score_contribution", 0), reverse=True)[:3]
    evidence = ", ".join(item["title"].lower() for item in top)
    intro = {
        "safe": "This email appears low risk",
        "low_risk": "This email has minor risk signals",
        "suspicious": "This email is suspicious",
        "phishing": "This email is likely phishing",
        "critical_threat": "This email is highly dangerous",
    }[classification]
    return f"{intro} because of {evidence}. Confidence: {confidence:.1f}%."


def _url_summary(url_results: list[dict]) -> str | None:
    if not url_results:
        return None
    worst = max(url_results, key=lambda item: item.get("risk_score", 0))
    unsafe_count = sum(1 for item in url_results if item.get("safety_verdict") == "unsafe")
    suspicious_count = sum(1 for item in url_results if item.get("safety_verdict") == "suspicious")
    reached_count = sum(1 for item in url_results if item.get("reachable") is True)
    if unsafe_count:
        return f"Checked {len(url_results)} URL(s). {unsafe_count} URL(s) appear unsafe. Strongest evidence: {worst.get('risk_explanation', 'high-risk URL signals were found')}"
    if suspicious_count:
        return f"Checked {len(url_results)} URL(s). {suspicious_count} URL(s) look suspicious and should be reviewed before opening."
    if reached_count:
        return f"Checked {len(url_results)} URL(s). The live probe reached {reached_count} URL(s) and found no high-risk URL indicators."
    return f"Checked {len(url_results)} URL(s). The live probe could not fully reach the destination, so manual review is recommended."


def _component_scores(ml_score: float, url_score: float, sender_score: float, auth_score: float, attachment_score: float, language_score: float, ml_confidence: float) -> dict:
    return {
        "machine_learning": {"score": round(ml_score, 1), "confidence": round(ml_confidence, 1)},
        "urls": {"score": round(url_score, 1)},
        "sender": {"score": round(sender_score, 1)},
        "authentication": {"score": round(auth_score, 1)},
        "attachments": {"score": round(attachment_score, 1)},
        "language": {"score": round(language_score, 1)},
    }


def _final_score(components: dict[str, dict[str, float]], indicators: list[dict], parsed: ParsedEmail, ml_available: bool) -> tuple[float, list[dict]]:
    active_weights = dict(WEIGHTS)
    if not ml_available:
        active_weights["machine_learning"] = 0
        remaining = sum(active_weights.values())
        active_weights = {key: value / remaining for key, value in active_weights.items()} if remaining else active_weights
    score = sum(components[key]["score"] * active_weights[key] for key in active_weights)
    overrides: list[dict] = []
    has_credential = any(item["type"] == "credential_request" for item in indicators)
    has_bad_url = components["urls"]["score"] >= 70
    has_executable = components["attachments"]["score"] >= 75
    has_impersonation = any(item["type"] in {"display_name_impersonation", "reply_to_mismatch"} for item in indicators)
    auth_failed = components["authentication"]["score"] >= 45
    if not ml_available:
        overrides.append(
            {
                "name": "Machine-learning model unavailable",
                "effect": "rule-only scoring; train and activate a verified model",
                "severity": "informational",
                "explanation": "The scoring engine used rule-based evidence because no verified ML model is active.",
            }
        )
    if has_credential and has_bad_url:
        score = max(score, 78)
        overrides.append({"name": "Credential request with deceptive link", "effect": "minimum score 78"})
    if has_executable and has_impersonation:
        score = max(score, 82)
        overrides.append({"name": "Executable attachment combined with impersonation", "effect": "minimum score 82"})
    if auth_failed and has_impersonation and has_credential:
        score = max(score, 70)
        overrides.append({"name": "Authentication failures with impersonation and credential request", "effect": "minimum score 70"})
    if auth_failed and has_bad_url and has_impersonation:
        score = max(score, 86)
        overrides.append({"name": "Authentication failures plus deceptive links and sender mismatch", "effect": "minimum score 86"})
    if parsed.headers and "dmarc=pass" in parsed.headers_raw.lower() and components["urls"]["score"] < 20 and components["sender"]["score"] < 20:
        score *= 0.85
    return round(max(0.0, min(100.0, score)), 1), overrides


def _analysis_record(parsed: ParsedEmail, url_results: list[dict], attachment_results: list[dict]) -> dict[str, Any]:
    return {
        "subject": parsed.subject,
        "body": parsed.analysis_text,
        "sender": parsed.sender_email,
        "sender_name": parsed.sender_name,
        "reply_to": parsed.reply_to,
        "return_path": parsed.return_path,
        "headers": parsed.headers_raw,
        "urls": url_results,
        "attachments": attachment_results,
        "sanitized_html": parsed.sanitized_html,
    }


def analyze_parsed_email(db: Session, user: User, parsed: ParsedEmail, privacy_mode: bool = False) -> dict[str, Any]:
    url_results, url_score = analyze_urls(parsed.urls)
    attachment_results, attachment_score, attachment_indicators = analyze_attachments(parsed.attachments)
    if parsed.source == "url":
        header_findings, auth_score, header_indicators = {}, 0.0, []
    else:
        header_findings, auth_score, header_indicators = analyze_headers(parsed.headers, parsed.received, parsed.authentication_results)
    sender_analysis, sender_score, sender_indicators = analyze_sender(
        parsed.sender_name,
        parsed.sender_email,
        parsed.reply_to,
        parsed.return_path,
        parsed.analysis_text,
        parsed.message_id,
    )
    language_analysis, language_score, language_indicators = analyze_language(parsed.analysis_text)
    indicators = sender_indicators + header_indicators + language_indicators + attachment_indicators
    for result in url_results:
        if result["risk_score"] >= 40:
            indicators.append(
                {
                    "type": "suspicious_url",
                    "title": "Suspicious URL",
                    "severity": "high" if result["risk_score"] >= 60 else "medium",
                    "explanation": result["risk_explanation"],
                    "evidence": result["original_url"],
                    "score_contribution": min(15.0, result["risk_score"] / 7),
                }
            )

    ml_result = predictor.predict(_analysis_record(parsed, url_results, attachment_results))
    components = _component_scores(
        ml_result["score"],
        url_score,
        sender_score,
        auth_score,
        attachment_score,
        language_score,
        ml_result["confidence"],
    )
    final_score, overrides = _final_score(components, indicators, parsed, bool(ml_result.get("model_available")))
    for override in overrides:
        indicators.append(
            {
                "type": "risk_override",
                "title": override["name"],
                "severity": override.get("severity", "high"),
                "explanation": override.get("explanation", "The hybrid scoring engine applied a transparent severe-evidence override."),
                "evidence": override["effect"],
                "score_contribution": 0,
            }
        )
    classification, severity = classification_for_score(final_score)
    confidence = _confidence(ml_result["confidence"], parsed, indicators, final_score)
    summary = _url_summary(url_results) if parsed.source == "url" else None
    summary = summary or _summary(classification, indicators, confidence)
    created_at = datetime.now(timezone.utc)
    result = {
        "analysis_id": str(uuid.uuid4()),
        "classification": classification,
        "risk_score": final_score,
        "confidence": confidence,
        "severity": severity,
        "model_version": ml_result["model_version"],
        "summary": summary,
        "recommended_action": recommended_action(classification),
        "components": components,
        "indicators": indicators,
        "urls": url_results,
        "attachments": [
            {
                "filename": item["filename"],
                "mime_type": item["mime_type"],
                "extension": item["extension"],
                "file_size": item["file_size"],
                "sha256": item["sha256"],
                "risk_level": item["risk_level"],
                "findings": item["findings"],
            }
            for item in attachment_results
        ],
        "header_findings": header_findings,
        "sender_analysis": sender_analysis,
        "language_analysis": language_analysis,
        "top_model_factors": ml_result["top_model_factors"],
        "sanitized_preview": parsed.sanitized_html,
        "remote_content_blocked": parsed.remote_content_blocked,
        "created_at": created_at,
    }

    if not privacy_mode:
        db_analysis = Analysis(
            user_id=user.id,
            subject=parsed.subject,
            sender=parsed.sender_email,
            reply_to=parsed.reply_to,
            classification=classification,
            risk_score=final_score,
            confidence=confidence,
            model_version=ml_result["model_version"],
            analysis_source=parsed.source,
            summary=summary,
            raw_result_json=json.dumps(_jsonable(result), default=str),
            created_at=created_at,
        )
        db.add(db_analysis)
        db.flush()
        result["analysis_id"] = db_analysis.id
        db_analysis.raw_result_json = json.dumps(_jsonable(result), default=str)
        for item in indicators:
            db.add(
                EmailIndicator(
                    analysis_id=db_analysis.id,
                    indicator_type=item["type"],
                    title=item["title"],
                    severity=item["severity"],
                    explanation=item["explanation"],
                    evidence=item["evidence"],
                    score_contribution=float(item["score_contribution"]),
                )
            )
        for item in url_results:
            db.add(
                AnalyzedUrl(
                    analysis_id=db_analysis.id,
                    original_url=item["original_url"],
                    display_text=item.get("display_text"),
                    domain=item.get("domain"),
                    risk_score=float(item["risk_score"]),
                    risk_level=item["risk_level"],
                    findings_json=json.dumps(item),
                )
            )
        for item in attachment_results:
            db.add(
                Attachment(
                    analysis_id=db_analysis.id,
                    filename=item["filename"],
                    mime_type=item["mime_type"],
                    extension=item["extension"],
                    file_size=item["file_size"],
                    sha256=item["sha256"],
                    risk_level=item["risk_level"],
                    findings_json=json.dumps(item["findings"]),
                )
            )
        db.add(AuditLog(user_id=user.id, action="analysis.created", entity_type="analysis", entity_id=db_analysis.id))
        db.commit()
    return result


def analyze_email_request(db: Session, user: User, request: EmailAnalyzeRequest) -> dict[str, Any]:
    parsed = parse_manual_email(
        request.sender_name,
        request.sender_email,
        request.reply_to,
        request.subject,
        request.body,
        request.headers,
        request.urls,
    )
    return analyze_parsed_email(db, user, parsed, privacy_mode=request.privacy_mode)


def analyze_url_request(db: Session, user: User, request: UrlAnalyzeRequest) -> dict[str, Any]:
    parsed = ParsedEmail(
        subject="URL analysis",
        plain_text="\n".join(request.urls),
        sanitized_html="<pre>" + "\n".join(request.urls) + "</pre>",
        urls=[{"original_url": url, "display_text": url} for url in request.urls],
        source="url",
    )
    return analyze_parsed_email(db, user, parsed, privacy_mode=request.privacy_mode)


def analyze_headers_request(db: Session, user: User, request: HeadersAnalyzeRequest) -> dict[str, Any]:
    parsed = parse_headers_only(request.headers)
    return analyze_parsed_email(db, user, parsed, privacy_mode=request.privacy_mode)


def _jsonable(result: dict[str, Any]) -> dict[str, Any]:
    clean = dict(result)
    clean["created_at"] = clean["created_at"].isoformat() if hasattr(clean["created_at"], "isoformat") else str(clean["created_at"])
    return clean
