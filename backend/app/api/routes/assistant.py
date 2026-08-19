from typing import Annotated

from fastapi import Depends, status
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.auth import UserModel
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.assistant import ChatRequest, Conversation, Message
from app.schemas.common import ApiResponse
from app.services.assistant_service import AssistantService

router = APIRouter()


def _conversation_repository(
    db: Annotated[Session, Depends(get_db)],
) -> ConversationRepository:
    return ConversationRepository(db)


def _project_repository(
    db: Annotated[Session, Depends(get_db)],
) -> ProjectRepository:
    return ProjectRepository(db)


def _assistant_service(
    repository: Annotated[ConversationRepository, Depends(_conversation_repository)],
    project_repository: Annotated[ProjectRepository, Depends(_project_repository)],
) -> AssistantService:
    return AssistantService(repository, project_repository)


@router.get(
    "/conversations",
    response_model=ApiResponse[list[Conversation]],
)
async def list_conversations(
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[AssistantService, Depends(_assistant_service)],
) -> ApiResponse[list[Conversation]]:
    return ApiResponse(data=service.list_conversations(current_user))


@router.post(
    "/conversations",
    response_model=ApiResponse[Conversation],
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[AssistantService, Depends(_assistant_service)],
) -> ApiResponse[Conversation]:
    return ApiResponse(data=service.create_conversation(current_user))


@router.delete(
    "/conversations/{conversation_id}",
    response_model=ApiResponse[dict[str, bool]],
)
async def delete_conversation(
    conversation_id: str,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[AssistantService, Depends(_assistant_service)],
) -> ApiResponse[dict[str, bool]]:
    service.delete_conversation(user=current_user, conversation_id=conversation_id)
    return ApiResponse(data={"deleted": True})


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=ApiResponse[list[Message]],
)
async def list_messages(
    conversation_id: str,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[AssistantService, Depends(_assistant_service)],
) -> ApiResponse[list[Message]]:
    return ApiResponse(
        data=service.list_messages(user=current_user, conversation_id=conversation_id)
    )


@router.post("/chat")
async def chat(
    payload: ChatRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    service: Annotated[AssistantService, Depends(_assistant_service)],
) -> StreamingResponse:
    """SSE 流式问答。不设 response_model、不用 ApiResponse 包（裸流）。

    校验在 await prepare_chat 时完成（响应未开始，异常可被全局处理器捕获），
    返回的生成器负责消费 langgraph 流式输出。
    """
    event_stream = await service.prepare_chat(
        user=current_user,
        conversation_id=payload.conversation_id,
        content=payload.content,
    )
    return StreamingResponse(
        event_stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
