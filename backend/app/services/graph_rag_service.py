"""GraphRAG 图谱检索问答：对用户已有的知识图谱做自然语言问答。

流程：关键词提取 → 种子节点匹配 → BFS 邻居扩展 → 子图裁剪 → LLM 流式生成答案。
纯 Python 遍历，不依赖向量数据库 / Neo4j / jieba。
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import numpy as np

from app.models.graph import GraphEdgeModel, GraphNodeModel, ProjectModel

logger = logging.getLogger(__name__)

# 停用词：中文常见虚词 + 英文 + 领域噪音词
_STOP_WORDS: set[str] = {
    "的", "了", "是", "我", "你", "他", "她", "它", "我们", "你们", "他们",
    "在", "有", "和", "与", "或", "一个", "这个", "那个", "这些", "哪些", "什么",
    "怎么", "如何", "为什么", "谁", "哪里", "哪个", "多少", "吗", "呢", "吧", "啊",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
    "of", "in", "to", "for", "with", "on", "at", "by", "from", "as",
    "and", "but", "or", "yet", "so", "if", "because",
    "who", "what", "which", "when", "where", "how", "tell", "me", "about",
    "我的", "项目", "图谱", "图", "知识图谱", "里面", "中",
    "基于", "根据", "查询", "检索", "查找", "搜索", "有关", "相关", "涉及",
}

# 图遍历默认参数
_DEFAULT_TOP_K = 5
_DEFAULT_HOP_DEPTH = 1

# LLM 系统提示词
SYSTEM_PROMPT = (
    "你是知识图谱检索助手。根据图谱检索到的实体和关系，用自然语言回答用户的问题。"
    "回答简洁、准确，用中文。如果检索结果不足以回答问题，请如实说明，不要编造。"
)


def extract_keywords(query: str) -> list[str]:
    """从用户问题中提取关键词。纯 Python 正则 + 停用词过滤 + 中文滑动窗口。"""
    cleaned = re.sub(r"[\n\r,;.?!，。！？；：:""''()（）[\]{}]", " ", query.lower())
    raw_tokens = [t for t in cleaned.split() if t]

    tokens: set[str] = set()
    for token in raw_tokens:
        if token in _STOP_WORDS:
            continue
        if re.fullmatch(r"\d+", token):
            continue
        tokens.add(token)

    # 中文字符滑动窗口（1-4 字），捕获复合词
    chinese = re.sub(r"[^一-龥]", "", cleaned)
    for i in range(len(chinese)):
        for length in range(1, 5):
            if i + length <= len(chinese):
                sub = chinese[i : i + length]
                if sub not in _STOP_WORDS:
                    tokens.add(sub)

    return list(tokens)


def match_nodes(
    nodes: list[GraphNodeModel],
    keywords: list[str],
    top_k: int = _DEFAULT_TOP_K,
) -> list[GraphNodeModel]:
    """关键词匹配节点，按得分排序，返回 topK 个种子节点。"""
    scored: list[tuple[GraphNodeModel, int]] = []
    for node in nodes:
        score = 0
        label_lower = node.label.lower()
        for kw in keywords:
            if kw in label_lower:
                score += 10
            if node.rdf_type and kw in node.rdf_type.lower():
                score += 5
            if node.uri and kw in node.uri.lower():
                score += 2
            if node.properties:
                for k, v in node.properties.items():
                    if kw in str(k).lower() or kw in str(v).lower():
                        score += 3
        if score > 0:
            scored.append((node, score))
    scored.sort(key=lambda item: item[1], reverse=True)
    return [node for node, _ in scored[:top_k]]


# ---- 语义匹配（embedding）----


def _get_embedding(texts: list[str]) -> list[list[float]]:
    """调 bge-m3 批量 embedding，返回向量列表。"""
    import litellm

    from app.core.config import settings

    os.environ.setdefault("HOSTED_VLLM_API_BASE", settings.embedding_base_url or "")
    os.environ.setdefault("HOSTED_VLLM_API_KEY", settings.embedding_api_key or "")

    model = f"hosted_vllm/{settings.embedding_model}"
    response = litellm.embedding(model=model, input=texts)
    return [d["embedding"] for d in response.data]  # type: ignore[index]


def match_nodes_semantic(
    nodes: list[GraphNodeModel],
    query: str,
    top_k: int = _DEFAULT_TOP_K,
) -> list[GraphNodeModel]:
    """语义匹配节点：embedding + 余弦相似度，返回 topK。"""
    if not nodes:
        return []

    from app.core.config import settings

    if not settings.embedding_api_key or not settings.embedding_base_url:
        return []

    try:
        labels = [node.label for node in nodes]
        all_texts = [query] + labels
        all_vecs = _get_embedding(all_texts)
        query_vec = np.array(all_vecs[0])
        label_vecs = np.array(all_vecs[1:])

        # 余弦相似度
        query_norm = query_vec / (np.linalg.norm(query_vec) + 1e-8)
        label_norms = label_vecs / (np.linalg.norm(label_vecs, axis=1, keepdims=True) + 1e-8)
        similarities = np.dot(label_norms, query_norm)

        # 取 topK 且相似度 > 0.5
        scored: list[tuple[GraphNodeModel, float]] = []
        for i, sim in enumerate(similarities):
            if sim > 0.5:
                scored.append((nodes[i], float(sim)))
        scored.sort(key=lambda item: item[1], reverse=True)
        return [node for node, _ in scored[:top_k]]
    except Exception as exc:  # noqa: BLE001
        logger.warning("语义匹配失败，退回纯关键词: %s", exc)
        return []


def expand_neighbors(
    seed_ids: set[str],
    edges: list[GraphEdgeModel],
    hop_depth: int = _DEFAULT_HOP_DEPTH,
) -> tuple[set[str], list[GraphEdgeModel]]:
    """BFS 邻居扩展：从种子节点出发，沿边走 hop_depth 跳。"""
    reached: set[str] = set(seed_ids)
    included_edges: list[GraphEdgeModel] = []

    for _ in range(hop_depth):
        next_ids: set[str] = set()
        for edge in edges:
            source_in = edge.source in reached
            target_in = edge.target in reached
            if source_in or target_in:
                if edge not in included_edges:
                    included_edges.append(edge)
                if source_in:
                    next_ids.add(edge.target)
                if target_in:
                    next_ids.add(edge.source)
        reached.update(next_ids)

    return reached, included_edges


def build_subgraph(
    project: ProjectModel,
    keywords: list[str],
    query: str,
    top_k: int = _DEFAULT_TOP_K,
    hop_depth: int = _DEFAULT_HOP_DEPTH,
) -> dict[str, Any]:
    """串联关键词匹配 + 语义匹配 + 邻居扩展，返回子图。"""
    # 关键词匹配
    keyword_nodes = match_nodes(project.nodes, keywords, top_k)
    # 语义匹配（embedding 补盲区）
    semantic_nodes = match_nodes_semantic(project.nodes, query, top_k)
    # 合并去重（先关键词后语义，保持关键词排前面）
    seen_ids: set[str] = set()
    merged: list[GraphNodeModel] = []
    for node in keyword_nodes + semantic_nodes:
        if node.id not in seen_ids:
            seen_ids.add(node.id)
            merged.append(node)
    matched_nodes = merged[:top_k]

    seed_ids = {node.id for node in matched_nodes}

    reached_ids, included_edges = expand_neighbors(
        seed_ids, project.edges, hop_depth
    )

    node_map = {node.id: node for node in project.nodes}
    subgraph_nodes = [node_map[nid] for nid in reached_ids if nid in node_map]
    expanded_ids = reached_ids - seed_ids
    expanded_nodes = [
        node_map[nid] for nid in expanded_ids if nid in node_map
    ]

    return {
        "matchedNodes": _nodes_to_schema(matched_nodes),
        "matchedEdges": _edges_to_schema(
            [e for e in included_edges
             if e.source in seed_ids or e.target in seed_ids]
        ),
        "expandedNodes": _nodes_to_schema(expanded_nodes),
        "subgraph": {
            "nodes": _nodes_to_schema(subgraph_nodes),
            "edges": _edges_to_schema(included_edges),
        },
        "keywords": keywords,
    }


def _build_llm_prompt(project_name: str, subgraph: dict[str, Any], query: str) -> str:
    """把子图结构化数据 + 用户问题拼成 LLM prompt。"""
    nodes = subgraph["subgraph"]["nodes"]
    edges = subgraph["subgraph"]["edges"]
    matched = subgraph["matchedNodes"]

    parts = [f"项目名称：{project_name}"]
    if matched:
        parts.append(f"直接匹配的实体：{', '.join(n['label'] for n in matched)}")
    if nodes:
        node_lines = [
            f"  - {n['label']}"
            + (f"（类型：{n['rdfType']}）" if n.get("rdfType") else "")
            for n in nodes[:15]
        ]
        parts.append(f"子图实体（{len(nodes)} 个）：\n" + "\n".join(node_lines))
    if edges:
        edge_lines = []
        for e in edges[:15]:
            src = next((n["label"] for n in nodes if n["id"] == e["source"]), e["source"])
            tgt = next((n["label"] for n in nodes if n["id"] == e["target"]), e["target"])
            edge_lines.append(f"  {src} —{e['label']}→ {tgt}")
        parts.append(f"子图关系（{len(edges)} 条）：\n" + "\n".join(edge_lines))
    parts.append(f"\n用户问题：{query}")
    return "\n".join(parts)


async def stream_answer(
    project_name: str,
    subgraph: dict[str, Any],
    query: str,
) -> Any:
    """异步生成器，逐 token 产出 SSE 帧 + subgraph 帧 + [DONE]。

    调用方用 StreamingResponse 包装此生成器。
    """
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    from app.core.config import settings

    # 先发 subgraph 帧（前端即刻渲染子图预览）
    subgraph_payload = json.dumps(
        {"type": "subgraph", "data": subgraph},
        ensure_ascii=False,
    )
    yield f"data: {subgraph_payload}\n\n"

    # LLM 流式生成答案
    prompt = _build_llm_prompt(project_name, subgraph, query)
    llm = ChatOpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        streaming=True,
    )
    try:
        async for chunk in llm.astream(
            [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]
        ):
            text = chunk.content
            if text:
                payload = json.dumps(
                    {"type": "chunk", "content": text},
                    ensure_ascii=False,
                )
                yield f"data: {payload}\n\n"
    except Exception as exc:  # noqa: BLE001
        logger.warning("GraphRAG LLM 生成失败: %s", exc)
        payload = json.dumps(
            {"type": "error", "message": str(exc)},
            ensure_ascii=False,
        )
        yield f"data: {payload}\n\n"

    yield "data: [DONE]\n\n"


def _nodes_to_schema(nodes: list[GraphNodeModel]) -> list[dict[str, Any]]:
    return [
        {
            "id": node.id,
            "label": node.label,
            "x": node.x,
            "y": node.y,
            "uri": node.uri,
            "rdfType": node.rdf_type,
            "properties": node.properties,
        }
        for node in nodes
    ]


def _edges_to_schema(edges: list[GraphEdgeModel]) -> list[dict[str, Any]]:
    return [
        {
            "id": edge.id,
            "source": edge.source,
            "target": edge.target,
            "label": edge.label,
            "predicate": edge.predicate,
            "properties": edge.properties,
        }
        for edge in edges
    ]


# ---- 多项目检索 ----

_MULTI_PROJECT_TOP_N = 3


def query_all_projects(
    projects: list[ProjectModel],
    query: str,
    top_k: int = _DEFAULT_TOP_K,
    hop_depth: int = _DEFAULT_HOP_DEPTH,
) -> dict[str, Any]:
    """遍历所有项目，分别检索，按匹配度排序取 topN。"""
    keywords = extract_keywords(query)
    project_results: list[dict[str, Any]] = []

    for project in projects:
        subgraph = build_subgraph(project, keywords, query, top_k, hop_depth)
        match_count = (
            len(subgraph["matchedNodes"]) + len(subgraph["matchedEdges"])
        )
        if match_count > 0:
            project_results.append({
                "projectId": project.id,
                "projectName": project.name,
                "matchCount": match_count,
                "subgraph": subgraph,
            })

    project_results.sort(key=lambda r: r["matchCount"], reverse=True)
    top_results = project_results[:_MULTI_PROJECT_TOP_N]

    # 合并子图：跨项目汇总节点和边
    all_nodes: list[dict[str, Any]] = []
    all_edges: list[dict[str, Any]] = []
    for r in top_results:
        for node in r["subgraph"]["subgraph"]["nodes"]:
            node["_projectName"] = r["projectName"]
        all_nodes.extend(r["subgraph"]["subgraph"]["nodes"])
        all_edges.extend(r["subgraph"]["subgraph"]["edges"])

    return {
        "results": top_results,
        "totalProjects": len(project_results),
        "combinedSubgraph": {
            "nodes": all_nodes,
            "edges": all_edges,
        },
        "keywords": keywords,
    }


def _build_multi_llm_prompt(data: dict[str, Any], query: str) -> str:
    """多项目汇总 prompt。"""
    parts = []
    results = data.get("results", [])
    total = data.get("totalProjects", len(results))

    if not results:
        parts.append(f"在 {total} 个项目中未找到匹配内容。")
    else:
        parts.append(
            f"在 {total} 个项目中检索到 {len(results)} 个有匹配的项目："
        )
        for r in results:
            sg = r["subgraph"]
            parts.append(
                f"\n【{r['projectName']}】匹配 {r['matchCount']} 项，"
                f"子图共 {len(sg['subgraph']['nodes'])} 个实体、"
                f"{len(sg['subgraph']['edges'])} 条关系"
            )
            nodes = sg["subgraph"]["nodes"]
            edges = sg["subgraph"]["edges"]
            if nodes:
                node_lines = [
                    f"  - {n['label']}"
                    + (f"（{n.get('rdfType','')}）" if n.get("rdfType") else "")
                    for n in nodes[:10]
                ]
                parts.append("\n".join(node_lines))
            if edges:
                edge_lines = []
                for e in edges[:10]:
                    src = next(
                        (n["label"] for n in nodes if n["id"] == e["source"]),
                        e["source"],
                    )
                    tgt = next(
                        (n["label"] for n in nodes if n["id"] == e["target"]),
                        e["target"],
                    )
                    edge_lines.append(f"  {src} —{e['label']}→ {tgt}")
                parts.append("\n".join(edge_lines))

    parts.append(f"\n用户问题：{query}")
    parts.append(
        "\n请综合所有项目的信息回答。如果某个项目没有相关信息，"
        "不要编造。可以按项目分别说明。"
    )
    return "\n".join(parts)


async def stream_multi_answer(
    data: dict[str, Any],
    query: str,
) -> Any:
    """多项目 SSE 流式生成器。"""
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    from app.core.config import settings

    subgraph_payload = json.dumps(
        {"type": "subgraph", "data": data},
        ensure_ascii=False,
    )
    yield f"data: {subgraph_payload}\n\n"

    prompt = _build_multi_llm_prompt(data, query)
    llm = ChatOpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        streaming=True,
    )
    try:
        async for chunk in llm.astream(
            [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]
        ):
            text = chunk.content
            if text:
                payload = json.dumps(
                    {"type": "chunk", "content": text},
                    ensure_ascii=False,
                )
                yield f"data: {payload}\n\n"
    except Exception as exc:  # noqa: BLE001
        logger.warning("GraphRAG 多项目 LLM 生成失败: %s", exc)
        payload = json.dumps(
            {"type": "error", "message": str(exc)},
            ensure_ascii=False,
        )
        yield f"data: {payload}\n\n"

    yield "data: [DONE]\n\n"