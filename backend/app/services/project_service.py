from uuid import uuid4

from fastapi import status

from app.api.errors import ApiException
from app.core.security import isoformat_z, now_utc
from app.models.auth import UserModel
from app.models.graph import (
    GraphEdgeModel,
    GraphNodeModel,
    ProjectMemberModel,
    ProjectModel,
)
from app.repositories.auth_repository import AuthRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.graph import (
    AddMemberRequest,
    CreateGraphEdgeRequest,
    CreateGraphNodeRequest,
    CreateProjectRequest,
    DeleteProjectResult,
    GraphEdge,
    GraphNode,
    GraphProject,
    Member,
    ProjectRole,
    SaveGraphRequest,
    UpdateGraphEdgeRequest,
    UpdateGraphNodeRequest,
    UpdateMemberRoleRequest,
)

# 角色等级：用于「最低角色」权限校验。owner > editor > viewer。
ROLE_RANK: dict[str, int] = {"viewer": 1, "editor": 2, "owner": 3}


class ProjectService:
    def __init__(
        self,
        repository: ProjectRepository,
        auth_repository: AuthRepository,
    ) -> None:
        self.repository = repository
        self.auth_repository = auth_repository

    def list_projects(self, user: UserModel) -> list[GraphProject]:
        owned = self.repository.list_projects_by_user(user.id)
        shared = self.repository.list_projects_as_member(user.id)
        # 以成员身份参与的项目可能与拥有项目去重（正常不会重复，防御性处理）
        owned_ids = {p.id for p in owned}
        result: list[GraphProject] = []
        for project in owned:
            result.append(self.to_project_schema(project, my_role="owner"))
        for project, role in shared:
            if project.id in owned_ids:
                continue
            result.append(self.to_project_schema(project, my_role=role))
        return result

    def create_project(
        self,
        *,
        user: UserModel,
        payload: CreateProjectRequest,
    ) -> GraphProject:
        timestamp = now_utc()
        project = ProjectModel(
            id=f"p_{uuid4().hex}",
            user_id=user.id,
            name=payload.name,
            description=payload.description,
            created_at=timestamp,
            updated_at=timestamp,
        )
        self.repository.add_project(project)
        self.repository.commit()
        self.repository.refresh(project)
        return self.to_project_schema(project)

    def get_project(self, *, user: UserModel, project_id: str) -> GraphProject:
        project, role = self._get_accessible_project(
            user=user, project_id=project_id, min_role="viewer"
        )
        return self.to_project_schema(project, my_role=role)

    def get_graph(self, *, user: UserModel, project_id: str) -> GraphProject:
        return self.get_project(user=user, project_id=project_id)

    def save_graph(
        self,
        *,
        user: UserModel,
        project_id: str,
        payload: SaveGraphRequest,
    ) -> GraphProject:
        project, role = self._get_accessible_project(
            user=user, project_id=project_id, min_role="editor"
        )
        self._validate_graph(payload)

        timestamp = now_utc()
        project.updated_at = timestamp

        nodes = [
            GraphNodeModel(
                id=node.id,
                project_id=project.id,
                label=node.label,
                x=node.x,
                y=node.y,
                uri=node.uri,
                rdf_type=node.rdf_type,
                properties=node.properties,
            )
            for node in payload.nodes
        ]
        edges = [
            GraphEdgeModel(
                id=edge.id,
                project_id=project.id,
                source=edge.source,
                target=edge.target,
                label=edge.label,
                predicate=edge.predicate,
                properties=edge.properties,
            )
            for edge in payload.edges
        ]

        self.repository.replace_graph(project=project, nodes=nodes, edges=edges)
        self.repository.commit()
        self.repository.refresh(project)
        return self.to_project_schema(project)

    def create_node(
        self,
        *,
        user: UserModel,
        project_id: str,
        payload: CreateGraphNodeRequest,
    ) -> GraphProject:
        project, _ = self._get_accessible_project(
            user=user, project_id=project_id, min_role="editor"
        )
        node_id = payload.id or f"n_{uuid4().hex}"
        if self.repository.get_node(project_id=project.id, node_id=node_id):
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message="节点 ID 不能重复",
            )

        node = GraphNodeModel(
            id=node_id,
            project_id=project.id,
            label=payload.label,
            x=payload.x,
            y=payload.y,
            uri=payload.uri,
            rdf_type=payload.rdf_type,
            properties=payload.properties,
        )
        self.repository.add_node(node)
        return self._commit_graph_change(project)

    def update_node(
        self,
        *,
        user: UserModel,
        project_id: str,
        node_id: str,
        payload: UpdateGraphNodeRequest,
    ) -> GraphProject:
        project, _ = self._get_accessible_project(
            user=user, project_id=project_id, min_role="editor"
        )
        node = self.repository.get_node(project_id=project.id, node_id=node_id)
        if node is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="节点不存在",
            )

        updates = payload.model_fields_set
        if "label" in updates:
            node.label = payload.label or node.label
        if "x" in updates and payload.x is not None:
            node.x = payload.x
        if "y" in updates and payload.y is not None:
            node.y = payload.y
        if "uri" in updates:
            node.uri = payload.uri
        if "rdf_type" in updates or "rdfType" in updates:
            node.rdf_type = payload.rdf_type
        if "properties" in updates:
            node.properties = payload.properties

        return self._commit_graph_change(project)

    def delete_node(
        self,
        *,
        user: UserModel,
        project_id: str,
        node_id: str,
    ) -> GraphProject:
        project, _ = self._get_accessible_project(
            user=user, project_id=project_id, min_role="editor"
        )
        node = self.repository.get_node(project_id=project.id, node_id=node_id)
        if node is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="节点不存在",
            )

        self.repository.delete_node(project_id=project.id, node_id=node_id)
        return self._commit_graph_change(project)

    def create_edge(
        self,
        *,
        user: UserModel,
        project_id: str,
        payload: CreateGraphEdgeRequest,
    ) -> GraphProject:
        project, _ = self._get_accessible_project(
            user=user, project_id=project_id, min_role="editor"
        )
        edge_id = payload.id or f"e_{uuid4().hex}"
        if self.repository.get_edge(project_id=project.id, edge_id=edge_id):
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message="边 ID 不能重复",
            )
        self._validate_edge_endpoints(
            project_id=project.id,
            source=payload.source,
            target=payload.target,
        )

        edge = GraphEdgeModel(
            id=edge_id,
            project_id=project.id,
            source=payload.source,
            target=payload.target,
            label=payload.label,
            predicate=payload.predicate,
            properties=payload.properties,
        )
        self.repository.add_edge(edge)
        return self._commit_graph_change(project)

    def update_edge(
        self,
        *,
        user: UserModel,
        project_id: str,
        edge_id: str,
        payload: UpdateGraphEdgeRequest,
    ) -> GraphProject:
        project, _ = self._get_accessible_project(
            user=user, project_id=project_id, min_role="editor"
        )
        edge = self.repository.get_edge(project_id=project.id, edge_id=edge_id)
        if edge is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="边不存在",
            )

        next_source = (
            payload.source if "source" in payload.model_fields_set else edge.source
        )
        next_target = (
            payload.target if "target" in payload.model_fields_set else edge.target
        )
        self._validate_edge_endpoints(
            project_id=project.id,
            source=next_source,
            target=next_target,
        )

        updates = payload.model_fields_set
        if "source" in updates and payload.source is not None:
            edge.source = payload.source
        if "target" in updates and payload.target is not None:
            edge.target = payload.target
        if "label" in updates:
            edge.label = payload.label or edge.label
        if "predicate" in updates:
            edge.predicate = payload.predicate
        if "properties" in updates:
            edge.properties = payload.properties

        return self._commit_graph_change(project)

    def delete_edge(
        self,
        *,
        user: UserModel,
        project_id: str,
        edge_id: str,
    ) -> GraphProject:
        project, _ = self._get_accessible_project(
            user=user, project_id=project_id, min_role="editor"
        )
        edge = self.repository.get_edge(project_id=project.id, edge_id=edge_id)
        if edge is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="边不存在",
            )

        self.repository.delete_edge(project_id=project.id, edge_id=edge_id)
        return self._commit_graph_change(project)

    def delete_project(
        self,
        *,
        user: UserModel,
        project_id: str,
    ) -> DeleteProjectResult:
        project, _ = self._get_accessible_project(
            user=user, project_id=project_id, min_role="owner"
        )
        self.repository.delete_project(project)
        self.repository.commit()
        return DeleteProjectResult(deleted=True, projectId=project_id)

    @staticmethod
    def to_project_schema(
        project: ProjectModel, *, my_role: ProjectRole | None = None
    ) -> GraphProject:
        return GraphProject(
            id=project.id,
            name=project.name,
            description=project.description,
            nodes=[
                ProjectService.to_node_schema(node)
                for node in sorted(project.nodes, key=lambda item: item.id)
            ],
            edges=[
                ProjectService.to_edge_schema(edge)
                for edge in sorted(project.edges, key=lambda item: item.id)
            ],
            createdAt=isoformat_z(project.created_at),
            updatedAt=isoformat_z(project.updated_at),
            myRole=my_role,
        )

    @staticmethod
    def to_node_schema(node: GraphNodeModel) -> GraphNode:
        return GraphNode(
            id=node.id,
            label=node.label,
            x=node.x,
            y=node.y,
            uri=node.uri,
            rdfType=node.rdf_type,
            properties=node.properties,
        )

    @staticmethod
    def to_edge_schema(edge: GraphEdgeModel) -> GraphEdge:
        return GraphEdge(
            id=edge.id,
            source=edge.source,
            target=edge.target,
            label=edge.label,
            predicate=edge.predicate,
            properties=edge.properties,
        )

    def _role_of(self, *, user: UserModel, project: ProjectModel) -> ProjectRole | None:
        """返回用户对该项目的角色：owner / editor / viewer；无权限返回 None。"""
        if project.user_id == user.id:
            return "owner"
        member = self.repository.get_member(project_id=project.id, user_id=user.id)
        if member is None:
            return None
        return member.role  # type: ignore[return-value]

    def _get_accessible_project(
        self,
        *,
        user: UserModel,
        project_id: str,
        min_role: ProjectRole,
    ) -> tuple[ProjectModel, ProjectRole]:
        """按最低角色校验并返回 (project, role)。角色不足抛 40301。"""
        project = self.repository.get_project_by_id(project_id)
        if project is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="项目不存在",
            )
        role = self._role_of(user=user, project=project)
        if role is None or ROLE_RANK[role] < ROLE_RANK[min_role]:
            raise ApiException(
                status_code=status.HTTP_403_FORBIDDEN,
                code=40301,
                message="无权限访问该项目",
            )
        return project, role

    # ---- 成员管理（均要求 owner）----

    def list_members(self, *, user: UserModel, project_id: str) -> list[Member]:
        self._require_owner(user=user, project_id=project_id)
        members = self.repository.list_members(project_id=project_id)
        return [self.to_member_schema(m) for m in members]

    def add_member(
        self,
        *,
        user: UserModel,
        project_id: str,
        payload: AddMemberRequest,
    ) -> Member:
        self._require_owner(user=user, project_id=project_id)

        target = self.auth_repository.get_user_by_email(payload.email)
        if target is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="用户不存在",
            )
        if target.id == user.id:
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message="不能将自己添加为成员",
            )
        if (
            self.repository.get_member(project_id=project_id, user_id=target.id)
            is not None
        ):
            raise ApiException(
                status_code=status.HTTP_409_CONFLICT,
                code=40901,
                message="该用户已是成员",
            )

        member = ProjectMemberModel(
            project_id=project_id,
            user_id=target.id,
            role=payload.role,
            created_at=now_utc(),
        )
        self.repository.add_member(member)
        self.repository.commit()
        self.repository.refresh(member)
        return self.to_member_schema(member)

    def update_member_role(
        self,
        *,
        user: UserModel,
        project_id: str,
        member_user_id: str,
        payload: UpdateMemberRoleRequest,
    ) -> Member:
        self._require_owner(user=user, project_id=project_id)
        member = self.repository.get_member(
            project_id=project_id, user_id=member_user_id
        )
        if member is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="成员不存在",
            )
        self.repository.update_member_role(
            project_id=project_id,
            user_id=member_user_id,
            role=payload.role,
        )
        self.repository.commit()
        self.repository.refresh(member)
        return self.to_member_schema(member)

    def remove_member(
        self,
        *,
        user: UserModel,
        project_id: str,
        member_user_id: str,
    ) -> None:
        self._require_owner(user=user, project_id=project_id)
        member = self.repository.get_member(
            project_id=project_id, user_id=member_user_id
        )
        if member is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code=40401,
                message="成员不存在",
            )
        self.repository.delete_member(project_id=project_id, user_id=member_user_id)
        self.repository.commit()

    def _require_owner(self, *, user: UserModel, project_id: str) -> None:
        self._get_accessible_project(user=user, project_id=project_id, min_role="owner")

    @staticmethod
    def to_member_schema(member: ProjectMemberModel) -> Member:
        user = member.user  # 通过 relationship 获取，见 model
        return Member(
            userId=member.user_id,
            email=user.email,
            username=user.username,
            displayName=user.display_name,
            role=member.role,  # type: ignore[arg-type]
            joinedAt=isoformat_z(member.created_at),
        )

    def _commit_graph_change(self, project: ProjectModel) -> GraphProject:
        project.updated_at = now_utc()
        self.repository.commit()
        self.repository.expire_graph_relationships(project)
        return self.to_project_schema(project)

    def _validate_edge_endpoints(
        self,
        *,
        project_id: str,
        source: str | None,
        target: str | None,
    ) -> None:
        if not source or not target:
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message="边引用了不存在的节点",
            )
        if (
            self.repository.get_node(project_id=project_id, node_id=source) is None
            or self.repository.get_node(project_id=project_id, node_id=target) is None
        ):
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message="边引用了不存在的节点",
            )

    @staticmethod
    def _validate_graph(payload: SaveGraphRequest) -> None:
        node_ids = [node.id for node in payload.nodes]
        if len(set(node_ids)) != len(node_ids):
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message="节点 ID 不能重复",
            )

        edge_ids = [edge.id for edge in payload.edges]
        if len(set(edge_ids)) != len(edge_ids):
            raise ApiException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code=40001,
                message="边 ID 不能重复",
            )

        node_id_set = set(node_ids)
        for edge in payload.edges:
            if edge.source not in node_id_set or edge.target not in node_id_set:
                raise ApiException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code=40001,
                    message="边引用了不存在的节点",
                )
