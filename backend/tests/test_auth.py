from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import auth  # noqa: F401


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


def test_register_me_refresh_and_logout(client: TestClient) -> None:
    register_response = client.post(
        "/api/auth/register",
        json={
            "email": "User@example.com",
            "password": "Passw0rd123",
            "username": "graph_user",
            "displayName": "图谱用户",
        },
    )

    assert register_response.status_code == 201
    body = register_response.json()
    assert body["code"] == 0
    assert body["data"]["user"]["email"] == "user@example.com"
    assert "kg_refresh_token" in register_response.cookies
    access_token = body["data"]["accessToken"]

    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert me_response.status_code == 200
    assert me_response.json()["data"]["username"] == "graph_user"

    refresh_response = client.post("/api/auth/refresh", json={})

    assert refresh_response.status_code == 200
    refreshed_access_token = refresh_response.json()["data"]["accessToken"]
    assert refreshed_access_token
    assert refreshed_access_token != access_token

    logout_response = client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {refreshed_access_token}"},
    )

    assert logout_response.status_code == 200
    assert logout_response.json()["data"]["loggedOut"] is True

    after_logout_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {refreshed_access_token}"},
    )

    assert after_logout_response.status_code == 401
    assert after_logout_response.json()["code"] == 40102


def test_duplicate_email_returns_contract_error(client: TestClient) -> None:
    payload = {
        "email": "dupe@example.com",
        "password": "Passw0rd123",
        "username": "dupe_user",
    }
    assert client.post("/api/auth/register", json=payload).status_code == 201

    duplicate_response = client.post(
        "/api/auth/register",
        json={**payload, "username": "another_user"},
    )

    assert duplicate_response.status_code == 409
    assert duplicate_response.json() == {
        "code": 40901,
        "message": "邮箱已被注册",
        "data": None,
    }


def test_login_rejects_wrong_password(client: TestClient) -> None:
    client.post(
        "/api/auth/register",
        json={
            "email": "login@example.com",
            "password": "Passw0rd123",
            "username": "login_user",
        },
    )

    response = client.post(
        "/api/auth/login",
        json={
            "email": "login@example.com",
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401
    assert response.json()["code"] == 40101
