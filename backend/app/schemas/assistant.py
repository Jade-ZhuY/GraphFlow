from pydantic import BaseModel, ConfigDict, Field


class Conversation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str | None = None
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class Message(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    conversation_id: str = Field(alias="conversationId")
    role: str
    content: str
    created_at: str = Field(alias="createdAt")


class ChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    conversation_id: str = Field(alias="conversationId")
    content: str = Field(min_length=1)
