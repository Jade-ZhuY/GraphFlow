"""图谱导入导出服务：RDF(Turtle/JSON-LD) 与 PG(JSON) 的序列化/反序列化。

字段映射规则见 `docs/需求卡/图谱导入导出标准格式.md` 第 3 节。
- RDF：节点 uri→subject(无 uri 用 blank node)、rdfType→rdf:type、label→rdfs:label；
       边 predicate→谓词、label→rdfs:label。坐标 x/y 不导出。
- PG ：nodes/edges 的 properties 原样保留；x/y 不导出。
导入即新建项目，坐标缺省置中并按索引散开；解析失败不建半成品项目。
"""

from __future__ import annotations

import json
from uuid import uuid4

from fastapi import status
from rdflib import BNode, Graph, Literal, URIRef
from rdflib.namespace import RDF, RDFS

from app.api.errors import ApiException
from app.core.security import now_utc
from app.models.auth import UserModel
from app.models.graph import GraphEdgeModel, GraphNodeModel, ProjectModel
from app.repositories.project_repository import ProjectRepository

# 导出支持的格式
ExportFormat = str  # "turtle" | "jsonld" | "json"
ImportFormat = str  # "turtle" | "jsonld" | "json"

RDF_FORMATS = {"turtle", "jsonld"}
PG_FORMATS = {"json"}

# rdflib 序列化/解析格式名
RDFLIB_FORMAT_MAP = {"turtle": "turtle", "jsonld": "json-ld"}

RDF_MIME_MAP = {"turtle": "text/turtle", "jsonld": "application/ld+json"}


