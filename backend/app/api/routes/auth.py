from typing import Annotated

from fastapi import Depends, Request, Response, status
from fastapi.routing import APIRouter

from app.api.deps import get_auth_repository, get_current_session, get_current_user
from app.api.errors import ApiException
from app.core.config import settings
from app.models.auth import AuthSessionModel, UserModel
from app.repositories.auth_repository import AuthRepository
from app.schemas.auth import AuthPayload, LoginRequest, RegisterRequest, User
from app.schemas.common import ApiResponse
from app.services.auth_service import AuthService

router = APIRouter()


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", maxsplit=1)[0].strip()
    return request.client.host if request.client else None


def _set_refresh_cookie(
    response: Response,
    *,
    refresh_token: str,
    max_age_seconds: int,
) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        max_age=max_age_seconds,
        path=settings.refresh_cookie_path,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def _auth_service(
    repository: Annotated[AuthRepository, Depends(get_auth_repository)],
) -> AuthService:
    return AuthService(repository)


@router.post(
    "/register",
    response_model=ApiResponse[AuthPayload],
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(_auth_service)],
) -> ApiResponse[AuthPayload]:
    auth_payload, refresh_token, max_age_seconds = service.register(
        email=payload.email,
        password=payload.password,
        username=payload.username,
        display_name=payload.display_name,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
        remember_me=True,
    )
    _set_refresh_cookie(
        response,
        refresh_token=refresh_token,
        max_age_seconds=max_age_seconds,
    )
    return ApiResponse(data=auth_payload)


@router.post("/login", response_model=ApiResponse[AuthPayload])
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(_auth_service)],
) -> ApiResponse[AuthPayload]:
    auth_payload, refresh_token, max_age_seconds = service.login(
        email=payload.email,
        password=payload.password,
        remember_me=payload.remember_me,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    _set_refresh_cookie(
        response,
        refresh_token=refresh_token,
        max_age_seconds=max_age_seconds,
    )
    return ApiResponse(data=auth_payload)


@router.post("/refresh", response_model=ApiResponse[AuthPayload])
async def refresh(
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(_auth_service)],
) -> ApiResponse[AuthPayload]:
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if not refresh_token:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=40102,
            message="登录状态已失效，请重新登录",
        )

    auth_payload, rotated_refresh_token, max_age_seconds = service.refresh(
        refresh_token=refresh_token,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    _set_refresh_cookie(
        response,
        refresh_token=rotated_refresh_token,
        max_age_seconds=max_age_seconds,
    )
    return ApiResponse(data=auth_payload)


@router.get("/me", response_model=ApiResponse[User])
async def me(
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> ApiResponse[User]:
    return ApiResponse(data=AuthService.to_user_schema(current_user))


@router.post("/logout", response_model=ApiResponse[dict[str, bool]])
async def logout(
    response: Response,
    current_session: Annotated[
        tuple[UserModel, AuthSessionModel],
        Depends(get_current_session),
    ],
    service: Annotated[AuthService, Depends(_auth_service)],
) -> ApiResponse[dict[str, bool]]:
    _, session = current_session
    service.logout(session.id)
    _clear_refresh_cookie(response)
    return ApiResponse(data={"loggedOut": True})
