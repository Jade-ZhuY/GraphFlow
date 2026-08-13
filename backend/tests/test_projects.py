import json
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
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
    email: str = "owner@example.com",
    username: str = "owner_user",
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


def create_project(client: TestClient, access_token: str) -> dict:
    response = client.post(
        "/api/projects",
        headers=auth_headers(access_token),
        json={
            "name": "客户知识图谱",
            "description": "销售线索与客户关系",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def test_create_project_returns_empty_graph(client: TestClient) -> None:
    access_token = register_user(client)

    project = create_project(client, access_token)

    assert project["name"] == "客户知识图谱"
    assert project["description"] == "销售线索与客户关系"
    assert project["nodes"] == []
    assert project["edges"] == []
    assert project["id"].startswith("p_")
    assert project["createdAt"]
    assert project["updatedAt"]


def test_create_project_rejects_blank_name(client: TestClient) -> None:
    access_token = register_user(client)

    response = client.post(
        "/api/projects",
        headers=auth_headers(access_token),
        json={
            "name": "   ",
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": 40001,
        "message": "请求参数错误",
        "data": None,
    }


def test_list_and_get_project_returns_only_current_users_projects(
    client: TestClient,
) -> None:
    owner_token = register_user(client)
    other_token = register_user(
        client,
        email="other@example.com",
        username="other_user",
    )
    project = create_project(client, owner_token)
    create_project(client, other_token)

    list_response = client.get(
        "/api/projects",
        headers=auth_headers(owner_token),
    )
    detail_response = client.get(
        f"/api/projects/{project['id']}",
        headers=auth_headers(owner_token),
    )

    assert list_response.status_code == 200
    projects = list_response.json()["data"]
    assert [item["id"] for item in projects] == [project["id"]]
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["id"] == project["id"]


def test_save_graph_replaces_nodes_and_edges(client: TestClient) -> None:
    access_token = register_user(client)
    project = create_project(client, access_token)

    save_response = client.put(
        f"/api/projects/{project['id']}/graph",
        headers=auth_headers(access_token),
        json={
            "nodes": [
                {
                    "id": "n_customer",
                    "label": "客户",
                    "x": 120,
                    "y": 80,
                    "uri": "https://example.com/customer",
                    "rdfType": "Class",
                    "properties": {"priority": "high"},
                },
                {
                    "id": "n_order",
                    "label": "订单",
                    "x": 260.5,
                    "y": 180.25,
                },
            ],
            "edges": [
                {
                    "id": "e_places",
                    "source": "n_customer",
                    "target": "n_order",
                    "label": "下单",
                    "predicate": "https://example.com/places",
                    "properties": {"confidence": 0.95},
                }
            ],
        },
    )

    assert save_response.status_code == 200
    saved_project = save_response.json()["data"]
    assert saved_project["nodes"] == [
        {
            "id": "n_customer",
            "label": "客户",
            "x": 120.0,
            "y": 80.0,
            "uri": "https://example.com/customer",
            "rdfType": "Class",
            "properties": {"priority": "high"},
        },
        {
            "id": "n_order",
            "label": "订单",
            "x": 260.5,
            "y": 180.25,
            "uri": None,
            "rdfType": None,
            "properties": None,
        },
    ]
    assert saved_project["edges"] == [
        {
            "id": "e_places",
            "source": "n_customer",
            "target": "n_order",
            "label": "下单",
            "predicate": "https://example.com/places",
            "properties": {"confidence": 0.95},
        }
    ]

    replace_response = client.put(
        f"/api/projects/{project['id']}/graph",
        headers=auth_headers(access_token),
        json={
            "nodes": [
                {
                    "id": "n_account",
                    "label": "账号",
                    "x": 10,
                    "y": 20,
                }
            ],
            "edges": [],
        },
    )
    detail_response = client.get(
        f"/api/projects/{project['id']}",
        headers=auth_headers(access_token),
    )

    assert replace_response.status_code == 200
    assert detail_response.json()["data"]["nodes"] == [
        {
            "id": "n_account",
            "label": "账号",
            "x": 10.0,
            "y": 20.0,
            "uri": None,
            "rdfType": None,
            "properties": None,
        }
    ]
    assert detail_response.json()["data"]["edges"] == []


def test_get_graph_and_atomic_node_lifecycle(client: TestClient) -> None:
    access_token = register_user(client)
    project = create_project(client, access_token)

    graph_response = client.get(
        f"/api/projects/{project['id']}/graph",
        headers=auth_headers(access_token),
    )
    create_response = client.post(
        f"/api/projects/{project['id']}/nodes",
        headers=auth_headers(access_token),
        json={
            "id": "n_customer",
            "label": "客户",
            "x": 120,
            "y": 80,
            "properties": {"tier": "gold"},
        },
    )
    duplicate_response = client.post(
        f"/api/projects/{project['id']}/nodes",
        headers=auth_headers(access_token),
        json={
            "id": "n_customer",
            "label": "重复客户",
            "x": 0,
            "y": 0,
        },
    )
    update_response = client.patch(
        f"/api/projects/{project['id']}/nodes/n_customer",
        headers=auth_headers(access_token),
        json={
            "label": "重点客户",
            "x": 180,
            "properties": {"tier": "platinum"},
        },
    )
    delete_response = client.delete(
        f"/api/projects/{project['id']}/nodes/n_customer",
        headers=auth_headers(access_token),
    )

    assert graph_response.status_code == 200
    assert graph_response.json()["data"]["nodes"] == []
    assert graph_response.json()["data"]["edges"] == []

    assert create_response.status_code == 201
    created_project = create_response.json()["data"]
    assert created_project["nodes"] == [
        {
            "id": "n_customer",
            "label": "客户",
            "x": 120.0,
            "y": 80.0,
            "uri": None,
            "rdfType": None,
            "properties": {"tier": "gold"},
        }
    ]

    assert duplicate_response.status_code == 400
    assert duplicate_response.json()["message"] == "节点 ID 不能重复"

    assert update_response.status_code == 200
    updated_node = update_response.json()["data"]["nodes"][0]
    assert updated_node["label"] == "重点客户"
    assert updated_node["x"] == 180.0
    assert updated_node["y"] == 80.0
    assert updated_node["properties"] == {"tier": "platinum"}

    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["nodes"] == []
    assert delete_response.json()["data"]["edges"] == []


def test_atomic_edge_lifecycle_and_reference_validation(
    client: TestClient,
) -> None:
    access_token = register_user(client)
    project = create_project(client, access_token)

    for node_id, label in [("n_customer", "客户"), ("n_order", "订单")]:
        response = client.post(
            f"/api/projects/{project['id']}/nodes",
            headers=auth_headers(access_token),
            json={"id": node_id, "label": label, "x": 0, "y": 0},
        )
        assert response.status_code == 201

    invalid_edge_response = client.post(
        f"/api/projects/{project['id']}/edges",
        headers=auth_headers(access_token),
        json={
            "id": "e_invalid",
            "source": "n_customer",
            "target": "n_missing",
            "label": "下单",
        },
    )
    create_edge_response = client.post(
        f"/api/projects/{project['id']}/edges",
        headers=auth_headers(access_token),
        json={
            "id": "e_places",
            "source": "n_customer",
            "target": "n_order",
            "label": "下单",
            "properties": {"confidence": 0.8},
        },
    )
    duplicate_edge_response = client.post(
        f"/api/projects/{project['id']}/edges",
        headers=auth_headers(access_token),
        json={
            "id": "e_places",
            "source": "n_customer",
            "target": "n_order",
            "label": "重复边",
        },
    )
    update_edge_response = client.patch(
        f"/api/projects/{project['id']}/edges/e_places",
        headers=auth_headers(access_token),
        json={
            "label": "创建订单",
            "predicate": "https://example.com/places",
            "properties": {"confidence": 0.95},
        },
    )
    delete_edge_response = client.delete(
        f"/api/projects/{project['id']}/edges/e_places",
        headers=auth_headers(access_token),
    )

    assert invalid_edge_response.status_code == 400
    assert invalid_edge_response.json()["message"] == "边引用了不存在的节点"

    assert create_edge_response.status_code == 201
    assert create_edge_response.json()["data"]["edges"] == [
        {
            "id": "e_places",
            "source": "n_customer",
            "target": "n_order",
            "label": "下单",
            "predicate": None,
            "properties": {"confidence": 0.8},
        }
    ]

    assert duplicate_edge_response.status_code == 400
    assert duplicate_edge_response.json()["message"] == "边 ID 不能重复"

    assert update_edge_response.status_code == 200
    updated_edge = update_edge_response.json()["data"]["edges"][0]
    assert updated_edge["label"] == "创建订单"
    assert updated_edge["predicate"] == "https://example.com/places"
    assert updated_edge["properties"] == {"confidence": 0.95}

    assert delete_edge_response.status_code == 200
    assert delete_edge_response.json()["data"]["edges"] == []


def test_atomic_delete_node_cascades_incident_edges(client: TestClient) -> None:
    access_token = register_user(client)
    project = create_project(client, access_token)

    for node_id in ["n_1", "n_2", "n_3"]:
        response = client.post(
            f"/api/projects/{project['id']}/nodes",
            headers=auth_headers(access_token),
            json={"id": node_id, "label": node_id, "x": 0, "y": 0},
        )
        assert response.status_code == 201
    for edge in [
        {"id": "e_12", "source": "n_1", "target": "n_2", "label": "关联"},
        {"id": "e_23", "source": "n_2", "target": "n_3", "label": "关联"},
    ]:
        response = client.post(
            f"/api/projects/{project['id']}/edges",
            headers=auth_headers(access_token),
            json=edge,
        )
        assert response.status_code == 201

    delete_response = client.delete(
        f"/api/projects/{project['id']}/nodes/n_2",
        headers=auth_headers(access_token),
    )

    assert delete_response.status_code == 200
    graph = delete_response.json()["data"]
    assert [node["id"] for node in graph["nodes"]] == ["n_1", "n_3"]
    assert graph["edges"] == []


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (
            {
                "nodes": [
                    {"id": "n_1", "label": "节点", "x": 0, "y": 0},
                    {"id": "n_1", "label": "重复节点", "x": 1, "y": 1},
                ],
                "edges": [],
            },
            "节点 ID 不能重复",
        ),
        (
            {
                "nodes": [
                    {"id": "n_1", "label": "节点", "x": 0, "y": 0},
                ],
                "edges": [
                    {
                        "id": "e_1",
                        "source": "n_1",
                        "target": "n_missing",
                        "label": "关系",
                    }
                ],
            },
            "边引用了不存在的节点",
        ),
        (
            {
                "nodes": [
                    {"id": "n_1", "label": "节点", "x": 0, "y": 0},
                ],
                "edges": [
                    {"id": "e_1", "source": "n_1", "target": "n_1", "label": "A"},
                    {"id": "e_1", "source": "n_1", "target": "n_1", "label": "B"},
                ],
            },
            "边 ID 不能重复",
        ),
    ],
)
def test_save_graph_rejects_invalid_graph(
    client: TestClient,
    payload: dict,
    message: str,
) -> None:
    access_token = register_user(client)
    project = create_project(client, access_token)

    response = client.put(
        f"/api/projects/{project['id']}/graph",
        headers=auth_headers(access_token),
        json=payload,
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": 40001,
        "message": message,
        "data": None,
    }


def test_user_cannot_access_another_users_project(client: TestClient) -> None:
    owner_token = register_user(client)
    project = create_project(client, owner_token)
    other_token = register_user(
        client,
        email="other@example.com",
        username="other_user",
    )

    response = client.get(
        f"/api/projects/{project['id']}",
        headers=auth_headers(other_token),
    )

    assert response.status_code == 403
    assert response.json() == {
        "code": 40301,
        "message": "无权限访问该项目",
        "data": None,
    }


def test_missing_project_returns_not_found(client: TestClient) -> None:
    access_token = register_user(client)

    response = client.get(
        "/api/projects/p_missing",
        headers=auth_headers(access_token),
    )

    assert response.status_code == 404
    assert response.json() == {
        "code": 40401,
        "message": "项目不存在",
        "data": None,
    }


def test_delete_project_cascades_graph_data(client: TestClient) -> None:
    from app.models.graph import GraphEdgeModel, GraphNodeModel

    access_token = register_user(client)
    project = create_project(client, access_token)
    client.put(
        f"/api/projects/{project['id']}/graph",
        headers=auth_headers(access_token),
        json={
            "nodes": [
                {"id": "n_1", "label": "节点 1", "x": 0, "y": 0},
                {"id": "n_2", "label": "节点 2", "x": 1, "y": 1},
            ],
            "edges": [{"id": "e_1", "source": "n_1", "target": "n_2", "label": "关系"}],
        },
    )

    delete_response = client.delete(
        f"/api/projects/{project['id']}",
        headers=auth_headers(access_token),
    )
    detail_response = client.get(
        f"/api/projects/{project['id']}",
        headers=auth_headers(access_token),
    )

    db: Session = next(app.dependency_overrides[get_db]())
    try:
        node_count = len(db.scalars(select(GraphNodeModel)).all())
        edge_count = len(db.scalars(select(GraphEdgeModel)).all())
    finally:
        db.close()

    assert delete_response.status_code == 200
    assert delete_response.json()["data"] == {
        "deleted": True,
        "projectId": project["id"],
    }
    assert detail_response.status_code == 404
    assert node_count == 0
    assert edge_count == 0


# ---- 成员与权限测试 ----


def _register_two_users(client: TestClient) -> tuple[str, str, str, str]:
    """注册 owner 和 collaborator。

    返回 (owner_token, collab_token, collab_email, collab_user_id)。
    """
    owner_token = register_user(client)
    collab_token = register_user(
        client,
        email="collab@example.com",
        username="collab_user",
    )
    # 取 collaborator 的 user id（通过 /me）
    me = client.get("/api/auth/me", headers=auth_headers(collab_token)).json()["data"]
    return owner_token, collab_token, "collab@example.com", me["id"]


def test_add_member_and_collaborator_sees_project(client: TestClient) -> None:
    owner_token, collab_token, collab_email, _ = _register_two_users(client)
    project = create_project(client, owner_token)

    # owner 邀请 collaborator 为 editor
    resp = client.post(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(owner_token),
        json={"email": collab_email, "role": "editor"},
    )
    assert resp.status_code == 201
    member = resp.json()["data"]
    assert member["role"] == "editor"
    assert member["email"] == collab_email

    # collaborator 在 list_projects 里能看到该项目，myRole=editor
    listing = client.get("/api/projects", headers=auth_headers(collab_token)).json()[
        "data"
    ]
    shared = [p for p in listing if p["id"] == project["id"]]
    assert len(shared) == 1
    assert shared[0]["myRole"] == "editor"


def test_editor_can_write_but_cannot_manage(client: TestClient) -> None:
    owner_token, collab_token, collab_email, _ = _register_two_users(client)
    project = create_project(client, owner_token)
    client.post(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(owner_token),
        json={"email": collab_email, "role": "editor"},
    )

    # editor 能创建节点
    node_resp = client.post(
        f"/api/projects/{project['id']}/nodes",
        headers=auth_headers(collab_token),
        json={"id": "n_1", "label": "节点", "x": 1, "y": 2},
    )
    assert node_resp.status_code == 201

    # editor 不能删除项目（40301）
    del_resp = client.delete(
        f"/api/projects/{project['id']}",
        headers=auth_headers(collab_token),
    )
    assert del_resp.status_code == 403
    assert del_resp.json()["code"] == 40301

    # editor 不能列出成员（40301）
    members_resp = client.get(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(collab_token),
    )
    assert members_resp.status_code == 403
    assert members_resp.json()["code"] == 40301


def test_viewer_cannot_write(client: TestClient) -> None:
    owner_token, collab_token, collab_email, _ = _register_two_users(client)
    project = create_project(client, owner_token)
    client.post(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(owner_token),
        json={"email": collab_email, "role": "viewer"},
    )

    # viewer 能读图
    graph_resp = client.get(
        f"/api/projects/{project['id']}/graph",
        headers=auth_headers(collab_token),
    )
    assert graph_resp.status_code == 200

    # viewer 不能创建节点（40301）
    node_resp = client.post(
        f"/api/projects/{project['id']}/nodes",
        headers=auth_headers(collab_token),
        json={"id": "n_1", "label": "节点", "x": 1, "y": 2},
    )
    assert node_resp.status_code == 403
    assert node_resp.json()["code"] == 40301


def test_owner_can_change_role_and_remove_member(client: TestClient) -> None:
    owner_token, collab_token, collab_email, collab_id = _register_two_users(client)
    project = create_project(client, owner_token)
    client.post(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(owner_token),
        json={"email": collab_email, "role": "editor"},
    )

    # owner 改角色为 viewer
    patch_resp = client.patch(
        f"/api/projects/{project['id']}/members/{collab_id}",
        headers=auth_headers(owner_token),
        json={"role": "viewer"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["role"] == "viewer"

    # 改完后 collaborator 写操作被拦
    node_resp = client.post(
        f"/api/projects/{project['id']}/nodes",
        headers=auth_headers(collab_token),
        json={"id": "n_1", "label": "节点", "x": 1, "y": 2},
    )
    assert node_resp.status_code == 403

    # owner 移除成员
    del_resp = client.delete(
        f"/api/projects/{project['id']}/members/{collab_id}",
        headers=auth_headers(owner_token),
    )
    assert del_resp.status_code == 200

    # 移除后 collaborator 看不到该项目
    listing = client.get("/api/projects", headers=auth_headers(collab_token)).json()[
        "data"
    ]
    assert not any(p["id"] == project["id"] for p in listing)


def test_duplicate_member_returns_40901(client: TestClient) -> None:
    owner_token, _, collab_email, _ = _register_two_users(client)
    project = create_project(client, owner_token)
    client.post(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(owner_token),
        json={"email": collab_email, "role": "editor"},
    )

    resp = client.post(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(owner_token),
        json={"email": collab_email, "role": "viewer"},
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == 40901


def test_add_nonexistent_email_returns_40401(client: TestClient) -> None:
    owner_token, _, _, _ = _register_two_users(client)
    project = create_project(client, owner_token)

    resp = client.post(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(owner_token),
        json={"email": "ghost@example.com", "role": "editor"},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == 40401


# ---- 导入导出测试 ----


def _save_graph(client: TestClient, token: str, project_id: str, payload: dict) -> None:
    resp = client.put(
        f"/api/projects/{project_id}/graph",
        headers=auth_headers(token),
        json=payload,
    )
    assert resp.status_code == 200


def test_export_and_import_rdf_turtle_roundtrip(client: TestClient) -> None:
    token = register_user(client)
    project = create_project(client, token)
    _save_graph(
        client,
        token,
        project["id"],
        {
            "nodes": [
                {
                    "id": "n_customer",
                    "label": "客户",
                    "x": 10,
                    "y": 20,
                    "uri": "https://example.com/customer",
                    "rdfType": "https://example.com/Customer",
                },
                {
                    "id": "n_order",
                    "label": "订单",
                    "x": 30,
                    "y": 40,
                    "uri": "https://example.com/order",
                },
            ],
            "edges": [
                {
                    "id": "e_places",
                    "source": "n_customer",
                    "target": "n_order",
                    "label": "下单",
                    "predicate": "https://example.com/places",
                }
            ],
        },
    )

    # 导出 Turtle
    exp = client.get(
        f"/api/projects/{project['id']}/export?fmt=turtle",
        headers=auth_headers(token),
    )
    assert exp.status_code == 200
    turtle_content = exp.text
    assert "客户" in turtle_content
    # rdflib 会用 @prefix 缩写 URI，检查谓词本地名即可
    assert "places" in turtle_content
    # 坐标不应出现在 Turtle 里
    assert '"x"' not in turtle_content and "'x'" not in turtle_content

    # 导入 Turtle 建新项目
    imp = client.post(
        "/api/projects/import",
        headers=auth_headers(token),
        data={"fmt": "turtle"},
        files={"file": ("customer.ttl", turtle_content, "text/turtle")},
    )
    assert imp.status_code == 201
    new_project = imp.json()["data"]
    # 往返后节点 label 保留
    labels = sorted(n["label"] for n in new_project["nodes"])
    assert "客户" in labels
    assert "订单" in labels
    # 边的 predicate 保留
    assert any(
        e["predicate"] == "https://example.com/places" for e in new_project["edges"]
    )


def test_export_and_import_pg_json_roundtrip(client: TestClient) -> None:
    token = register_user(client)
    project = create_project(client, token)
    _save_graph(
        client,
        token,
        project["id"],
        {
            "nodes": [
                {
                    "id": "n_1",
                    "label": "客户",
                    "x": 10,
                    "y": 20,
                    "properties": {"priority": "high"},
                },
            ],
            "edges": [],
        },
    )

    exp = client.get(
        f"/api/projects/{project['id']}/export?fmt=json",
        headers=auth_headers(token),
    )
    assert exp.status_code == 200
    payload = exp.json()
    # 坐标不应导出
    assert "x" not in payload["nodes"][0]
    assert payload["nodes"][0]["properties"] == {"priority": "high"}

    imp = client.post(
        "/api/projects/import",
        headers=auth_headers(token),
        data={"fmt": "json"},
        files={"file": ("graph.json", json.dumps(payload), "application/json")},
    )
    assert imp.status_code == 201
    new_project = imp.json()["data"]
    assert any(n["label"] == "客户" for n in new_project["nodes"])
    assert new_project["nodes"][0]["properties"] == {"priority": "high"}


def test_export_unsupported_format_returns_40001(client: TestClient) -> None:
    token = register_user(client)
    project = create_project(client, token)
    # 不支持的格式 → 40001
    resp = client.get(
        f"/api/projects/{project['id']}/export?fmt=xml",
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == 40001


def test_import_invalid_json_returns_40001_no_project(client: TestClient) -> None:
    token = register_user(client)
    resp = client.post(
        "/api/projects/import",
        headers=auth_headers(token),
        data={"fmt": "json"},
        files={"file": ("bad.json", "{not valid json", "application/json")},
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == 40001

    # 不应产生新项目（该用户注册后尚未建任何项目）
    listing = client.get("/api/projects", headers=auth_headers(token)).json()["data"]
    assert len(listing) == 0
