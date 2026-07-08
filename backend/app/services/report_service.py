from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app.models.domain import Analysis, User

DISCLAIMER = (
    "PhishGuard provides automated security guidance and may produce false positives or false negatives. "
    "High-risk decisions should be reviewed by a qualified security professional."
)


def load_analysis_for_user(db: Session, analysis_id: str, user: User) -> Analysis:
    query = db.query(Analysis).filter(Analysis.id == analysis_id)
    if user.role != "admin":
        query = query.filter(Analysis.user_id == user.id)
    analysis = query.first()
    if not analysis:
        raise ValueError("Analysis not found")
    return analysis


def analysis_json(analysis: Analysis) -> dict:
    return json.loads(analysis.raw_result_json)


def make_pdf_report(analysis: Analysis) -> bytes:
    result = analysis_json(analysis)
    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=letter, title="PhishGuard Analysis Report")
    styles = getSampleStyleSheet()
    story = [
        Paragraph("PhishGuard - Email Threat Analysis Report", styles["Title"]),
        Paragraph("Think Before You Click", styles["Italic"]),
        Spacer(1, 12),
        Paragraph(f"Report date: {datetime.now(timezone.utc).isoformat()}", styles["Normal"]),
        Paragraph(f"Analysis ID: {analysis.id}", styles["Normal"]),
        Spacer(1, 12),
        Paragraph("Summary", styles["Heading2"]),
        Paragraph(result["summary"], styles["BodyText"]),
        Spacer(1, 8),
        Table(
            [
                ["Classification", result["classification"]],
                ["Risk score", str(result["risk_score"])],
                ["Confidence", f"{result['confidence']}%"],
                ["Model version", result["model_version"]],
                ["Recommended action", result["recommended_action"]],
            ],
            colWidths=[140, 360],
        ),
        Spacer(1, 12),
        Paragraph("Threat Indicators", styles["Heading2"]),
    ]
    indicator_rows = [["Indicator", "Severity", "Evidence"]]
    for item in result.get("indicators", [])[:20]:
        indicator_rows.append([item["title"], item["severity"], item["evidence"][:120]])
    indicator_table = Table(indicator_rows, colWidths=[160, 80, 260])
    indicator_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(indicator_table)
    story.extend([Spacer(1, 12), Paragraph("URL Results", styles["Heading2"])])
    url_rows = [["Domain", "Verdict", "Risk", "Probe", "Explanation"]]
    for item in result.get("urls", [])[:20]:
        probe = "reached" if item.get("reachable") else "not reached" if item.get("live_checked") else "not run"
        url_rows.append(
            [
                str(item.get("domain") or ""),
                str(item.get("safety_verdict") or item.get("risk_level") or ""),
                str(item.get("risk_score")),
                probe,
                item.get("risk_explanation", "")[:120],
            ]
        )
    story.append(Table(url_rows, colWidths=[95, 70, 45, 70, 220]))
    story.extend(
        [
            Spacer(1, 12),
            Paragraph("Header Findings", styles["Heading2"]),
            Paragraph(json.dumps(result.get("header_findings", {}), indent=2)[:2000].replace("\n", "<br />"), styles["Code"]),
            Spacer(1, 12),
            Paragraph("Disclaimer", styles["Heading2"]),
            Paragraph(DISCLAIMER, styles["BodyText"]),
        ]
    )
    document.build(story)
    return buffer.getvalue()


def make_history_csv(analyses: list[Analysis]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Subject", "Sender", "Classification", "Risk score", "Confidence", "Source", "Model version"])
    for item in analyses:
        writer.writerow(
            [
                item.created_at.isoformat(),
                item.subject or "",
                item.sender or "",
                item.classification,
                item.risk_score,
                item.confidence,
                item.analysis_source,
                item.model_version,
            ]
        )
    return output.getvalue()
