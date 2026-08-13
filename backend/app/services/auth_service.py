from datetime import timedelta
from uuid import uuid4

from fastapi import status

from app.api.errors import ApiException
from app.core.config import settings
from app.core.security import (
    as_utc,
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    isoformat_z,
    now_utc,
    verify_password,
    verify_password_with_dummy,
)
from app.models.auth import AuthSessionModel, UserModel
from app.repositories.auth_repository import AuthRepository
from app.schemas.auth import AuthPayload, AuthSession, User


class AuthService:
    def __init__(self, repository: AuthRepository) -> None:
        self.repository = repository

    def register(
        self,
        *,
        email: str,
        password: str,
        username: str,
        display_name: str | None,
        user_agent: str | None,
        ip_address: str | None,
        remember_me: bool,
    ) -> tuple[AuthPayload, str, int]:
        if self.repository.get_user_by_email(email) is not None:
            raise ApiException(
                status_code=status.HTTP_409_CONFLICT,
                code=40901,
                message="邮箱已被注册",
            )
        if self.repository.get_user_by_username(username) is not None:
            raise ApiException(
                status_code=status.HTTP_409_CONFLICT,
                code=40901,
                message="用户名已被使用",
            )

        timestamp = now_utc()
        user = UserModel(
            id=f"u_{uuid4().hex}",
            email=email.lower(),
            username=username,
            display_name=display_name or username,
            avatar_url=None,
            password_hash=hash_password(password),
            role="user",
            status="active",
            created_at=timestamp,
            updated_at=timestamp,
            last_login_at=timestamp,
        )
        self.repository.add_user(user)

        session, refresh_token, max_age = self._create_session(
            user=user,
            user_agent=user_agent,
            ip_address=ip_address,
            remember_me=remember_me,
            timestamp=timestamp,
        )
        self.repository.add_session(session)
        self.repository.commit()
        self.repository.refresh(user)
        self.repository.refresh(session)
        return self._build_payload(user, session), refresh_token, max_age

    def login(
        self,
        *,
        email: str,
        password: str,
        remember_me: bool,
        user_agent: str | None,
        ip_address: str | None,
    ) -> tuple[AuthPayload, str, int]:
        user = self.repository.get_user_by_email(email)
        if user is None:
            verify_password_with_dummy(password)
            raise self._invalid_credentials()
        if not verify_password(password, user.password_hash):
            raise self._invalid_credentials()
        if user.status != "active":
            raise ApiException(
                status_code=status.HTTP_403_FORBIDDEN,
                code=40301,
                message="账号已被禁用",
            )

        timestamp = now_utc()
        user.last_login_at = timestamp
        user.updated_at = timestamp
        session, refresh_token, max_age = self._create_session(
            user=user,
            user_agent=user_agent,
            ip_address=ip_address,
            remember_me=remember_me,
            timestamp=timestamp,
        )
        self.repository.add_session(session)
        self.repository.commit()
        self.repository.refresh(user)
        self.repository.refresh(session)
        return self._build_payload(user, session), refresh_token, max_age

    def refresh(
        self,
        *,
        refresh_token: str,
        user_agent: str | None,
        ip_address: str | None,
    ) -> tuple[AuthPayload, str, int]:
        session = self.repository.get_session_by_refresh_hash(
            hash_refresh_token(refresh_token)
        )
        if session is None or session.is_revoked_or_expired:
            raise ApiException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code=40102,
                message="登录状态已失效，请重新登录",
            )
        user = self.repository.get_user_by_id(session.user_id)
        if user is None or user.status != "active":
            raise ApiException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code=40102,
                message="登录状态已失效，请重新登录",
            )

        rotated_refresh_token = create_refresh_token()
        timestamp = now_utc()
        max_age = max(1, int((as_utc(session.expires_at) - timestamp).total_seconds()))
        session.refresh_token_hash = hash_refresh_token(rotated_refresh_token)
        session.last_active_at = timestamp
        session.user_agent = user_agent or session.user_agent
        session.ip_address = ip_address or session.ip_address
        self.repository.commit()
        self.repository.refresh(user)
        self.repository.refresh(session)
        return self._build_payload(user, session), rotated_refresh_token, max_age

    def logout(self, session_id: str) -> None:
        session = self.repository.get_session_by_id(session_id)
        if session is not None and session.revoked_at is None:
            self.repository.revoke_session(session, now_utc())
            self.repository.commit()

    @staticmethod
    def to_user_schema(user: UserModel) -> User:
        return User(
            id=user.id,
            email=user.email,
            username=user.username,
            displayName=user.display_name,
            avatarUrl=user.avatar_url,
            role=user.role,
            status=user.status,
            createdAt=isoformat_z(user.created_at),
            updatedAt=isoformat_z(user.updated_at),
            lastLoginAt=isoformat_z(user.last_login_at),
        )

    @staticmethod
    def to_session_schema(session: AuthSessionModel) -> AuthSession:
        return AuthSession(
            id=session.id,
            userId=session.user_id,
            deviceName=session.device_name,
            ipAddress=session.ip_address,
            userAgent=session.user_agent,
            current=True,
            createdAt=isoformat_z(session.created_at),
            lastActiveAt=isoformat_z(session.last_active_at),
            expiresAt=isoformat_z(session.expires_at),
        )

    def _build_payload(
        self,
        user: UserModel,
        session: AuthSessionModel,
    ) -> AuthPayload:
        access_token, expires_at = create_access_token(
            user_id=user.id,
            session_id=session.id,
            role=user.role,
        )
        return AuthPayload(
            accessToken=access_token,
            accessTokenExpiresAt=isoformat_z(expires_at),
            user=self.to_user_schema(user),
            session=self.to_session_schema(session),
        )

    def _create_session(
        self,
        *,
        user: UserModel,
        user_agent: str | None,
        ip_address: str | None,
        remember_me: bool,
        timestamp,
    ) -> tuple[AuthSessionModel, str, int]:
        refresh_token = create_refresh_token()
        days = (
            settings.refresh_token_expire_days
            if remember_me
            else settings.short_refresh_token_expire_days
        )
        max_age = days * 24 * 60 * 60
        expires_at = timestamp + timedelta(days=days)
        session = AuthSessionModel(
            id=f"sess_{uuid4().hex}",
            user_id=user.id,
            refresh_token_hash=hash_refresh_token(refresh_token),
            device_name=self._device_name(user_agent),
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=timestamp,
            last_active_at=timestamp,
            expires_at=expires_at,
            revoked_at=None,
        )
        return session, refresh_token, max_age

    @staticmethod
    def _device_name(user_agent: str | None) -> str | None:
        if not user_agent:
            return None
        lowered = user_agent.lower()
        browser = "Browser"
        if "chrome" in lowered and "edg" not in lowered:
            browser = "Chrome"
        elif "safari" in lowered and "chrome" not in lowered:
            browser = "Safari"
        elif "firefox" in lowered:
            browser = "Firefox"
        elif "edg" in lowered:
            browser = "Edge"

        os_name = "Unknown"
        if "windows" in lowered:
            os_name = "Windows"
        elif "iphone" in lowered or "ipad" in lowered:
            os_name = "iOS"
        elif "mac os" in lowered or "macintosh" in lowered:
            os_name = "macOS"
        elif "android" in lowered:
            os_name = "Android"
        elif "linux" in lowered:
            os_name = "Linux"
        return f"{browser} on {os_name}"

    @staticmethod
    def _invalid_credentials() -> ApiException:
        return ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=40101,
            message="邮箱或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
