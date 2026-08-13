from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.common import ApiResponse


class ApiException(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: int,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers


def _error_response(
    *,
    status_code: int,
    code: int,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    payload = ApiResponse[None](code=code, message=message, data=None)
    return JSONResponse(
        status_code=status_code,
        content=payload.model_dump(mode="json"),
        headers=headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiException)
    async def api_exception_handler(
        _: Request,
        exc: ApiException,
    ) -> JSONResponse:
        return _error_response(
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _: Request,
        __: RequestValidationError,
    ) -> JSONResponse:
        return _error_response(
            status_code=status.HTTP_400_BAD_REQUEST,
            code=40001,
            message="请求参数错误",
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        _: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            return _error_response(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code=40102,
                message="未登录或登录状态失效",
                headers=getattr(exc, "headers", None),
            )
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return _error_response(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="资源不存在",
            )
        return _error_response(
            status_code=exc.status_code,
            code=50001,
            message=str(exc.detail or "服务器内部错误"),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, __: Exception) -> JSONResponse:
        return _error_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=50001,
            message="服务器内部错误",
        )
