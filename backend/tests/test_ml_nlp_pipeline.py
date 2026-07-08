from __future__ import annotations

import csv
from pathlib import Path

import pytest

from ml.inference import predictor
from ml.train import train_model


FIELDNAMES = ["id", "subject", "body", "sender", "reply_to", "headers", "urls", "label", "source", "created_at", "verified"]


def _write_dataset(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            full = {field: "" for field in FIELDNAMES}
            full.update(row)
            full.setdefault("source", "test")
            full.setdefault("created_at", "2026-01-01T00:00:00Z")
            full.setdefault("verified", "true")
            writer.writerow(full)


def _training_rows() -> list[dict[str, str]]:
    safe_bodies = [
        "Your weekly team update is available in the project workspace.",
        "The meeting agenda and notes are attached in the internal portal.",
        "Your invoice receipt is ready for review in the approved billing system.",
        "The security newsletter has new password manager guidance.",
        "Your account settings were updated from the official profile page.",
        "The delivery schedule is confirmed for the office mailroom.",
        "The training reminder includes the official learning portal link.",
        "Your monthly report is ready in the dashboard.",
    ]
    phishing_bodies = [
        "Urgent verify your account password immediately at http://secure-paypal-login.example.invalid",
        "Your mailbox will be suspended within 24 hours unless you login now.",
        "Confirm your bank account credentials to avoid termination today.",
        "Act now and restore access by entering your password on the security portal.",
        "Unauthorized access detected, verify your account immediately.",
        "Payment overdue, open http://invoice-security.example.invalid and sign in.",
        "Your prize is waiting, claim your reward and confirm credentials.",
        "Administrator notice: password expires today, login to restore access.",
    ]
    rows: list[dict[str, str]] = []
    for index, body in enumerate(safe_bodies, 1):
        rows.append(
            {
                "id": f"safe-{index}",
                "subject": f"Routine update {index}",
                "body": body,
                "sender": "team@example.com",
                "reply_to": "team@example.com",
                "headers": "Authentication-Results: example.com; spf=pass; dkim=pass; dmarc=pass",
                "urls": "[]",
                "label": "safe",
            }
        )
    for index, body in enumerate(phishing_bodies, 1):
        rows.append(
            {
                "id": f"phishing-{index}",
                "subject": f"Urgent account warning {index}",
                "body": body,
                "sender": "security-alert@example.invalid",
                "reply_to": "helpdesk@unknown-domain.test",
                "headers": "Authentication-Results: example.invalid; spf=fail; dkim=fail; dmarc=fail",
                "urls": '[{"original_url":"http://secure-login.example.invalid/verify"}]',
                "label": "phishing",
            }
        )
    return rows


def test_nlp_model_trains_loads_and_scores_phishing_higher(tmp_path: Path):
    dataset = tmp_path / "verified.csv"
    _write_dataset(dataset, _training_rows())

    result = train_model(dataset, version="test-nlp-v1", activate=True)
    assert result["metrics"]["dataset_size"] == 16

    predictor.bundle = None
    phishing = predictor.predict(
        {
            "subject": "URGENT verify account",
            "body": "Your mailbox will be suspended. Login now and confirm your password at http://secure-login.example.invalid",
            "sender": "security-alert@example.invalid",
            "reply_to": "support@unknown-domain.test",
            "headers": "Authentication-Results: example.invalid; spf=fail; dkim=fail; dmarc=fail",
            "urls": [{"original_url": "http://secure-login.example.invalid"}],
        }
    )
    safe = predictor.predict(
        {
            "subject": "Weekly update",
            "body": "The project notes are ready in the official workspace.",
            "sender": "team@example.com",
            "reply_to": "team@example.com",
            "headers": "Authentication-Results: example.com; spf=pass; dkim=pass; dmarc=pass",
            "urls": [],
        }
    )

    assert phishing["model_available"] is True
    assert safe["model_available"] is True
    assert phishing["score"] > safe["score"]
    assert phishing["top_model_factors"]


def test_training_rejects_too_small_dataset(tmp_path: Path):
    dataset = tmp_path / "tiny.csv"
    _write_dataset(
        dataset,
        [
            {"id": "safe-1", "subject": "Hello", "body": "Routine update", "sender": "team@example.com", "label": "safe"},
            {"id": "phish-1", "subject": "Urgent", "body": "Verify password now", "sender": "bad@example.invalid", "label": "phishing"},
        ],
    )

    with pytest.raises(ValueError, match="at least 4 records per class"):
        train_model(dataset, version="tiny", activate=False)
