from typing import Annotated

from fastapi import Depends, File, Form, Query, UploadFile, status
from fastapi.responses import Response
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session

from app.api.deps import get_auth_repository, get_current_user
from app.db.session import get_db
from app.models.auth import UserModel
from app.repositories.auth_repository import AuthRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.common import ApiResponse
from app.schemas.graph import (
    AddMemberRequest,
    CreateGraphEdgeRequest,
    CreateGraphNodeRequest,
    CreateProjectRequest,
    DeleteProjectResult,
    GraphProject,
    Member,
    SaveGraphRequest,
    UpdateGraphEdgeRequest,
    UpdateGraphNodeRequest,
    UpdateMemberRoleRequest,
)
from app.services.graph_io_service import GraphIOService
from app.services.project_service import ProjectService

router = APIRouter()


def _project_repository(db: Annotated[Session, Depends(get_db)]) -> ProjectRepository:
    return ProjectRepository(db)


def _project_service(
    repository: Annotated[ProjectRepository, Depends(_project_repository)],
    auth_repository: Annotated[AuthRepository, Depends(get_auth_repository)],
) -> ProjectService:
    return ProjectService(repository, auth_repository)


def _graph_io_service(
    repository: Annotated[ProjectRepository, Depends(_project_repository)],
) -> GraphIOService:
    return GraphIOService(repository)


@router.get("", response_model=ApiResponse[list[GraphProject]])
async def list_projects(
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[list[GraphProject]]:
    return ApiResponse(data=service.list_projects(current_user))


@router.post(
    "",
    response_model=ApiResponse[GraphProject],
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    payload: CreateProjectRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(data=service.create_project(user=current_user, payload=payload))


@router.post(
    "/import",
    response_model=ApiResponse[GraphProject],
    status_code=status.HTTP_201_CREATED,
)
async def import_project(
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[GraphIOService, Depends(_graph_io_service)],
    project_service: Annotated[ProjectService, Depends(_project_service)],
    fmt: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
) -> ApiResponse[GraphProject]:
    content = await file.read()
    project = service.import_project(
        user=current_user,
        filename=file.filename or "",
        content=content,
        fmt=fmt,
    )
    return ApiResponse(data=project_service.to_project_schema(project, my_role="owner"))


@router.get("/{project_id}", response_model=ApiResponse[GraphProject])
async def get_project(
    project_id: str,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(
        data=service.get_project(user=current_user, project_id=project_id)
    )


@router.get("/{project_id}/graph", response_model=ApiResponse[GraphProject])
async def get_graph(
    project_id: str,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(data=service.get_graph(user=current_user, project_id=project_id))


@router.get("/{project_id}/export")
async def export_project(
    project_id: str,
    fmt: Annotated[str, Query()],
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[GraphIOService, Depends(_graph_io_service)],
) -> Response:
    content, content_type = service.export_project(
        user=current_user, project_id=project_id, fmt=fmt
    )
    return Response(content=content, media_type=content_type)


@router.put("/{project_id}/graph", response_model=ApiResponse[GraphProject])
async def save_graph(
    project_id: str,
    payload: SaveGraphRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(
        data=service.save_graph(
            user=current_user,
            project_id=project_id,
            payload=payload,
        )
    )


@router.post(
    "/{project_id}/nodes",
    response_model=ApiResponse[GraphProject],
    status_code=status.HTTP_201_CREATED,
)
async def create_node(
    project_id: str,
    payload: CreateGraphNodeRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(
        data=service.create_node(
            user=current_user,
            project_id=project_id,
            payload=payload,
        )
    )


@router.patch("/{project_id}/nodes/{node_id}", response_model=ApiResponse[GraphProject])
async def update_node(
    project_id: str,
    node_id: str,
    payload: UpdateGraphNodeRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(
        data=service.update_node(
            user=current_user,
            project_id=project_id,
            node_id=node_id,
            payload=payload,
        )
    )


@router.delete(
    "/{project_id}/nodes/{node_id}",
    response_model=ApiResponse[GraphProject],
)
async def delete_node(
    project_id: str,
    node_id: str,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(
        data=service.delete_node(
            user=current_user,
            project_id=project_id,
            node_id=node_id,
        )
    )


@router.post(
    "/{project_id}/edges",
    response_model=ApiResponse[GraphProject],
    status_code=status.HTTP_201_CREATED,
)
async def create_edge(
    project_id: str,
    payload: CreateGraphEdgeRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(
        data=service.create_edge(
            user=current_user,
            project_id=project_id,
            payload=payload,
        )
    )


@router.patch("/{project_id}/edges/{edge_id}", response_model=ApiResponse[GraphProject])
async def update_edge(
    project_id: str,
    edge_id: str,
    payload: UpdateGraphEdgeRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(
        data=service.update_edge(
            user=current_user,
            project_id=project_id,
            edge_id=edge_id,
            payload=payload,
        )
    )


@router.delete(
    "/{project_id}/edges/{edge_id}",
    response_model=ApiResponse[GraphProject],
)
async def delete_edge(
    project_id: str,
    edge_id: str,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[GraphProject]:
    return ApiResponse(
        data=service.delete_edge(
            user=current_user,
            project_id=project_id,
            edge_id=edge_id,
        )
    )


@router.delete("/{project_id}", response_model=ApiResponse[DeleteProjectResult])
async def delete_project(
    project_id: str,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[DeleteProjectResult]:
    return ApiResponse(
        data=service.delete_project(user=current_user, project_id=project_id)
    )


# ---- 成员管理（owner only）----


@router.get("/{project_id}/members", response_model=ApiResponse[list[Member]])
async def list_members(
    project_id: str,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[list[Member]]:
    return ApiResponse(
        data=service.list_members(user=current_user, project_id=project_id)
    )


@router.post(
    "/{project_id}/members",
    response_model=ApiResponse[Member],
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    project_id: str,
    payload: AddMemberRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[Member]:
    return ApiResponse(
        data=service.add_member(
            user=current_user, project_id=project_id, payload=payload
        )
    )


@router.patch(
    "/{project_id}/members/{member_user_id}",
    response_model=ApiResponse[Member],
)
async def update_member_role(
    project_id: str,
    member_user_id: str,
    payload: UpdateMemberRoleRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[Member]:
    return ApiResponse(
        data=service.update_member_role(
            user=current_user,
            project_id=project_id,
            member_user_id=member_user_id,
            payload=payload,
        )
    )


@router.delete(
    "/{project_id}/members/{member_user_id}",
    response_model=ApiResponse[dict[str, bool]],
)
async def remove_member(
    project_id: str,
    member_user_id: str,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[ProjectService, Depends(_project_service)],
) -> ApiResponse[dict[str, bool]]:
    service.remove_member(
        user=current_user,
        project_id=project_id,
        member_user_id=member_user_id,
    )
    return ApiResponse(data={"removed": True})
