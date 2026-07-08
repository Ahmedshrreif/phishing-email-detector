from __future__ import annotations

import argparse

from app.database.init_db import create_tables, ensure_admin
from app.database.session import SessionLocal


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--full-name", default="PhishGuard Admin")
    args = parser.parse_args()
    create_tables()
    with SessionLocal() as db:
        user = ensure_admin(db, args.email, args.password, args.full_name)
        print(f"Admin ready: {user.email}")


if __name__ == "__main__":
    main()
