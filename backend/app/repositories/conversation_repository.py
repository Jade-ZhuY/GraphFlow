from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.conversation import ConversationModel, MessageModel


class ConversationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_conversations_by_user(self, user_id: str) -> list[ConversationModel]:
        statement = (
            select(ConversationModel)
            .where(ConversationModel.user_id == user_id)
            .order_by(
                desc(ConversationModel.updated_at),
                desc(ConversationModel.created_at),
            )
        )
        return list(self.db.scalars(statement).all())

    def get_conversation(self, conversation_id: str) -> ConversationModel | None:
        return self.db.get(ConversationModel, conversation_id)

    def add_conversation(self, conversation: ConversationModel) -> None:
        self.db.add(conversation)

    def delete_conversation(self, conversation: ConversationModel) -> None:
        self.db.delete(conversation)

    def list_messages(self, conversation_id: str) -> list[MessageModel]:
        statement = (
            select(MessageModel)
            .where(MessageModel.conversation_id == conversation_id)
            .order_by(MessageModel.created_at)
        )
        return list(self.db.scalars(statement).all())

    def get_message(self, message_id: str) -> MessageModel | None:
        return self.db.get(MessageModel, message_id)

    def add_message(self, message: MessageModel) -> None:
        self.db.add(message)

    def commit(self) -> None:
        self.db.commit()

    def refresh(self, instance: object) -> None:
        self.db.refresh(instance)
