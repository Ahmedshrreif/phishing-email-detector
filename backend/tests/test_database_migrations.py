from __future__ import annotations

from sqlalchemy import text

from app.database.init_db import INITIAL_ALEMBIC_REVISION
from app.database.session import engine


def test_auto_created_schema_is_alembic_stamped() -> None:
    with engine.connect() as connection:
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()

    assert revision == INITIAL_ALEMBIC_REVISION
