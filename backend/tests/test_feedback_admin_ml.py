from __future__ import annotations

from tests.conftest import TEST_USER_EMAIL, TEST_USER_PASSWORD, admin_header, auth_header


def _analysis_id(client, headers):
    response = client.post(
        "/api/analyze/url",
        headers=headers,
        json={"urls": ["http://login-paypal-security.example.test/verify"]},
    )
    assert response.status_code == 200, response.text
    return response.json()["analysis_id"]


def test_feedback_requires_admin_approval(client):
    user_headers = auth_header(client)
    analysis_id = _analysis_id(client, user_headers)
    feedback = client.post(
        f"/api/analyses/{analysis_id}/feedback",
        headers=user_headers,
        json={"feedback_type": "false_negative", "suggested_label": "phishing", "notes": "Looks dangerous"},
    )
    assert feedback.status_code == 200, feedback.text
    feedback_id = feedback.json()["id"]
    admin_headers = admin_header(client)
    approved = client.post(f"/api/admin/feedback/{feedback_id}/approve", headers=admin_headers, json={"dataset_version": "verified-feedback"})
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"


def test_admin_access_control(client):
    user_headers = auth_header(client)
    denied = client.get("/api/admin/users", headers=user_headers)
    assert denied.status_code == 403
    allowed = client.get("/api/admin/users", headers=admin_header(client))
    assert allowed.status_code == 200


def test_admin_feedback_rejection_requires_reason(client):
    user_headers = auth_header(client)
    analysis_id = _analysis_id(client, user_headers)
    feedback = client.post(
        f"/api/analyses/{analysis_id}/feedback",
        headers=user_headers,
        json={"feedback_type": "false_positive", "suggested_label": "safe", "notes": "Looks harmless"},
    )
    assert feedback.status_code == 200, feedback.text
    feedback_id = feedback.json()["id"]
    admin_headers = admin_header(client)

    missing_reason = client.post(f"/api/admin/feedback/{feedback_id}/reject", headers=admin_headers, json={"notes": ""})
    assert missing_reason.status_code == 400

    rejected = client.post(f"/api/admin/feedback/{feedback_id}/reject", headers=admin_headers, json={"notes": "Insufficient evidence"})
    assert rejected.status_code == 200, rejected.text
    body = rejected.json()
    assert body["status"] == "rejected"
    assert body["reviewed_by"]
    assert body["reviewed_at"]


def test_admin_user_management_actions(client):
    admin_headers = admin_header(client)
    users = client.get("/api/admin/users", headers=admin_headers)
    assert users.status_code == 200, users.text
    target = next(item for item in users.json() if item["email"] == TEST_USER_EMAIL)

    managed_email = "managed-user@phishguard.org"
    updated = client.patch(
        f"/api/admin/users/{target['id']}",
        headers=admin_headers,
        json={"full_name": "Managed User", "email": managed_email},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["full_name"] == "Managed User"
    assert updated.json()["email"] == managed_email

    reset = client.post(
        f"/api/admin/users/{target['id']}/reset-password",
        headers=admin_headers,
        json={"new_password": "ManagedPass!2026"},
    )
    assert reset.status_code == 200, reset.text
    old_login = client.post("/api/auth/login", json={"email": managed_email, "password": TEST_USER_PASSWORD, "remember_me": True})
    assert old_login.status_code == 401
    user_headers = auth_header(client, managed_email, "ManagedPass!2026")

    _analysis_id(client, user_headers)
    cleared = client.delete(f"/api/admin/users/{target['id']}/analyses", headers=admin_headers)
    assert cleared.status_code == 200, cleared.text
    assert "Deleted 1 analyses" in cleared.json()["message"]

    disabled = client.patch(f"/api/admin/users/{target['id']}", headers=admin_headers, json={"is_active": False})
    assert disabled.status_code == 200, disabled.text
    blocked_login = client.post("/api/auth/login", json={"email": managed_email, "password": "ManagedPass!2026", "remember_me": True})
    assert blocked_login.status_code == 403

    enabled = client.patch(f"/api/admin/users/{target['id']}", headers=admin_headers, json={"is_active": True})
    assert enabled.status_code == 200, enabled.text
    admin_user = client.get("/api/auth/me", headers=admin_headers).json()
    self_delete = client.delete(f"/api/admin/users/{admin_user['id']}", headers=admin_headers)
    assert self_delete.status_code == 400

    deleted = client.delete(f"/api/admin/users/{target['id']}", headers=admin_headers)
    assert deleted.status_code == 200, deleted.text
    deleted_login = client.post("/api/auth/login", json={"email": managed_email, "password": "ManagedPass!2026", "remember_me": True})
    assert deleted_login.status_code == 401


def test_model_status_available(client):
    response = client.get("/api/model/status")
    assert response.status_code == 200
    assert "available" in response.json()
