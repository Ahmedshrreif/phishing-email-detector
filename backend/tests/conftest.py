from __future__ import annotations

import os
import shutil
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parent / ".testdata"
TEST_ROOT.mkdir(exist_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_ROOT / 'test.db'}"
os.environ["MODEL_STORAGE_PATH"] = str(TEST_ROOT / "artifacts")
os.environ["JWT_SECRET_KEY"] = "test-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["RATE_LIMIT_LOGIN_PER_MINUTE"] = "1000"
os.environ["RATE_LIMIT_ANALYSIS_PER_MINUTE"] = "1000"
os.environ["ENABLE_URL_LIVE_PROBE"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.database.init_db import create_tables, ensure_admin
from app.database.session import Base, SessionLocal, engine
from app.main import app
from app.models.domain import User
from app.security.passwords import hash_password

TEST_ADMIN_EMAIL = "test-admin@phishguard.org"
TEST_ADMIN_PASSWORD = "TestAdmin!2026"
TEST_USER_EMAIL = "test-user@phishguard.org"
TEST_USER_PASSWORD = "TestUser!2026"


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    shutil.rmtree(TEST_ROOT / "artifacts", ignore_errors=True)
    create_tables()
    with SessionLocal() as db:
        ensure_admin(db, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)
        db.add(
            User(
                full_name="Test User",
                email=TEST_USER_EMAIL,
                password_hash=hash_password(TEST_USER_PASSWORD),
                role="user",
                is_active=True,
            )
        )
        db.commit()
    yield


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def auth_header(client: TestClient, email: str = TEST_USER_EMAIL, password: str = TEST_USER_PASSWORD) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password, "remember_me": True})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def admin_header(client: TestClient) -> dict[str, str]:
    return auth_header(client, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)
