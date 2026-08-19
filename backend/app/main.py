from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_exception_handlers
from app.api.routes.assistant import router as assistant_router
from app.api.routes.auth import router as auth_router
from app.api.routes.graphrag import router as graphrag_router
from app.api.routes.projects import router as projects_router
from app.core.config import settings
from app.db.session import init_db
from app.schemas.common import ApiResponse


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    # 预热语义路由：提前构建 embedding 索引，把首次批量 embedding
    # 的延迟从"用户第一条消息"挪到"后端启动时"，避免首请求等 9s。
    import asyncio

    from app.services.intent_router import _build_router

    try:
        await asyncio.to_thread(_build_router)
    except Exception:
        # embedding 未配置或不可用，运行时再兜底
        pass
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(assistant_router, prefix="/api/assistant", tags=["assistant"])
app.include_router(graphrag_router, prefix="/api/graphrag", tags=["graphrag"])


@app.get("/api/health", response_model=ApiResponse[dict[str, str]], tags=["system"])
async def health_check() -> ApiResponse[dict[str, str]]:
    return ApiResponse(data={"status": "ok"})
