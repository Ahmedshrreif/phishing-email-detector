from __future__ import annotations

from sqlalchemy import Column, MetaData, String, Table, inspect, select
from sqlalchemy.orm import Session

from app.database.session import Base, engine
from app.models import domain  # noqa: F401
from app.security.passwords import hash_password
from app.models.domain import User

INITIAL_ALEMBIC_REVISION = "0001_initial_schema"


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    stamp_initial_revision_if_unversioned()


def stamp_initial_revision_if_unversioned() -> None:
    metadata = MetaData()
    version_table = Table("alembic_version", metadata, Column("version_num", String(32), nullable=False))
    with engine.begin() as connection:
        existing_tables = set(inspect(connection).get_table_names())
        app_tables = set(Base.metadata.tables)
        if not app_tables.issubset(existing_tables):
            return
        if "alembic_version" not in existing_tables:
            version_table.create(bind=connection)
            connection.execute(version_table.insert().values(version_num=INITIAL_ALEMBIC_REVISION))
            return
        current_revision = connection.execute(select(version_table.c.version_num)).scalar()
        if not current_revision:
            connection.execute(version_table.insert().values(version_num=INITIAL_ALEMBIC_REVISION))


def ensure_admin(db: Session, email: str, password: str, full_name: str = "PhishGuard Admin", *, reset_password: bool = False) -> User:
    existing = db.query(User).filter(User.email == email.lower()).first()
    if existing:
        existing.full_name = full_name
        if reset_password:
            existing.password_hash = hash_password(password)
        existing.role = "admin"
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return existing
    user = User(
        full_name=full_name,
        email=email.lower(),
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
