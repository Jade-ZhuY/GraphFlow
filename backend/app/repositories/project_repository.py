from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session

from app.models.graph import (
    GraphEdgeModel,
    GraphNodeModel,
    ProjectMemberModel,
    ProjectModel,
)


class ProjectRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_projects_by_user(self, user_id: str) -> list[ProjectModel]:
        statement = (
            select(ProjectModel)
            .where(ProjectModel.user_id == user_id)
            .order_by(desc(ProjectModel.updated_at), desc(ProjectModel.created_at))
        )
        return list(self.db.scalars(statement).all())

    def list_projects_as_member(self, user_id: str) -> list[tuple[ProjectModel, str]]:
        """返回该用户作为成员（非 owner）参与的项目及其角色。"""
        statement = (
            select(ProjectModel, ProjectMemberModel.role)
            .join(
                ProjectMemberModel,
                ProjectMemberModel.project_id == ProjectModel.id,
            )
            .where(ProjectMemberModel.user_id == user_id)
            .order_by(desc(ProjectModel.updated_at), desc(ProjectModel.created_at))
        )
        return list(self.db.execute(statement).all())

    def get_project_by_id(self, project_id: str) -> ProjectModel | None:
        return self.db.get(ProjectModel, project_id)

    def add_project(self, project: ProjectModel) -> None:
        self.db.add(project)

    def get_node(self, *, project_id: str, node_id: str) -> GraphNodeModel | None:
        return self.db.get(GraphNodeModel, {"project_id": project_id, "id": node_id})

    def get_edge(self, *, project_id: str, edge_id: str) -> GraphEdgeModel | None:
        return self.db.get(GraphEdgeModel, {"project_id": project_id, "id": edge_id})

    def add_node(self, node: GraphNodeModel) -> None:
        self.db.add(node)

    def add_edge(self, edge: GraphEdgeModel) -> None:
        self.db.add(edge)

    def delete_node(self, *, project_id: str, node_id: str) -> None:
        self.db.execute(
            delete(GraphEdgeModel)
            .where(GraphEdgeModel.project_id == project_id)
            .where(
                (GraphEdgeModel.source == node_id) | (GraphEdgeModel.target == node_id)
            )
            .execution_options(synchronize_session=False)
        )
        self.db.execute(
            delete(GraphNodeModel)
            .where(GraphNodeModel.project_id == project_id)
            .where(GraphNodeModel.id == node_id)
            .execution_options(synchronize_session=False)
        )

    def delete_edge(self, *, project_id: str, edge_id: str) -> None:
        self.db.execute(
            delete(GraphEdgeModel)
            .where(GraphEdgeModel.project_id == project_id)
            .where(GraphEdgeModel.id == edge_id)
            .execution_options(synchronize_session=False)
        )

    def replace_graph(
        self,
        *,
        project: ProjectModel,
        nodes: list[GraphNodeModel],
        edges: list[GraphEdgeModel],
    ) -> None:
        self.db.execute(
            delete(GraphEdgeModel)
            .where(GraphEdgeModel.project_id == project.id)
            .execution_options(synchronize_session=False)
        )
        self.db.execute(
            delete(GraphNodeModel)
            .where(GraphNodeModel.project_id == project.id)
            .execution_options(synchronize_session=False)
        )
        self.db.add_all(nodes)
        self.db.add_all(edges)

    def delete_project(self, project: ProjectModel) -> None:
        self.db.delete(project)

    def commit(self) -> None:
        self.db.commit()

    def refresh(self, instance: object) -> None:
        self.db.refresh(instance)

    def expire_graph_relationships(self, project: ProjectModel) -> None:
        self.db.expire(project, ["nodes", "edges"])

    # ---- members ----

    def list_members(self, *, project_id: str) -> list[ProjectMemberModel]:
        statement = (
            select(ProjectMemberModel)
            .where(ProjectMemberModel.project_id == project_id)
            .order_by(ProjectMemberModel.created_at)
        )
        return list(self.db.scalars(statement).all())

    def get_member(self, *, project_id: str, user_id: str) -> ProjectMemberModel | None:
        return self.db.get(
            ProjectMemberModel,
            {"project_id": project_id, "user_id": user_id},
        )

    def add_member(self, member: ProjectMemberModel) -> None:
        self.db.add(member)

    def update_member_role(self, *, project_id: str, user_id: str, role: str) -> None:
        member = self.get_member(project_id=project_id, user_id=user_id)
        if member is not None:
            member.role = role

    def delete_member(self, *, project_id: str, user_id: str) -> None:
        self.db.execute(
            delete(ProjectMemberModel)
            .where(ProjectMemberModel.project_id == project_id)
            .where(ProjectMemberModel.user_id == user_id)
            .execution_options(synchronize_session=False)
        )
