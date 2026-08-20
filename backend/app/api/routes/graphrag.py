from typing import Annotated

from fastapi import Depends
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_auth_repository, get_current_user
from app.db.session import get_db
from app.models.auth import UserModel
from app.repositories.auth_repository import AuthRepository
from app.repositories.project_repository import ProjectRepository
from app.services.graph_rag_service import (
    build_subgraph,
    extract_keywords,
    query_all_projects,
    stream_answer,
    stream_multi_answer,
)
from app.services.project_service import ProjectService


class GraphRagQueryRequest(BaseModel):
    project_id: str = Field(alias="projectId")
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, alias="topK")
    hop_depth: int = Field(default=1, alias="hopDepth")


class GraphRagMultiQueryRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, alias="topK")
    hop_depth: int = Field(default=1, alias="hopDepth")


router = APIRouter()


def _project_repository(db: Annotated[Session, Depends(get_db)]) -> ProjectRepository:
    return ProjectRepository(db)


def _project_service(
    repository: Annotated[ProjectRepository, Depends(_project_repository)],
    auth_repository: Annotated[AuthRepository, Depends(get_auth_repository)],
) -> ProjectService:
    return ProjectService(repository, auth_repository)


@router.post("/query")
async def query_graph(
    payload: GraphRagQueryRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> StreamingResponse:
    """图谱检索问答（SSE 流式）。"""
    project, _ = service._get_accessible_project(
        user=current_user,
        project_id=payload.project_id,
        min_role="viewer",
    )

    keywords = extract_keywords(payload.query)
    subgraph = build_subgraph(project, keywords, payload.top_k, payload.hop_depth)
    event_stream = stream_answer(project.name, subgraph, payload.query)

    return StreamingResponse(
        event_stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/query-all")
async def query_all_graph(
    payload: GraphRagMultiQueryRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> StreamingResponse:
    """多项目图谱检索问答（SSE 流式）。遍历用户所有项目。"""
    owned = service.repository.list_projects_by_user(current_user.id)
    shared = service.repository.list_projects_as_member(current_user.id)
    projects = owned + [p for p, _ in shared if p.id not in {o.id for o in owned}]

    data = query_all_projects(
        projects, payload.query, payload.top_k, payload.hop_depth
    )
    event_stream = stream_multi_answer(data, payload.query)

    return StreamingResponse(
        event_stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )