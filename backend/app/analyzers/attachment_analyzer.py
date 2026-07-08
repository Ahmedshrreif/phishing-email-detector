from __future__ import annotations

import hashlib
from pathlib import Path

from app.analyzers.types import ParsedAttachment

HIGH_RISK_EXTENSIONS = {
    ".apk",
    ".bat",
    ".cmd",
    ".dll",
    ".dmg",
    ".exe",
    ".hta",
    ".img",
    ".iso",
    ".jar",
    ".js",
    ".lnk",
    ".msi",
    ".ps1",
    ".scr",
    ".vbs",
}
MACRO_EXTENSIONS = {".docm", ".xlsm", ".pptm"}
ARCHIVE_EXTENSIONS = {".zip", ".rar", ".7z", ".tar", ".gz"}
EXECUTABLE_MIME_HINTS = {"application/x-msdownload", "application/x-msdos-program", "application/java-archive"}


def analyze_attachment(item: ParsedAttachment) -> dict:
    filename = Path(item.filename).name
    suffixes = [suffix.lower() for suffix in Path(filename).suffixes]
    extension = suffixes[-1] if suffixes else ""
    sha256 = hashlib.sha256(item.payload or b"").hexdigest() if item.payload is not None else None
    findings = {
        "double_extension": len(suffixes) >= 2,
        "suspicious_extension": extension in HIGH_RISK_EXTENSIONS,
        "macro_enabled_document": extension in MACRO_EXTENSIONS,
        "archive": extension in ARCHIVE_EXTENSIONS,
        "executable_indicator": extension in HIGH_RISK_EXTENSIONS or (item.mime_type or "") in EXECUTABLE_MIME_HINTS,
    }
    score = 0
    if findings["suspicious_extension"]:
        score += 75
    if findings["macro_enabled_document"]:
        score += 45
    if findings["archive"]:
        score += 25
    if findings["double_extension"]:
        score += 20
    if findings["executable_indicator"]:
        score += 20
    score = min(100, score)
    risk_level = "critical" if score >= 80 else "high" if score >= 60 else "medium" if score >= 35 else "low" if score else "informational"
    return {
        "filename": filename,
        "mime_type": item.mime_type,
        "extension": extension,
        "file_size": len(item.payload or b""),
        "sha256": sha256,
        "risk_level": risk_level,
        "risk_score": float(score),
        "findings": findings,
    }


def analyze_attachments(items: list[ParsedAttachment]) -> tuple[list[dict], float, list[dict]]:
    results = [analyze_attachment(item) for item in items]
    indicators: list[dict] = []
    for result in results:
        findings = result["findings"]
        if findings["suspicious_extension"] or findings["macro_enabled_document"] or findings["double_extension"]:
            indicators.append(
                {
                    "type": "attachment_risk",
                    "title": "Suspicious attachment pattern",
                    "severity": "high" if result["risk_score"] >= 60 else "medium",
                    "explanation": "The attachment was not executed. Metadata indicates it may require sandbox analysis.",
                    "evidence": result["filename"],
                    "score_contribution": min(10, result["risk_score"] / 10),
                }
            )
    score = max((result["risk_score"] for result in results), default=0.0)
    return results, float(score), indicators
