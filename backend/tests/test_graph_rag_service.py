import pytest
from app.services.graph_rag_service import (
    build_subgraph,
    expand_neighbors,
    extract_keywords,
    match_nodes,
)


class _Node:
    """模拟 GraphNodeModel，只带服务层需要的字段。"""
    def __init__(self, node_id, label, rdf_type=None, uri=None, properties=None):
        self.id = node_id
        self.label = label
        self.rdf_type = rdf_type
        self.uri = uri
        self.properties = properties
        self.x = 0
        self.y = 0


class _Edge:
    """模拟 GraphEdgeModel。"""
    def __init__(self, edge_id, source, target, label, predicate=None, properties=None):
        self.id = edge_id
        self.source = source
        self.target = target
        self.label = label
        self.predicate = predicate
        self.properties = properties


class _Project:
    """模拟 ProjectModel。"""
    def __init__(self, name, nodes, edges):
        self.name = name
        self.nodes = nodes
        self.edges = edges


# ---- extract_keywords ----


def test_extract_keywords_basic():
    keywords = extract_keywords("张三在哪个公司")
    assert "张三" in keywords
    assert "公司" in keywords
    assert "在" not in keywords  # 停用词
    assert "哪个" not in keywords  # 停用词


def test_extract_keywords_filters_stop_words():
    keywords = extract_keywords("我的项目里有哪些人")
    assert "我的" not in keywords
    assert "项目" not in keywords
    assert "哪些" not in keywords


def test_extract_keywords_english():
    keywords = extract_keywords("who is the CEO of OpenAI")
    assert "who" not in keywords
    assert "the" not in keywords
    assert "ceo" in keywords
    assert "openai" in keywords


def test_extract_keywords_pure_numbers_skipped():
    keywords = extract_keywords("123 456")
    assert "123" not in keywords
    assert "456" not in keywords


# ---- match_nodes ----


def test_match_nodes_scores_label():
    nodes = [_Node("n1", "张三"), _Node("n2", "李四"), _Node("n3", "星辰科技")]
    result = match_nodes(nodes, ["张三"])
    assert len(result) == 1
    assert result[0].id == "n1"


def test_match_nodes_scores_rdf_type():
    nodes = [_Node("n1", "张三", rdf_type="人物"), _Node("n2", "星辰科技", rdf_type="公司")]
    result = match_nodes(nodes, ["公司"])
    assert len(result) == 1
    assert result[0].id == "n2"


def test_match_nodes_top_k():
    nodes = [
        _Node("n1", "张三"),
        _Node("n2", "张三丰"),
        _Node("n3", "张三集团"),
    ]
    result = match_nodes(nodes, ["张三"], top_k=2)
    assert len(result) == 2


def test_match_nodes_no_match():
    nodes = [_Node("n1", "张三"), _Node("n2", "李四")]
    result = match_nodes(nodes, ["王五"])
    assert result == []


# ---- expand_neighbors ----


def test_expand_neighbors_1hop():
    edges = [
        _Edge("e1", "n1", "n2", "任职于"),
        _Edge("e2", "n1", "n3", "同事"),
    ]
    reached, included = expand_neighbors({"n1"}, edges, hop_depth=1)
    assert reached == {"n1", "n2", "n3"}
    assert len(included) == 2


def test_expand_neighbors_2hop():
    edges = [
        _Edge("e1", "n1", "n2", "任职于"),
        _Edge("e2", "n2", "n3", "位于"),
    ]
    reached, included = expand_neighbors({"n1"}, edges, hop_depth=2)
    assert reached == {"n1", "n2", "n3"}
    assert len(included) == 2


def test_expand_neighbors_empty_seed():
    reached, included = expand_neighbors(set(), [], hop_depth=1)
    assert reached == set()
    assert included == []


# ---- build_subgraph ----


def test_build_subgraph_integration():
    project = _Project(
        name="测试项目",
        nodes=[
            _Node("n1", "张三", "人物"),
            _Node("n2", "星辰科技", "公司"),
            _Node("n3", "李四", "人物"),
            _Node("n4", "北京", "城市"),
        ],
        edges=[
            _Edge("e1", "n1", "n2", "任职于"),
            _Edge("e2", "n1", "n3", "同事"),
            _Edge("e3", "n2", "n4", "位于"),
        ],
    )

    subgraph = build_subgraph(project, ["张三"], top_k=3, hop_depth=1)

    assert len(subgraph["matchedNodes"]) == 1
    assert subgraph["matchedNodes"][0]["label"] == "张三"
    assert len(subgraph["subgraph"]["nodes"]) == 3  # 张三 + 星辰科技 + 李四
    assert len(subgraph["subgraph"]["edges"]) == 2  # 任职于 + 同事
    node_labels = {n["label"] for n in subgraph["subgraph"]["nodes"]}
    assert "北京" not in node_labels