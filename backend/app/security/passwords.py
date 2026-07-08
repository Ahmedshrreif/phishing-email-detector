from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError


_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def is_strong_password(password: str) -> bool:
    return (
        len(password) >= 10
        and any(char.islower() for char in password)
        and any(char.isupper() for char in password)
        and any(char.isdigit() for char in password)
        and any(not char.isalnum() for char in password)
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False
