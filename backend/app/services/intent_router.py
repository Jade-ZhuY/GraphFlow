"""语义路由：用 semantic-router 做快速意图识别（embedding，毫秒级、不花 LLM 钱）。

架构：前置快速路由层。高频固定意图（查项目/建图）走 embedding 秒分类，
模糊/未定义意图返回 None，由智能体（create_agent）兜底。

配置走 .env（EMBEDDING_*），embedding 服务是硅基流动，与对话 LLM（LLM_*）独立。
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# 各意图的 utterances（纯数据，不依赖 semantic-router：
# 该包 import 很重，移到 _build_router 内部懒加载，避免拖慢启动和无关部署）
ROUTES_DATA: dict[str, list[str]] = {
    # 意图：查项目
    "query_project": [
        "我有哪些项目",
        "帮我查一下客户相关的图谱",
        "我的项目里有哪些人",
        "列出我的所有项目",
        "搜索我建的图谱",
        "我的知识图谱项目列表",
    ],
    # 意图：自动建图
    "build_graph": [
        "帮我把这段描述做成图谱",
        "根据这段话建一个知识图谱",
        "生成图谱草稿",
        "把我的内容变成图谱",
        "帮我自动建一个图谱",
    ],
    # 意图：打招呼（你是谁 / 你能做什么 等）
    "greeting": [
        "你好",
        "嗨",
        "你是谁",
        "你能做什么",
        "你有什么功能",
        "你好呀",
        "你好啊",
        "在吗",
        "你可以帮我做什么",
        "介绍一下自己",
        "你能帮我干什么",
        "你能干啥",
        "你能提供哪些帮助",
        "你的能力是什么",
        "你能帮我做什么事",
    ],
    # 意图：图谱咨询（占位路由——吸附图谱相关短句，防止误入 build_graph；
    # 命中后无专项处理，与 None 一样落回 LLM 智能体）
    "chat": [
        "RDF和属性图有什么区别",
        "怎么设计一个电影知识图谱",
        "图谱命名有什么规范",
        "知识图谱可视化有什么建议",
        "什么是知识图谱",
        "如何设计实体关系",
    ],
}


@lru_cache(maxsize=1)
def _build_router() -> Any:
    """构建路由（懒加载 + 缓存，避免每次请求重建 embedding 索引）。

    semantic_router 只在真正需要时 import（配置齐全才会走到这里）。
    注意：构造时不要传 routes（它只存 self.routes 不会写索引），
    必须由 add() 完成 embedding 入库，否则 self.routes 会重复一份。
    """
    from semantic_router import Route
    from semantic_router.encoders import LiteLLMEncoder
    from semantic_router.routers import SemanticRouter

    routes = [
        Route(name=name, utterances=utterances)
        for name, utterances in ROUTES_DATA.items()
    ]

    # hosted_vllm 前缀要求显式提供 api_base 环境变量，指向 embedding 服务
    os.environ.setdefault("HOSTED_VLLM_API_BASE", settings.embedding_base_url or "")
    encoder = LiteLLMEncoder(
        name=f"hosted_vllm/{settings.embedding_model}",
        api_key=settings.embedding_api_key,
        score_threshold=settings.embedding_score_threshold,
    )
    router = SemanticRouter(encoder=encoder)
    router.add(routes)
    return router


def classify_intent(query: str) -> str | None:
    """返回命中的意图名（query_project / build_graph / chat）；未命中返回 None。

    None 表示无匹配，调用方应交给 LLM（create_agent）兜底。
    embedding 异常时不抛错，返回 None 保证智能体主流程不受影响。
    """
    if not settings.embedding_api_key or not settings.embedding_base_url:
        return None
    try:
        router = _build_router()
        result = router(query)
        return result.name if result else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("semantic-router 意图识别失败，走 LLM 兜底: %s", exc)
        return None
