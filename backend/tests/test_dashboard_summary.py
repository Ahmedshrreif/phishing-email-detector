from __future__ import annotations

import json
from datetime import datetime, timezone

from app.database.session import SessionLocal
from app.models.domain import Analysis, User
from tests.conftest import TEST_USER_EMAIL, auth_header


def test_dashboard_counts_use_normalized_risk_buckets(client):
    headers = auth_header(client)
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == TEST_USER_EMAIL).one()
        for index, score in enumerate([11, 22, 35, 45, 72, 86], start=1):
            db.add(
                Analysis(
                    user_id=user.id,
                    subject=f"Bucket {index}",
                    sender="sender@example.com",
                    reply_to=None,
                    classification="suspicious",
                    risk_score=score,
                    confidence=80,
                    model_version="test",
                    analysis_source="email",
                    summary="bucket test",
                    raw_result_json=json.dumps({}),
                    created_at=datetime.now(timezone.utc),
                )
            )
        db.commit()

    response = client.get("/api/dashboard/summary", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total_analyses"] == 6
    assert body["safe_emails"] == 1
    assert body["low_risk_emails"] == 2
    assert body["suspicious_emails"] == 1
    assert body["phishing_emails"] == 1
    assert body["critical_threats"] == 1
