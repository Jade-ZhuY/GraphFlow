from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

ProjectRole = Literal["owner", "editor", "viewer"]
MemberRole = Literal["editor", "viewer"]


class GraphNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=255)
    x: float
    y: float
    uri: str | None = Field(default=None, max_length=2048)
    rdf_type: str | None = Field(default=None, alias="rdfType", max_length=255)
    properties: dict[str, Any] | None = None

    @field_validator("id", "label", mode="before")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("uri", "rdf_type", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        return value or None


class GraphEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1, max_length=128)
    source: str = Field(min_length=1, max_length=128)
    target: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=255)
    predicate: str | None = Field(default=None, max_length=2048)
    properties: dict[str, Any] | None = None

    @field_validator("id", "source", "target", "label", mode="before")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("predicate", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        return value or None


class CreateGraphNodeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(default=None, min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=255)
    x: float
    y: float
    uri: str | None = Field(default=None, max_length=2048)
    rdf_type: str | None = Field(default=None, alias="rdfType", max_length=255)
    properties: dict[str, Any] | None = None

    @field_validator("id", "label", mode="before")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("uri", "rdf_type", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        return value or None


class UpdateGraphNodeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str | None = Field(default=None, min_length=1, max_length=255)
    x: float | None = None
    y: float | None = None
    uri: str | None = Field(default=None, max_length=2048)
    rdf_type: str | None = Field(default=None, alias="rdfType", max_length=255)
    properties: dict[str, Any] | None = None

    @field_validator("label", mode="before")
    @classmethod
    def strip_label(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("uri", "rdf_type", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        return value or None


class CreateGraphEdgeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(default=None, min_length=1, max_length=128)
    source: str = Field(min_length=1, max_length=128)
    target: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=255)
    predicate: str | None = Field(default=None, max_length=2048)
    properties: dict[str, Any] | None = None

    @field_validator("id", "source", "target", "label", mode="before")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("predicate", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        return value or None


class UpdateGraphEdgeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: str | None = Field(default=None, min_length=1, max_length=128)
    target: str | None = Field(default=None, min_length=1, max_length=128)
    label: str | None = Field(default=None, min_length=1, max_length=255)
    predicate: str | None = Field(default=None, max_length=2048)
    properties: dict[str, Any] | None = None

    @field_validator("source", "target", "label", mode="before")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("predicate", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        return value or None


class GraphProject(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    description: str | None = None
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    my_role: ProjectRole | None = Field(default=None, alias="myRole")


class CreateProjectRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2048)

    @field_validator("name", mode="before")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("description", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        return value or None


class SaveGraphRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class DeleteProjectResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deleted: bool
    project_id: str = Field(alias="projectId")


class Member(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    email: str
    username: str
    display_name: str = Field(alias="displayName")
    role: ProjectRole
    joined_at: str = Field(alias="joinedAt")


class AddMemberRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: EmailStr
    role: MemberRole

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UpdateMemberRoleRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    role: MemberRole
