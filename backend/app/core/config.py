from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Comm Agent API"
    environment: str = "development"
    debug: bool = False

    database_url: str = (
        "mysql+pymysql://root:1234@localhost:3306/comm_agent?charset=utf8mb4"
    )
    backend_cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
    )

    jwt_secret_key: str = "change-me-with-a-long-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    access_token_type: str = "access"

    refresh_cookie_name: str = "kg_refresh_token"
    refresh_cookie_path: str = "/api/auth"
    refresh_token_expire_days: int = 30
    short_refresh_token_expire_days: int = 1
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # LLM 智能体配置
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str = "deepseek-v4-flash-0731"
    # 对话上下文兜底裁剪条数（模型 context=256k，日常用不到，防极端超长）
    llm_history_max_messages: int = 100

    # 语义路由（意图识别）embedding 配置——硅基流动，与对话 LLM 独立
    embedding_base_url: str | None = None
    embedding_api_key: str | None = None
    embedding_model: str = "BAAI/bge-m3"
    # 语义路由命中阈值（cosine 相似度）。semantic-router 默认 0.3 过低，
    # 会把「你好」等无关中文短句误分类为固定意图；真意图句得分通常在 0.68+。
    embedding_score_threshold: float = 0.5


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
