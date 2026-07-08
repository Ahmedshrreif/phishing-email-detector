from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, analyses, analyze, auth, dashboard, feedback, health, settings as settings_api
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.database.init_db import create_tables, ensure_admin
from app.database.session import SessionLocal
from app.security.headers import SecurityHeadersMiddleware
from app.security.rate_limit import InMemoryRateLimiter

configure_logging()
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        create_tables()
    if settings.auto_seed_admin and settings.admin_email and settings.admin_password:
        with SessionLocal() as db:
            ensure_admin(db, settings.admin_email, settings.admin_password, settings.admin_full_name)
    yield


app = FastAPI(
    title="PhishGuard API",
    description="AI-powered email phishing analyzer with explainable security insights.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(InMemoryRateLimiter)

app.include_router(auth.router)
app.include_router(analyze.router)
app.include_router(analyses.router)
app.include_router(feedback.router)
app.include_router(dashboard.router)
app.include_router(admin.router)
app.include_router(settings_api.router)
app.include_router(health.router)
