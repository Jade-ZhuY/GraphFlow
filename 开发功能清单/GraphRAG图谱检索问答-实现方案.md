# GraphRAG 图谱检索问答 · 实现方案

> 状态：待评审 ｜ 日期：2026-08-19

## 概述

对用户已有的知识图谱做自然语言问答：选项目 → 输入问题 → 关键词匹配 + 图遍历 → 筛选子图 → LLM 流式生成答案。架构跟 build_graph 草稿生成同模式（后端检索 + LLM 生成 + SSE 流式 + 前端预览）。

## 技术方案

```
用户选项目 + 输入问题
         │
         ▼
  POST /api/graphrag/query  { projectId, query }
         │
         ▼
  ┌─────────────────────────────────────────┐
  │  graph_rag_service.py                   │
  │                                         │
  │  ① 关键词提取（纯 Python 正则 + 停用词）   │
  │  ② 种子节点匹配（遍历 label/type/props）   │
  │  ③ 邻居扩展（BFS 1-2 hop）               │
  │  ④ 子图裁剪（topK 节点 + 关联边）          │
  │  ⑤ LLM 生成答案（SSE 流式）               │
  └─────────────────────────────────────────┘
         │
         ▼
  SSE：chunk(逐token) + subgraph(节点/边) + [DONE]
```

## 后端改动

### 1. 新增 `backend/app/services/graph_rag_service.py`

核心函数（模块函数，不建类，跟 graph_draft_service 同风格）：

| 函数 | 职责 |
|---|---|
| `extract_keywords(query)` | 正则 + 停用词过滤 + 中文字符滑动窗口，返回关键词列表 |
| `match_nodes(nodes, keywords, top_k)` | 遍历节点，label/type/properties 关键词匹配 + 打分，返回 topK |
| `expand_neighbors(seed_ids, edges, depth)` | BFS 沿边走，返回 `(reached_node_ids, included_edges)` |
| `build_subgraph(project, keywords, top_k, hop_depth)` | 串联上面三步，返回子图 dict |
| `stream_answer(project, subgraph, query)` | 异步生成器，逐 token SSE + subgraph 帧 + [DONE] |

**不引入新依赖**：关键词提取用纯 Python 正则 + 停用词集合，不装 jieba。

**LLM 复用**：`_create_llm(streaming=True)` 的配置方式（跟 assistant_service 一致）。

### 2. 新增 `backend/app/api/routes/graphrag.py`

```
POST /api/graphrag/query
  body: { projectId, query, topK?, hopDepth? }
  response: SSE 流
    chunk: {"type":"chunk","content":"..."}
    subgraph: {"type":"subgraph","data":{matchedNodes,matchedEdges,subgraph}}
    [DONE]
```

- 权限校验：复用 `ProjectService._get_accessible_project`，要求 viewer+
- 返回 `StreamingResponse`，跟 assistant/chat 同模式

### 3. 修改 `backend/app/main.py`

挂载新路由：`app.include_router(graphrag_router, prefix="/api/graphrag", tags=["graphrag"])`

### 4. 测试

- 新增 `backend/tests/test_graph_rag_service.py`：
  - `extract_keywords` 分词/停用词/中文滑动窗口
  - `match_nodes` 打分/排序/topK
  - `expand_neighbors` 1-hop/2-hop/深度限制
  - `build_subgraph` 端到端（造一个假 ProjectModel）
  - `stream_answer` mock LLM → 断言 SSE 帧

## 前端改动

### 1. 新增 `my-frontend/src/services/graphragApi.ts`

```ts
queryGraph(projectId, query, handlers: { onChunk, onSubgraph, onDone, onError })
```

SSE 消费模式跟 `assistantApi.chatStream` 完全一致，新增 `onSubgraph` 回调。

### 2. 修改 `my-frontend/src/pages/GraphRagPage/index.tsx`

- `handleSearch`：从 `searchGraph()` 同步调用 → `graphragApi.queryGraph()` SSE 流式
- 答案区域：从静态渲染 `result.answer` → 流式拼接（仿 `AssistantPage` 的 `ChatMessage`）
- 子图预览：从 `result.subgraph` → `onSubgraph` 回调触发，渲染逻辑不变（节点卡/边列表已存在）
- `loading` 状态：`setLoading(true)` → SSE 开始，`onDone`/`onError` → `setLoading(false)`

### 3. 不需要改动的文件

- `graphRagEngine.ts`：保留不动（后续可能仍需本地离线检索），但 GraphRagPage 不再调用它
- `types/graphRag.ts`：`RagSearchResult` 类型保留，新增 `GraphRagStreamHandlers` 接口
- `GraphRagPage/index.css`：子图预览样式不变

## 跟现有代码的复用

| 复用 | 来源 |
|---|---|
| LLM 实例化 | `assistant_service._create_llm(streaming=True)` 的配置方式 |
| SSE 协议 | `assistant/chat` 的 chunk + 自定义事件 + [DONE] 模式 |
| 权限校验 | `ProjectService._get_accessible_project` |
| 查项目数据 | `ProjectRepository.get_project_by_id` |
| 前端 SSE 消费 | `assistantApi.chatStream` 的解析模式 |
| 前端子图预览 | `GraphRagPage` 已有的节点卡/边列表渲染 |
| 路由注册 | `main.py` 的 `include_router` 模式 |

## 不引入的依赖

- ❌ 不装 jieba（纯 Python 正则分词）
- ❌ 不装向量数据库（几十条向量，numpy 内存够用）
- ❌ 不装 Neo4j（MySQL + Python for 循环遍历）
- ✅ 零新依赖，所有库都已在 pyproject.toml 中

## 验证

1. 后端：`pytest tests/test_graph_rag_service.py` 全部通过
2. 后端：`pytest tests/` 全部通过（不破坏现有 50 例）
3. 前端：`tsc -b` 类型检查通过，`vitest run` 全部通过
4. 手动：选一个项目，输入问题，流式出答案 + 子图预览