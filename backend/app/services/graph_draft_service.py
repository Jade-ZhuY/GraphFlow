"""图谱草稿生成：从用户素材提取实体/关系，供 build_graph 意图专项处理。

命中 build_graph 后：纯指令句返回引导语；含素材则调 LLM 提取图谱草稿。
提取结果（GraphDraft）经 SSE `graph_draft` 事件发给前端预览。
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)


# 提取输出 schema：节点不含 x/y（由前端落库时布局）
class DraftNode(BaseModel):
    id: str
    label: str
    rdfType: str | None = None
    properties: dict[str, Any] | None = None


class DraftEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str
    predicate: str | None = None
    properties: dict[str, Any] | None = None


class GraphDraft(BaseModel):
    title: str
    nodes: list[DraftNode]
    edges: list[DraftEdge]


# 引导语：纯指令句/提取失败时返回，引导用户贴出素材
BUILD_GRAPH_GUIDE = (
    "我可以帮你把一段描述转换成知识图谱草稿 📋\n"
    "请把你想要建模的内容直接发给我，比如：\n"
    "『张三任职于星辰科技，负责产品研发……』\n"
    "我会从中提取实体（节点）和关系（边），生成图谱草稿供你预览保存。"
)

# 提取 prompt：约束输出格式与 id 规则
EXTRACT_SYSTEM_PROMPT = (
    "你是知识图谱建模助手。从用户提供的文本中提取实体和关系，只输出一个 JSON 对象：\n"
    "{\n"
    '  "title": "图谱草稿标题",\n'
    '  "nodes": [{"id": "n1", "label": "实体名", "rdfType": "类型(可选)",'
    ' "properties": {}}],\n'
    '  "edges": [{"id": "e1", "source": "n1", "target": "n2", "label": "关系名"'
    ', "predicate": "URI(可选)"}]\n'
    "}\n"
    "规则：\n"
    "- 节点 id 用 n1、n2…递增，边 id 用 e1、e2…递增\n"
    "- 边必须引用已存在的节点 id\n"
    "- 只输出 JSON，不要 markdown 围栏或多余文字\n"
    "- 如果文本没有可建模的实体/关系，nodes 返回空数组"
)

# 启发式阈值：消息长度超过该值视为「建模素材」而非「建图指令」
MATERIAL_MIN_LENGTH = 30


def looks_like_material(text: str) -> bool:
    """消息是否像建模素材（而非建图指令）。纯指令句通常很短。"""
    return len(text.strip()) > MATERIAL_MIN_LENGTH


def extract_graph_draft(text: str) -> GraphDraft | None:
    """调 LLM 从文本提取实体/关系。返回 GraphDraft；失败/不可建模返回 None。

    LLM 配置缺失、调用异常、JSON 解析失败或节点 < 2 时返回 None，
    调用方据此回退引导语，保证聊天主流程不受影响。
    """
    if not settings.llm_api_key or not settings.llm_base_url:
        return None
    try:
        # langchain 包 import 很重，延迟到真正需要时（与 semantic_router 同策略）
        from langchain_core.messages import HumanMessage, SystemMessage

        llm = _create_extract_llm()
        # 优先走 langchain 结构化输出（json_mode）；模型不支持则回退文本 JSON 解析
        try:
            draft = llm.with_structured_output(GraphDraft, method="json_mode").invoke(
                [HumanMessage(content=text)]
            )
        except Exception:
            response = llm.invoke(
                [
                    SystemMessage(content=EXTRACT_SYSTEM_PROMPT),
                    HumanMessage(content=text),
                ]
            )
            draft = _parse_draft_response(str(response.content))
        if draft is None or len(draft.nodes) < 2:
            return None
        return _sanitize_draft(draft)
    except Exception as exc:  # noqa: BLE001
        logger.warning("图谱草稿提取失败，走引导语兜底: %s", exc)
        return None


def _create_extract_llm():
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        temperature=0,
    )


def _parse_draft_response(content: str) -> GraphDraft | None:
    """从 LLM 输出解析 GraphDraft。容忍 markdown 围栏与前后杂质。"""
    try:
        payload = json.loads(_strip_json_fence(content))
        return GraphDraft.model_validate(payload)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("图谱草稿 JSON 解析失败: %s", exc)
        return None


def _strip_json_fence(text: str) -> str:
    """去掉 markdown 围栏，取第一对花括号包裹的 JSON 片段。"""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return match.group(0) if match else text


def _sanitize_draft(draft: GraphDraft) -> GraphDraft:
    """丢弃引用不存在节点的边（save_graph 落库时会校验，提前清理避免前端落库失败）。"""
    node_ids = {node.id for node in draft.nodes}
    draft.edges = [
        edge
        for edge in draft.edges
        if edge.source in node_ids and edge.target in node_ids
    ]
    return draft
