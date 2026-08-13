from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ConversationModel(Base):
    """一次对话会话，属于某个用户，可包含多条消息。"""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    messages: Mapped[list["MessageModel"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="MessageModel.created_at",
    )


class MessageModel(Base):
    """会话中的一条消息（user / assistant）。"""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id"),
        index=True,
    )
    role: Mapped[str] = mapped_column(String(10))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    conversation: Mapped[ConversationModel] = relationship(back_populates="messages")
