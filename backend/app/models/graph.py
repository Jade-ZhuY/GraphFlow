from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    nodes: Mapped[list["GraphNodeModel"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    edges: Mapped[list["GraphEdgeModel"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )


class GraphNodeModel(Base):
    __tablename__ = "graph_nodes"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"),
        primary_key=True,
    )
    label: Mapped[str] = mapped_column(String(255))
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    uri: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    rdf_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    properties: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    project: Mapped[ProjectModel] = relationship(back_populates="nodes")


class GraphEdgeModel(Base):
    __tablename__ = "graph_edges"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"),
        primary_key=True,
    )
    source: Mapped[str] = mapped_column(String(128))
    target: Mapped[str] = mapped_column(String(128))
    label: Mapped[str] = mapped_column(String(255))
    predicate: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    properties: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    project: Mapped[ProjectModel] = relationship(back_populates="edges")


class ProjectMemberModel(Base):
    """项目成员关系。owner 不入此表（由 projects.user_id 隐含）。"""

    __tablename__ = "project_members"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(String(10))  # editor | viewer
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped["Any"] = relationship(
        "UserModel",
        lazy="joined",
    )
