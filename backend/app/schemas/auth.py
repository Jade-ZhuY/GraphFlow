from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class User(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    email: EmailStr
    username: str
    display_name: str = Field(alias="displayName")
    avatar_url: str | None = Field(default=None, alias="avatarUrl")
    role: str
    status: str
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    last_login_at: str | None = Field(default=None, alias="lastLoginAt")


class AuthSession(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    user_id: str = Field(alias="userId")
    device_name: str | None = Field(default=None, alias="deviceName")
    ip_address: str | None = Field(default=None, alias="ipAddress")
    user_agent: str | None = Field(default=None, alias="userAgent")
    current: bool
    created_at: str = Field(alias="createdAt")
    last_active_at: str = Field(alias="lastActiveAt")
    expires_at: str = Field(alias="expiresAt")


class AuthPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    access_token: str = Field(alias="accessToken")
    access_token_expires_at: str = Field(alias="accessTokenExpiresAt")
    user: User
    session: AuthSession


class RegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str = Field(min_length=3, max_length=64)
    display_name: str | None = Field(default=None, alias="displayName", max_length=120)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        value = value.strip()
        if not value.replace("_", "").replace("-", "").isalnum():
            raise ValueError(
                "username can contain letters, numbers, underscores, and hyphens"
            )
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        has_letter = any(ch.isalpha() for ch in value)
        has_digit = any(ch.isdigit() for ch in value)
        if not has_letter or not has_digit:
            raise ValueError("password must contain letters and numbers")
        return value

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class LoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = Field(default=True, alias="rememberMe")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()
