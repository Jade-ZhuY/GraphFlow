from typing import Annotated

import jwt
from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import ExpiredSignatureError
from jwt.exceptions import InvalidTokenError
from sqlalchemy.orm import Session

from app.api.errors import ApiException
from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.auth import AuthSessionModel, UserModel
from app.repositories.auth_repository import AuthRepository

bearer_scheme = HTTPBearer(auto_error=False)


def get_auth_repository(db: Annotated[Session, Depends(get_db)]) -> AuthRepository:
    return AuthRepository(db)


def get_current_session(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    repository: Annotated[AuthRepository, Depends(get_auth_repository)],
) -> tuple[UserModel, AuthSessionModel]:
    headers = {"WWW-Authenticate": "Bearer"}
    if credentials is None:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=40102,
            message="未登录或登录状态失效",
            headers=headers,
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except ExpiredSignatureError as exc:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=40103,
            message="Access Token 已过期",
            headers=headers,
        ) from exc
    except (InvalidTokenError, jwt.PyJWTError) as exc:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=40102,
            message="未登录或登录状态失效",
            headers=headers,
        ) from exc

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    token_type = payload.get("typ")
    if not isinstance(user_id, str) or not isinstance(session_id, str):
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=40102,
            message="未登录或登录状态失效",
            headers=headers,
        )
    if token_type != settings.access_token_type:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=40102,
            message="未登录或登录状态失效",
            headers=headers,
        )

    user = repository.get_user_by_id(user_id)
    session = repository.get_session_by_id(session_id)
    if user is None or session is None or session.user_id != user.id:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=40102,
            message="未登录或登录状态失效",
            headers=headers,
        )
    if user.status != "active" or session.is_revoked_or_expired:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=40102,
            message="未登录或登录状态失效",
            headers=headers,
        )
    return user, session


def get_current_user(
    current_session: Annotated[
        tuple[UserModel, AuthSessionModel],
        Depends(get_current_session),
    ],
) -> UserModel:
    return current_session[0]
