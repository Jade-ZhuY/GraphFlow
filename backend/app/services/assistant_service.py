"""图谱咨询助手服务：会话管理 + langchain 智能体（create_agent）+ LLM 流式问答。

智能体用 `langchain.agents.create_agent` 构建（取代手写 StateGraph）：
传入模型、工具列表、系统提示词，返回一个会循环调用工具直到收尾的 agent。
本期为日常问答（tools 为空），后续业务方向（自动建图/质检/教练）就是往 tools 里加工具。
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import uuid4

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_openai import ChatOpenAI

from app.api.errors import ApiException
from app.core.config import settings
from app.core.security import now_utc
from app.models.auth import UserModel
from app.models.conversation import ConversationModel, MessageModel
from app.repositories.conversation_repository import ConversationRepository

# 会话标题生成的系统提示
TITLE_SYSTEM_PROMPT = (
    "你是一个对话标题生成器。根据用户的第一条消息，生成一个不超过 20 个字的"
    "简短标题，直接输出标题的本身，不要加引号或多余内容。"
)

SYSTEM_PROMPT = (
    "你是知识图谱设计系统的智能助手。你帮助用户理解知识图谱、RDF、属性图等概念，"
    "协助设计图谱、实体关系和命名。回答用中文，清晰、结构化，可以适度使用列表。"
)


def _create_llm(*, streaming: bool) -> ChatOpenAI:
    return ChatOpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        streaming=streaming,
    )


class AssistantService:
    def __init__(self, repository: ConversationRepository) -> None:
        self.repository = repository
        self._llm: ChatOpenAI | None = None
        self._agent: Any | None = None

    @property
    def llm(self) -> ChatOpenAI:
        if self._llm is None:
            self._llm = _create_llm(streaming=True)
        return self._llm

    @property
    def agent(self) -> Any:
        """用 create_agent 构建智能体：模型 + 工具（本期空）+ 系统提示。"""
        if self._agent is None:
            self._agent = create_agent(
                model=self.llm,
                tools=[],  # 后续业务方向在此加工具（查项目/建图/质检）
                system_prompt=SYSTEM_PROMPT,
            )
        return self._agent

    # ---- 会话管理 ----

    def list_conversations(self, user: UserModel) -> list[dict[str, Any]]:
        conversations = self.repository.list_conversations_by_user(user.id)
        return [self.to_conversation_schema(c) for c in conversations]

    def create_conversation(self, user: UserModel) -> dict[str, Any]:
        timestamp = now_utc()
        conversation = ConversationModel(
            id=f"conv_{uuid4().hex}",
            user_id=user.id,
            title=None,
            created_at=timestamp,
            updated_at=timestamp,
        )
        self.repository.add_conversation(conversation)
        self.repository.commit()
        self.repository.refresh(conversation)
        return self.to_conversation_schema(conversation)

    def delete_conversation(self, *, user: UserModel, conversation_id: str) -> None:
        conversation = self._get_owned_conversation(user, conversation_id)
        self.repository.delete_conversation(conversation)
        self.repository.commit()

    def list_messages(
        self, *, user: UserModel, conversation_id: str
    ) -> list[dict[str, Any]]:
        self._get_owned_conversation(user, conversation_id)
        messages = self.repository.list_messages(conversation_id)
        return [self.to_message_schema(m) for m in messages]

    # ---- 智能体问答（SSE 流式）----

    async def prepare_chat(
        self,
        *,
        user: UserModel,
        conversation_id: str,
        content: str,
    ):
        """SSE 聊天的准备工作：校验归属 + 落用户消息，返回 SSE 事件生成器。

        校验在此处（普通 async 函数，路由 await 时才执行）完成——此时响应
        尚未开始，抛出的 ApiException 能被全局异常处理器转成 ApiResponse。
        返回的生成器负责消费 create_agent 的流式输出，中途异常发 error 帧。
        """
        self._get_owned_conversation(user, conversation_id)
        trimmed = content.strip()
        if not trimmed:
            raise ApiException(status_code=400, code=40001, message="消息不能为空")

        # 1. 落用户消息（历史随后从库里读，含这条）
        self._save_message(
            conversation_id=conversation_id,
            role="user",
            content=trimmed,
        )

        # 2. 取历史构造消息（系统提示由 create_agent 注入，这里只传对话）
        history = self.repository.list_messages(conversation_id)
        context = _history_to_messages(history)

        agent = self.agent
        assistant_parts: list[str] = []

        async def event_stream():
            try:
                # 逐 token 流式：stream_mode="messages" 产出 (AIMessageChunk, metadata)
                async for chunk, _meta in agent.astream(
                    {"messages": context},
                    stream_mode="messages",
                ):
                    text = chunk.content
                    if text:
                        assistant_parts.append(text)
                        payload = json.dumps(
                            {"type": "chunk", "content": text},
                            ensure_ascii=False,
                        )
                        yield f"data: {payload}\n\n"

                # 3. 流结束，落库 assistant 消息并生成标题
                reply = "".join(assistant_parts)
                self._save_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=reply,
                )
                self._maybe_generate_title(conversation_id)

                yield "data: [DONE]\n\n"
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                # 部分内容已产出时也落库，保留用户可见部分
                reply = "".join(assistant_parts)
                if reply:
                    self._save_message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=reply,
                    )
                payload = json.dumps(
                    {"type": "error", "message": str(exc)},
                    ensure_ascii=False,
                )
                yield f"data: {payload}\n\n"

        return event_stream()

    # ---- 内部辅助 ----

    def _get_owned_conversation(
        self, user: UserModel, conversation_id: str
    ) -> ConversationModel:
        conversation = self.repository.get_conversation(conversation_id)
        if conversation is None:
            raise ApiException(status_code=404, code=40401, message="会话不存在")
        if conversation.user_id != user.id:
            raise ApiException(status_code=403, code=40301, message="无权限访问该会话")
        return conversation

    def _save_message(self, *, conversation_id: str, role: str, content: str) -> None:
        message = MessageModel(
            id=f"msg_{uuid4().hex}",
            conversation_id=conversation_id,
            role=role,
            content=content,
            created_at=now_utc(),
        )
        self.repository.add_message(message)
        conversation = self.repository.get_conversation(conversation_id)
        if conversation is not None:
            conversation.updated_at = now_utc()
        self.repository.commit()

    def _maybe_generate_title(self, conversation_id: str) -> None:
        """首条 assistant 消息落库后，用 LLM 生成会话标题；失败则用首条截断兜底。"""
        conversation = self.repository.get_conversation(conversation_id)
        if conversation is None or conversation.title:
            return
        first = self.repository.list_messages(conversation_id)[:1]
        if not first:
            return
        user_text = first[0].content

        title: str | None = None
        try:
            llm = _create_llm(streaming=False)
            response = llm.invoke(
                [
                    HumanMessage(content=TITLE_SYSTEM_PROMPT),
                    HumanMessage(content=user_text),
                ]
            )
            candidate = str(response.content or "").strip().strip('"')
            if candidate:
                title = candidate[:20]
        except Exception:  # noqa: BLE001
            title = None

        if title is None:
            title = user_text[:20]

        conversation.title = title
        self.repository.commit()
        self.repository.refresh(conversation)

    # ---- schema ----

    @staticmethod
    def to_conversation_schema(
        conversation: ConversationModel,
    ) -> dict[str, Any]:
        return {
            "id": conversation.id,
            "title": conversation.title,
            "createdAt": conversation.created_at.isoformat(),
            "updatedAt": conversation.updated_at.isoformat(),
        }

    @staticmethod
    def to_message_schema(message: MessageModel) -> dict[str, Any]:
        return {
            "id": message.id,
            "conversationId": message.conversation_id,
            "role": message.role,
            "content": message.content,
            "createdAt": message.created_at.isoformat(),
        }


def _history_to_messages(history: list[MessageModel]) -> list[Any]:
    """把消息历史转成给智能体的对话消息（裁剪最近 N 条，不含系统提示）。"""
    max_msgs = settings.llm_history_max_messages
    messages: list[Any] = []
    for m in history[-max_msgs:]:
        messages.append(
            HumanMessage(content=m.content)
            if m.role == "user"
            else AIMessage(content=m.content)
        )
    return messages
