# Comm Agent

知识图谱设计与咨询助手。基于 FastAPI 与 React 的全栈知识工程工作台：可视化设计图谱、导入导出 RDF / 属性图（PG）数据，并内置 LLM 咨询助手与 GraphRAG 检索问答。

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![React](https://img.shields.io/badge/React-19-61dafb)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)

## 特性

- **图谱可视化编辑器**：D3 力导向布局，节点 / 边在线编辑，编辑状态同步与草稿恢复
- **双数据模型**：RDF（uri / predicate）与属性图（PG）统一支持，导入导出由前端指定格式
- **认证与项目**：JWT + 会话双令牌认证，知识图谱项目的多用户管理与协作分享
- **LLM 咨询助手**：基于 langchain + langgraph 的智能体，SSE 流式回答，配置走后端 `.env`
- **GraphRAG 问答**：对用户自己的图谱做关键词检索 + 邻居扩展，生成自然语言答案

## 项目结构

| 目录 | 说明 |
| --- | --- |
| `backend/` | FastAPI 服务：认证、图谱项目 CRUD、LLM 助手、GraphRAG 检索 |
| `my-frontend/` | React 19 SPA：图谱编辑器、咨询助手、GraphRAG 页面 |
| `docs/需求卡/` | 各功能的需求卡（先行文档，开发入口） |
| `CLAUDE.md` | 面向 AI 开发助手的架构说明与约定 |

## 技术栈

**后端**：FastAPI · SQLAlchemy 2 · MySQL（默认）· PyJWT · Argon2 · langchain + langgraph

**前端**：React 19 · TypeScript · Vite · Ant Design 6 · Tailwind CSS 4 · D3 · Zustand

## 快速开始

### 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
fastapi dev
```

- 交互式 API 文档：`http://127.0.0.1:8000/docs`
- 首次运行前复制 `.env.example` 为 `.env` 并填写 `DATABASE_URL`、`JWT_SECRET_KEY`、`LLM_*`
- 也可用图形化启动器：`python startup.py`

### 前端

```bash
cd my-frontend
pnpm install
pnpm dev
```

- 默认地址：`http://localhost:5173`（后端 CORS 已放行）
- 后端地址通过 `VITE_API_BASE_URL` 配置（默认 `http://127.0.0.1:8000`）

## 测试与质量

```powershell
# 后端（ruff + pytest）
cd backend
ruff check . && ruff format .
pytest

# 前端（eslint + vitest + 构建）
cd my-frontend
pnpm lint
pnpm test
pnpm build
```

## 文档

- **API 契约**：[`backend/BACKEND_AUTH_API_CONTRACT.md`](backend/BACKEND_AUTH_API_CONTRACT.md)
- **后端设计**：[`backend/图谱设计后端接入.md`](backend/图谱设计后端接入.md) · [`backend/项目管理和图谱设计.md`](backend/项目管理和图谱设计.md)
- **前端设计**：[`my-frontend/开发流程文档.md`](my-frontend/开发流程文档.md) · [`my-frontend/DEVELOPMENT_FLOW_V2.md`](my-frontend/DEVELOPMENT_FLOW_V2.md) · [`my-frontend/GRAPH_RAG_DESIGN.md`](my-frontend/GRAPH_RAG_DESIGN.md) · [`my-frontend/前端技术栈说明.md`](my-frontend/前端技术栈说明.md)
- **需求卡**：`docs/需求卡/`（知识图谱设计、导入导出标准格式、LLM 智能体、编辑态一致性、协作与权限）

## 配置与安全

- `.env` 一律不入库：本地复制对应 `.env.example` 后填写，勿提交真实密钥
- 数据库默认 MySQL（`mysql+pymysql://root:1234@localhost:3306/comm_agent`），可用 `DATABASE_URL` 覆盖
- 后端 `JWT_SECRET_KEY` 与 LLM API Key 仅存于后端 `.env`

## License

本项目采用 [Apache License 2.0](LICENSE)。
