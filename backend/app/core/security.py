import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

password_hash = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hash.hash("dummy-password-for-timing-protection")


def now_utc() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def verify_password_with_dummy(password: str) -> bool:
    return password_hash.verify(password, DUMMY_PASSWORD_HASH)


def create_access_token(
    *,
    user_id: str,
    session_id: str,
    role: str,
) -> tuple[str, datetime]:
    expires_at = now_utc() + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": user_id,
        "sid": session_id,
        "role": role,
        "typ": settings.access_token_type,
        "jti": uuid4().hex,
        "exp": expires_at,
        "iat": now_utc(),
    }
    encoded_jwt = jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    return encoded_jwt, expires_at


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def isoformat_z(value: datetime | None) -> str | None:
    if value is None:
        return None
    return as_utc(value).isoformat(timespec="milliseconds").replace("+00:00", "Z")
