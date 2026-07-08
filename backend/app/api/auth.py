from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.domain import AuditLog, User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserRead,
)
from app.security.dependencies import get_current_user
from app.security.passwords import hash_password, is_strong_password, verify_password
from app.security.tokens import create_access_token, create_refresh_token, decode_token

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse)
def register(request: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = request.email.lower()
    if not is_strong_password(request.password):
        raise HTTPException(status_code=400, detail="Password must include uppercase, lowercase, number, and symbol")
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(full_name=request.full_name, email=email, password_hash=hash_password(request.password), role="user")
    db.add(user)
    db.flush()
    db.add(AuditLog(user_id=user.id, action="auth.registered", entity_type="user", entity_id=user.id))
    db.commit()
    db.refresh(user)
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
        user=UserRead.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == request.email.lower()).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    user.last_login_at = datetime.now(timezone.utc)
    db.add(AuditLog(user_id=user.id, action="auth.login", entity_type="user", entity_id=user.id))
    db.commit()
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
        user=UserRead.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        payload = decode_token(request.refresh_token)
    except InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
        user=UserRead.model_validate(user),
    )


@router.post("/logout", response_model=MessageResponse)
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageResponse:
    db.add(AuditLog(user_id=user.id, action="auth.logout", entity_type="user", entity_id=user.id))
    db.commit()
    return MessageResponse(message="Logged out. Remove local access and refresh tokens on the client.")


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    request: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if not verify_password(request.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if not is_strong_password(request.new_password):
        raise HTTPException(status_code=400, detail="Password must include uppercase, lowercase, number, and symbol")
    user.password_hash = hash_password(request.new_password)
    db.add(AuditLog(user_id=user.id, action="auth.password_changed", entity_type="user", entity_id=user.id))
    db.commit()
    return MessageResponse(message="Password changed")


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)) -> MessageResponse:
    user = db.query(User).filter(User.email == request.email.lower()).first()
    if user:
        db.add(AuditLog(user_id=user.id, action="auth.password_reset_requested", entity_type="user", entity_id=user.id))
        db.commit()
    return MessageResponse(message="If the account exists, a password reset workflow has been recorded for the administrator.")
