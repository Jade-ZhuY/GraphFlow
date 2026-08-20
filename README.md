# Graph Flow

知识图谱全栈工作台。基于 FastAPI 与 React 19，围绕三大核心业务：**图谱设计**、**图谱咨询**、**图谱检索**。

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![React](https://img.shields.io/badge/React-19-61dafb)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)

## 业务一：图谱设计

可视化编辑知识图谱，支持 RDF（uri / predicate）与属性图（PG）双数据模型。

### 核心能力

- **D3 力导向画布**：节点 / 边在线拖拽编辑，缩放、平移、适配画布，流畅交互
- **双数据模型**：RDF（uri / predicate）与属性图（PG）统一支持，导入导出由前端指定格式（Turtle / JSON-LD / JSON）
- **编辑状态同步**：saved / unsaved / syncing / error 四态状态机，离开前未保存确认，草稿恢复
- **动态属性**：节点和边均可挂载自定义 properties（键值对），灵活扩展
- **导入导出**：支持 Turtle、JSON-LD、JSON 三种格式导入，自动解析并创建项目；导出同样支持三种格式

### 技术实现

- 画布：D3 force simulation + SVG 渲染
- 编辑器：React + Zustand 全局状态管理（useGraphStore + useEditorSyncStore）
- 后端：FastAPI + SQLAlchemy 2 + MySQL，节点/边双表存储，replace_graph 整体替换

---

## 业务二：图谱咨询

内置 LLM 智能对话助手，支持多轮对话、意图识别、图谱草稿自动生成。

### 核心能力

- **LLM 智能体**：基于 langchain + langgraph 的 `create_agent`，SSE 流式回答，支持多轮对话上下文
- **语义路由意图识别**：前置 semantic-router 快速路由层，基于 embedding 相似度匹配（bge-m3），毫秒级分类固定意图，模糊意图交由 LLM 智能体兜底
- **固定意图专项处理**：
  - 打招呼（"你好""你是谁"）→ 固定回复，秒回，零 LLM 调用
  - 查项目（"我有哪些项目"）→ 直接查库返回项目列表，含节点/边统计
  - 建图（"帮我把这段描述做成图谱"）→ 纯指令句返回引导语；含素材则 LLM 提取实体/关系 → 生成图谱草稿 → 前端预览 → 确认保存为新项目
- **图谱草稿生成**：LLM 结构化提取实体和关系（with_structured_output），SSE 返回 `graph_draft` 事件，前端弹窗预览节点/边列表，确认后 `createProject` + `saveProjectGraph` 落库并跳转编辑器
- **嵌入模型独立配置**：embedding 服务（硅基流动）与对话 LLM（tokenrhythm）独立配置，互不干扰

### 技术实现

- 智能体：langchain `create_agent` + `ChatOpenAI`（deepseek-v4-flash），tools 可扩展
- 语义路由：semantic-router + LiteLLMEncoder + bge-m3（1024 维），余弦相似度阈值 0.5，启动预热，内存索引
- 流式输出：FastAPI `StreamingResponse` + SSE（chunk + 自定义事件 + [DONE]）
- 会话管理：conversations / messages 表，多轮对话历史，LLM 自动生成标题

---

## 业务三：图谱检索

GraphRAG 图谱检索问答——对用户已有的知识图谱做自然语言问答，关键词 + 语义 + 图遍历三层检索，LLM 流式生成答案。

### 核心能力

- **三层混合检索**：
  - 关键词匹配：字符串包含，精确命中节点 label / type / properties
  - 语义匹配：bge-m3 embedding + 余弦相似度，补关键词盲区（"科技公司"能匹配"星辰科技"）
  - BFS 图遍历：从种子节点沿边逐跳扩展 1-2 hop，收集关联实体和关系
- **LLM 流式生成答案**：子图结构化数据 + 用户问题 → prompt → ChatOpenAI 流式生成自然语言答案
- **子图预览**：前端实时渲染匹配节点卡片、关系列表、邻居节点，直观展示检索结果
- **多项目检索**：支持跨项目检索，遍历用户所有项目，按匹配度排序取 top 3，汇总生成答案
- **单项目检索**：选择指定项目精准检索，深入单个图谱的细节

### 技术实现

- 检索引擎：纯 Python 实现，零外部依赖（无 jieba、无 Neo4j、无向量数据库）
- 关键词提取：正则 + 中文滑动窗口 + 停用词过滤
- 语义匹配：复用 bge-m3 embedding API（与语义路由同一模型），litellm 调用
- 图遍历：纯 Python for 循环 + 集合操作，BFS 沿边扩展
- 流式输出：FastAPI `StreamingResponse` + SSE（chunk + subgraph + [DONE]），跟图谱咨询同模式

---

## 项目结构

| 目录 | 说明 |
| --- | --- |
| `backend/` | FastAPI 服务：认证、图谱设计 CRUD、LLM 咨询助手、语义路由、GraphRAG 检索 |
| `my-frontend/` | React 19 SPA：图谱编辑器、咨询助手、GraphRAG 检索页面 |

## 技术栈

**后端**：FastAPI · SQLAlchemy 2 · MySQL（默认）· PyJWT · Argon2 · langchain + langgraph · semantic-router · litellm

**前端**：React 19 · TypeScript · Vite · Ant Design 6 · Tailwind CSS 4 · D3 · Zustand

**嵌入模型**：BAAI/bge-m3（硅基流动，1024 维）

**对话模型**：deepseek-v4-flash-0731（tokenrhythm）

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
- 首次运行前复制 `.env.example` 为 `.env` 并填写 `DATABASE_URL`、`JWT_SECRET_KEY`、`LLM_*`、`EMBEDDING_*`
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
pytest                        # 62 例

# 前端（eslint + vitest + 构建）
cd my-frontend
pnpm lint
pnpm test                     # 50 例
pnpm build
```

## License

本项目采用 [Apache License 2.0](LICENSE)。