class GraphIOService:
    def __init__(
        self,
        repository: ProjectRepository,
    ) -> None:
        self.repository = repository

    # ---- 导出 ----

    def export_project(
        self,
        *,
        user: UserModel,
        project_id: str,
        fmt: ExportFormat,
    ) -> tuple[str, str]:
        """返回 (content, content_type)。导出需 viewer 及以上权限。格式由 fmt 决定。"""
        project = self.repository.get_project_by_id(project_id)
        if project is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="项目不存在",
            )
        # 权限：owner 或任意成员（viewer+）可导出
        is_owner = project.user_id == user.id
        is_member = (
            self.repository.get_member(project_id=project_id, user_id=user.id)
            is not None
        )
        if not is_owner and not is_member:
            raise ApiException(
                status_code=status.HTTP_403_FORBIDDEN,
                code=40301,
                message="无权限访问该项目",
            )

        if fmt in RDF_FORMATS:
            content = self._export_rdf(project, fmt)
            return content, RDF_MIME_MAP[fmt]

        if fmt in PG_FORMATS:
            content = self._export_pg_json(project)
            return content, "application/json"

        raise ApiException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code=40001,
            message="不支持的导出格式",
        )

    def _export_rdf(self, project: ProjectModel, fmt: ExportFormat) -> str:
        g = Graph()
        g.bind("rdfs", RDFS)

        # 节点 → subject；记录 id→subject 映射供边引用
        id_to_subject: dict[str, object] = {}
        for node in project.nodes:
            if node.uri:
                subject = URIRef(node.uri)
            else:
                subject = BNode(f"n_{node.id}")
            id_to_subject[node.id] = subject
            if node.rdf_type:
                g.add((subject, RDF.type, URIRef(node.rdf_type)))
            if node.label:
                g.add((subject, RDFS.label, Literal(node.label)))

        # 边 → predicate triple。边的 label 是 PG 概念，RDF 中不导出
        # （避免与 source 节点的 rdfs:label 冲突）。
        for edge in project.edges:
            source = id_to_subject.get(edge.source)
            target = id_to_subject.get(edge.target)
            if source is None or target is None:
                continue
            if edge.predicate:
                g.add((source, URIRef(edge.predicate), target))
            else:
                # 无 predicate 的边用 blank node 谓词兜底（少见）
                g.add((source, BNode(f"e_{edge.id}"), target))

        return g.serialize(format=RDFLIB_FORMAT_MAP[fmt])

    def _export_pg_json(self, project: ProjectModel) -> str:
        payload = {
            "nodes": [
                {
                    "id": node.id,
                    "label": node.label,
                    "properties": node.properties,
                }
                for node in project.nodes
            ],
            "edges": [
                {
                    "id": edge.id,
                    "source": edge.source,
                    "target": edge.target,
                    "label": edge.label,
                    "properties": edge.properties,
                }
                for edge in project.edges
            ],
        }
        return json.dumps(payload, ensure_ascii=False, indent=2)

    # ---- 导入 ----

    def import_project(
        self,
        *,
        user: UserModel,
        filename: str,
        content: bytes,
        fmt: ImportFormat,
    ) -> ProjectModel:
        try:
            if fmt in RDF_FORMATS:
                nodes, edges = self._parse_rdf(content, fmt)
            elif fmt in PG_FORMATS:
                nodes, edges = self._parse_pg_json(content)
            else:
                raise ApiException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code=40001,
                    message="不支持的导入格式",
                )
        except ApiException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message=f"文件解析失败：{exc}",
            ) from exc

        # 解析成功，建项目并写入节点边（同一事务）
        timestamp = now_utc()
        name = self._derive_name(filename)
        project = ProjectModel(
            id=f"p_{uuid4().hex}",
            user_id=user.id,
            name=name,
            description=None,
            created_at=timestamp,
            updated_at=timestamp,
        )
        self.repository.add_project(project)
        # 节点/边解析时 project_id 未知，此处补齐
        for node in nodes:
            node.project_id = project.id
        for edge in edges:
            edge.project_id = project.id
        self.repository.replace_graph(project=project, nodes=nodes, edges=edges)
        self.repository.commit()
        self.repository.refresh(project)
        return project

    def _parse_rdf(
        self, content: bytes, fmt: ImportFormat
    ) -> tuple[list[GraphNodeModel], list[GraphEdgeModel]]:
        g = Graph()
        g.parse(data=content, format=RDFLIB_FORMAT_MAP[fmt])

        # 收集所有 subject 作为节点；记录 subject→node_id
        subject_to_id: dict[object, str] = {}
        nodes: list[GraphNodeModel] = []
        edges: list[GraphEdgeModel] = []

        # 节点：每个 subject 是一个节点
        for subject in set(g.subjects()):
            if isinstance(subject, BNode):
                node_id = f"n_{uuid4().hex}"
                uri = None
            else:
                node_id = f"n_{uuid4().hex}"
                uri = str(subject)
            subject_to_id[subject] = node_id

            rdf_type = None
            label = None
            for _, pred, obj in g.triples((subject, None, None)):
                pred_str = str(pred)
                if pred_str == str(RDF.type) and isinstance(obj, URIRef):
                    rdf_type = str(obj)
                elif pred_str == str(RDFS.label) and label is None:
                    label = str(obj)

            # 坐标缺省：按节点索引散开
            idx = len(nodes)
            nodes.append(
                GraphNodeModel(
                    id=node_id,
                    project_id="",  # replace_graph 会用 project.id
                    label=label or uri or f"节点{idx + 1}",
                    x=float(100 + (idx % 5) * 120),
                    y=float(100 + (idx // 5) * 120),
                    uri=uri,
                    rdf_type=rdf_type,
                    properties=None,
                )
            )

        # 边：非 type/label 的 triple，且 object 是节点
        for subj, pred, obj in g:
            pred_str = str(pred)
            if pred_str in (str(RDF.type), str(RDFS.label)):
                continue
            source_id = subject_to_id.get(subj)
            target_id = subject_to_id.get(obj)
            if source_id is None or target_id is None:
                continue
            edges.append(
                GraphEdgeModel(
                    id=f"e_{uuid4().hex}",
                    project_id="",
                    source=source_id,
                    target=target_id,
                    label=pred_str.rsplit("/", 1)[-1].rsplit("#", 1)[-1] or "关系",
                    predicate=pred_str if isinstance(pred, URIRef) else None,
                    properties=None,
                )
            )

        return nodes, edges

    def _parse_pg_json(
        self, content: bytes
    ) -> tuple[list[GraphNodeModel], list[GraphEdgeModel]]:
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message=f"JSON 解析失败：{exc}",
            ) from exc

        if not isinstance(data, dict) or "nodes" not in data:
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message="JSON 需包含 nodes 字段",
            )

        raw_nodes = data.get("nodes", []) or []
        raw_edges = data.get("edges", []) or []

        nodes: list[GraphNodeModel] = []
        for idx, n in enumerate(raw_nodes):
            if not isinstance(n, dict) or not n.get("label"):
                raise ApiException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code=40001,
                    message=f"第 {idx + 1} 个节点缺少 label",
                )
            node_id = n.get("id") or f"n_{uuid4().hex}"
            nodes.append(
                GraphNodeModel(
                    id=node_id,
                    project_id="",
                    label=str(n["label"]),
                    x=float(n.get("x", 100 + (idx % 5) * 120)),
                    y=float(n.get("y", 100 + (idx // 5) * 120)),
                    uri=n.get("uri"),
                    rdf_type=n.get("rdfType"),
                    properties=n.get("properties"),
                )
            )

        edges: list[GraphEdgeModel] = []
        for e in raw_edges:
            if not isinstance(e, dict) or not e.get("source") or not e.get("target"):
                raise ApiException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code=40001,
                    message="边缺少 source 或 target",
                )
            edge_id = e.get("id") or f"e_{uuid4().hex}"
            edges.append(
                GraphEdgeModel(
                    id=edge_id,
                    project_id="",
                    source=str(e["source"]),
                    target=str(e["target"]),
                    label=str(e.get("label", "关系")),
                    predicate=e.get("predicate"),
                    properties=e.get("properties"),
                )
            )

        return nodes, edges

    @staticmethod
    def _derive_name(filename: str) -> str:
        if not filename:
            return "导入的项目"
        # 去扩展名
        stem = filename.rsplit(".", 1)[0] if "." in filename else filename
        return stem[:120] or "导入的项目"
