from unittest.mock import MagicMock

import pytest

from app.services import intent_router


class _RouteResult:
    """模拟 semantic-router 的返回值。"""

    def __init__(self, name: str | None) -> None:
        self.name = name


def _make_router(result_name: str | None) -> MagicMock:
    router = MagicMock()
    router.return_value = _RouteResult(result_name)
    return router


@pytest.fixture(autouse=True)
def _mock_build_router(monkeypatch: pytest.MonkeyPatch) -> None:
    """默认让 _build_router 返回一个未命中（None）的假 router。"""
    monkeypatch.setattr(intent_router, "_build_router", lambda: _make_router(None))


def test_classify_intent_returns_route_name() -> None:
    import app.services.intent_router as module

    module._build_router = lambda: _make_router("query_project")  # type: ignore[assignment]

    assert module.classify_intent("我有哪些项目") == "query_project"


def test_classify_intent_returns_none_when_no_match() -> None:
    assert intent_router.classify_intent("随便聊聊") is None


def test_classify_intent_returns_none_when_embedding_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "embedding_api_key", None)
    monkeypatch.setattr(settings, "embedding_base_url", None)

    assert intent_router.classify_intent("我有哪些项目") is None


def test_classify_intent_swallows_router_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(_query: str) -> str:
        raise RuntimeError("embedding 服务挂了")

    monkeypatch.setattr(intent_router, "_build_router", _boom)

    # 异常时不抛，返回 None 走 LLM 兜底
    assert intent_router.classify_intent("我有哪些项目") is None
