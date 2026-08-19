from unittest.mock import MagicMock

import pytest

from app.core.config import settings
from app.services import graph_draft_service as module
from app.services.graph_draft_service import (
    DraftEdge,
    DraftNode,
    GraphDraft,
)


class _Response:
    """模拟 LLM 响应：只有 .content 字符串。"""

    def __init__(self, content: str) -> None:
        self.content = content


def _draft() -> GraphDraft:
    return GraphDraft(
        title="测试草稿",
        nodes=[
            DraftNode(id="n1", label="张三"),
            DraftNode(id="n2", label="星辰科技"),
            DraftNode(id="n3", label="李四"),
        ],
        edges=[
            DraftEdge(id="e1", source="n1", target="n2", label="任职于"),
            DraftEdge(id="e2", source="n3", target="n2", label="任职于"),
        ],
    )


def _set_llm_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr(settings, "llm_base_url", "https://test/v1")


def _mock_extract_llm(
    monkeypatch: pytest.MonkeyPatch, llm: MagicMock
) -> None:
    monkeypatch.setattr(module, "_create_extract_llm", lambda: llm)


# ---- looks_like_material ----

def test_looks_like_material_short_instruction_is_false() -> None:
    assert module.looks_like_material("帮我建一个知识图谱") is False


def test_looks_like_material_long_material_is_true() -> None:
    text = "张三任职于星辰科技，负责产品研发。李四也是星辰科技的工程师，两人是同事。"
    assert module.looks_like_material(text) is True


def test_looks_like_material_blank_is_false() -> None:
    assert module.looks_like_material("   ") is False


# ---- extract_graph_draft ----

def test_extract_graph_draft_via_structured_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_llm_config(monkeypatch)
    llm = MagicMock()
    structured = MagicMock()
    structured.invoke.return_value = _draft()
    llm.with_structured_output.return_value = structured
    _mock_extract_llm(monkeypatch, llm)

    draft = module.extract_graph_draft("某素材")
    assert draft is not None
    assert len(draft.nodes) == 3
    assert len(draft.edges) == 2


def test_extract_graph_draft_falls_back_to_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_llm_config(monkeypatch)
    llm = MagicMock()
    # 模型不支持结构化输出 → 走 prompt + JSON 解析兜底
    llm.with_structured_output.side_effect = RuntimeError("not supported")
    llm.invoke.return_value = _Response(
        '{"title": "t", "nodes": [{"id": "n1", "label": "a"},'
        '{"id": "n2", "label": "b"}],'
        '"edges": [{"id": "e1", "source": "n1", "target": "n2", "label": "r"}]}'
    )
    _mock_extract_llm(monkeypatch, llm)

    draft = module.extract_graph_draft("某素材")
    assert draft is not None
    assert [node.label for node in draft.nodes] == ["a", "b"]


def test_extract_graph_draft_tolerates_json_fence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_llm_config(monkeypatch)
    llm = MagicMock()
    llm.with_structured_output.side_effect = RuntimeError("not supported")
    llm.invoke.return_value = _Response(
        "好的，以下是 JSON：\n```json\n"
        '{"title": "t", "nodes": [{"id": "n1", "label": "a"},'
        '{"id": "n2", "label": "b"}], "edges": []}\n'
        "```"
    )
    _mock_extract_llm(monkeypatch, llm)

    draft = module.extract_graph_draft("某素材")
    assert draft is not None
    assert draft.title == "t"


def test_extract_graph_draft_returns_none_on_unparseable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_llm_config(monkeypatch)
    llm = MagicMock()
    llm.with_structured_output.side_effect = RuntimeError("not supported")
    llm.invoke.return_value = _Response("这完全不是 JSON")
    _mock_extract_llm(monkeypatch, llm)

    assert module.extract_graph_draft("某素材") is None


def test_extract_graph_draft_returns_none_on_too_few_nodes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_llm_config(monkeypatch)
    llm = MagicMock()
    llm.with_structured_output.side_effect = RuntimeError("not supported")
    llm.invoke.return_value = _Response('{"title": "t", "nodes": [], "edges": []}')
    _mock_extract_llm(monkeypatch, llm)

    assert module.extract_graph_draft("某素材") is None


def test_extract_graph_draft_returns_none_when_llm_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_llm_config(monkeypatch)
    llm = MagicMock()
    llm.with_structured_output.side_effect = RuntimeError("not supported")
    llm.invoke.side_effect = RuntimeError("llm down")
    _mock_extract_llm(monkeypatch, llm)

    assert module.extract_graph_draft("某素材") is None


def test_extract_graph_draft_returns_none_when_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "llm_api_key", None)
    monkeypatch.setattr(settings, "llm_base_url", None)

    assert module.extract_graph_draft("某素材") is None


# ---- _sanitize_draft ----

def test_sanitize_draft_filters_dangling_edges() -> None:
    draft = GraphDraft(
        title="t",
        nodes=[DraftNode(id="n1", label="a")],
        edges=[
            DraftEdge(id="e1", source="n1", target="nX", label="悬空"),
            DraftEdge(id="e2", source="n1", target="n1", label="自环"),
        ],
    )
    result = module._sanitize_draft(draft)
    assert [edge.id for edge in result.edges] == ["e2"]
