from __future__ import annotations

import io
import zipfile

from tests.conftest import auth_header


def test_register_login_and_me(client):
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "Security Analyst",
            "email": "analyst@example.com",
            "password": "StrongPass!234",
            "accept_terms": True,
        },
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "analyst@example.com"


def test_paste_email_analysis_detects_phishing_and_persists(client):
    headers = auth_header(client)
    response = client.post(
        "/api/analyze/email",
        headers=headers,
        json={
            "sender_name": "Microsoft Security",
            "sender_email": "security-alert@example.invalid",
            "reply_to": "helpdesk@unknown-domain.test",
            "subject": "URGENT: Verify your account immediately",
            "body": "Your mailbox will be suspended. Verify your account password at http://office365.example.invalid.secure-login.test/login",
            "headers": "Authentication-Results: example.invalid; spf=fail; dkim=fail; dmarc=fail",
            "urls": [],
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["risk_score"] >= 60
    assert payload["classification"] in {"phishing", "critical_threat"}
    assert payload["indicators"]
    saved = client.get(f"/api/analyses/{payload['analysis_id']}", headers=headers)
    assert saved.status_code == 200


def test_eml_upload_and_report_generation(client):
    headers = auth_header(client)
    eml = (
        "From: Example Team <team@example.com>\n"
        "To: user@example.com\n"
        "Subject: Weekly update\n"
        "Authentication-Results: example.com; spf=pass; dkim=pass; dmarc=pass\n"
        "Content-Type: text/plain; charset=utf-8\n\n"
        "Hello, the weekly update is available at https://example.com/update"
    ).encode()
    response = client.post("/api/analyze/file", headers=headers, files={"file": ("message.eml", eml, "message/rfc822")})
    assert response.status_code == 200, response.text
    analysis_id = response.json()["analysis_id"]
    report = client.get(f"/api/analyses/{analysis_id}/report?format=pdf", headers=headers)
    assert report.status_code == 200
    assert report.headers["content-type"] == "application/pdf"
    assert report.content.startswith(b"%PDF")


def test_common_document_uploads_are_accepted(client):
    headers = auth_header(client)
    text_response = client.post(
        "/api/analyze/file",
        headers=headers,
        files={"file": ("notice.txt", b"Review HTTPS://WWW.GOOGLE.COM/ before opening unexpected attachments.", "text/plain")},
    )
    assert text_response.status_code == 200, text_response.text
    assert text_response.json()["urls"][0]["original_url"] == "HTTPS://WWW.GOOGLE.COM/"

    html = b"<html><body><a href='https://example.com/login'>review account</a><img src='https://example.com/pixel.png'></body></html>"
    html_response = client.post(
        "/api/analyze/file",
        headers=headers,
        files={"file": ("notice.html", html, "text/html")},
    )
    assert html_response.status_code == 200, html_response.text
    assert html_response.json()["remote_content_blocked"] is True
    assert html_response.json()["urls"][0]["original_url"] == "https://example.com/login"

    docx_buffer = io.BytesIO()
    with zipfile.ZipFile(docx_buffer, "w") as archive:
        archive.writestr(
            "word/document.xml",
            "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body><w:p><w:r><w:t>DOCX text with https://example.com/reset</w:t></w:r></w:p></w:body></w:document>",
        )
    docx_response = client.post(
        "/api/analyze/file",
        headers=headers,
        files={"file": ("notice.docx", docx_buffer.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert docx_response.status_code == 200, docx_response.text
    assert docx_response.json()["urls"][0]["original_url"] == "https://example.com/reset"

    image_response = client.post(
        "/api/analyze/file",
        headers=headers,
        files={"file": ("qr-capture.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert image_response.status_code == 200, image_response.text
    assert image_response.json()["attachments"][0]["extension"] == ".png"

    executable_response = client.post(
        "/api/analyze/file",
        headers=headers,
        files={"file": ("payload.exe", b"MZ", "application/x-msdownload")},
    )
    assert executable_response.status_code == 200, executable_response.text
    assert executable_response.json()["attachments"][0]["findings"]["suspicious_extension"] is True


def test_unsupported_upload_type_returns_clear_error(client):
    headers = auth_header(client)
    response = client.post(
        "/api/analyze/file",
        headers=headers,
        files={"file": ("payload.unknownfiletype", b"unknown", "application/octet-stream")},
    )
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]
