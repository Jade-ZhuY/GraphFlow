from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app


@pytest.fixture
def client(tmp_path) -> Generator[TestClient, None, None]:
    database_url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def register_user(
    client: TestClient,
    *,
    email: str = "assistant@example.com",
    username: str = "assistant_user",
) -> str:
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "Passw0rd123",
            "username": username,
        },
    )
    assert response.status_code == 201
    return response.json()["data"]["accessToken"]


def auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def _extract_sse_chunks(body: str) -> list[str]:
    """从 SSE body 里提取所有 type=chunk 的 content，按序返回。"""
    import json

    chunks: list[str] = []
    for line in body.splitlines():
        if not line.startswith("data: "):
            continue
        raw = line[len("data: ") :]
        if raw == "[DONE]":
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if payload.get("type") == "chunk" and payload.get("content"):
            chunks.append(payload["content"])
    return chunks


# ---- fake LLM（避免真实 API 调用）----


class _FakeChunk:
    def __init__(self, content: str) -> None:
        self.content = content


class FakeLLM:
    """标题生成用：invoke 返回有 .content 的对象。"""

    def invoke(self, _messages: list[Any]):
        return _FakeChunk("Test Title")


class FakeAgent:
    """模拟 create_agent 的返回值：astream 产出 (AIMessageChunk, meta)。"""

    def __init__(self) -> None:
        self.stream_text = "HELLO from test agent"

    async def astream(self, _input: dict[str, Any], stream_mode: str = "messages"):
        from langchain_core.messages import AIMessageChunk

        for char in self.stream_text:
            yield (AIMessageChunk(content=char), {})


@pytest.fixture(autouse=True)
def _mock_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.assistant_service as service_module

    monkeypatch.setattr(service_module, "_create_llm", lambda **_: FakeLLM())
    monkeypatch.setattr(service_module, "create_agent", lambda **_: FakeAgent())


def create_conversation(client: TestClient, token: str) -> dict:
    response = client.post(
        "/api/assistant/conversations",
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    return response.json()["data"]


# ---- 会话管理测试 ----


def test_create_and_list_conversations(client: TestClient) -> None:
    token = register_user(client)
    conv = create_conversation(client, token)
    assert conv["id"].startswith("conv_")
    assert conv["title"] is None

    listing = client.get("/api/assistant/conversations", headers=auth_headers(token))
    assert listing.status_code == 200
    convs = listing.json()["data"]
    assert [c["id"] for c in convs] == [conv["id"]]


def test_conversation_scoped_to_user(client: TestClient) -> None:
    token_a = register_user(client)
    token_b = register_user(client, email="other@example.com", username="other_user")
    conv = create_conversation(client, token_a)

    # B 访问 A 的会话 → 403
    messages_resp = client.get(
        f"/api/assistant/conversations/{conv['id']}/messages",
        headers=auth_headers(token_b),
    )
    assert messages_resp.status_code == 403
    assert messages_resp.json()["code"] == 40301

    # B 删除 A 的会话 → 403
    del_resp = client.delete(
        f"/api/assistant/conversations/{conv['id']}",
        headers=auth_headers(token_b),
    )
    assert del_resp.status_code == 403


def test_delete_conversation(client: TestClient) -> None:
    token = register_user(client)
    conv = create_conversation(client, token)

    del_resp = client.delete(
        f"/api/assistant/conversations/{conv['id']}",
        headers=auth_headers(token),
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["data"] == {"deleted": True}

    listing = client.get(
        "/api/assistant/conversations", headers=auth_headers(token)
    ).json()["data"]
    assert listing == []


# ---- 智能体问答测试 ----


def test_chat_streams_and_persists_messages(client: TestClient) -> None:
    token = register_user(client)
    conv = create_conversation(client, token)

    with client.stream(
        "POST",
        "/api/assistant/chat",
        headers=auth_headers(token),
        json={"conversationId": conv["id"], "content": "hello"},
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body_bytes = b"".join(response.iter_bytes())
        body = body_bytes.decode("utf-8")

    # 流式 chunk + [DONE] 收尾（chunk 是单字符，需拼接后再断言）
    chunks = _extract_sse_chunks(body)
    assert "".join(chunks) == "HELLO from test agent"
    assert "data: [DONE]" in body

    # 消息已落库（user + assistant 两条）
    messages = client.get(
        f"/api/assistant/conversations/{conv['id']}/messages",
        headers=auth_headers(token),
    )
    assert messages.status_code == 200
    msgs = messages.json()["data"]
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[0]["content"] == "hello"
    assert msgs[1]["role"] == "assistant"
    assert "HELLO" in msgs[1]["content"]

    # 会话标题已由 LLM 生成
    convs = client.get(
        "/api/assistant/conversations", headers=auth_headers(token)
    ).json()["data"]
    assert convs[0]["title"] == "Test Title"


def test_chat_rejects_blank_message(client: TestClient) -> None:
    token = register_user(client)
    conv = create_conversation(client, token)

    response = client.post(
        "/api/assistant/chat",
        headers=auth_headers(token),
        json={"conversationId": conv["id"], "content": "   "},
    )
    assert response.status_code == 400
    assert response.json()["code"] == 40001


def test_chat_requires_owned_conversation(client: TestClient) -> None:
    token_a = register_user(client)
    token_b = register_user(client, email="owner2@example.com", username="owner_two")
    conv = create_conversation(client, token_a)

    response = client.post(
        "/api/assistant/chat",
        headers=auth_headers(token_b),
        json={"conversationId": conv["id"], "content": "hello"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == 40301
