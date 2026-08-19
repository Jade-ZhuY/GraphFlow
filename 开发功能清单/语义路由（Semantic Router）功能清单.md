# 语义路由（Semantic Router）功能清单

> 更新时间：2026-08-18 ｜ 所属模块：后端 / 图谱咨询助手

## 一句话概述

给聊天助手加一道**「不花钱、毫秒级」的快速意图分流闸门**：高频固定意图（查项目）走 embedding 秒分类、专项处理，模糊/未定义意图返回 `None` 交给 LLM 智能体兜底。

---

## 背景与动机

- 聊天助手用 langchain `create_agent` 构建，每条消息都走 LLM，**按 token 收费 + 首 token 延迟高**。
- "我有哪些项目"这类固定意图是确定性操作，无需大模型，走一次 LLM 是纯浪费。
- 目标：高频固定意图 → embedding 秒级分类（不花 LLM 钱）；开放问题 → LLM 兜底。

## 核心作用（价值点）

1. **省成本**：固定意图不消耗 LLM token。
2. **降延迟**：embedding 毫秒级返回，固定操作秒回。
3. **拆分职责**：简单确定性操作不绕智能体的工具调用流程。

---

## 架构流程

```
用户消息
   │
   ▼
classify_intent(query)  ← embedding 相似度匹配（semantic-router）
   │
   ├─ 命中 query_project ──► 查数据库项目列表 → 结构化回复（不调 LLM，SSE 逐字返回）
   │
   ├─ 命中 build_graph ────► 引导语 / LLM 提取图谱草稿 → SSE graph_draft 事件 → 前端预览保存
   │
   └─ 未命中 / None ────────► 落回 create_agent 智能体（LLM 流式问答）
```

未配置 embedding（`EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` 为空）或 embedding 异常时，`classify_intent` 一律返回 `None`，保证智能体主流程不受影响。

---

## 已开发完成的实现

### 意图定义（`backend/app/services/intent_router.py`）

| 意图名 | 含义 | 当前处理 |
|---|---|---|
| `query_project` | 查项目（"我有哪些项目"等 6 条 utterances） | ✅ 专项处理：查库返回项目列表 |
| `build_graph` | 自动建图（"帮我建个图谱"等 5 条） | ✅ 专项处理：提取图谱草稿 → 前端预览保存（见下节） |
| `chat` | 图谱咨询（"RDF和属性图有什么区别"等 6 条） | ⏳ 命中后仍落回 LLM |

### 关键实现点

- **懒加载**：`semantic_router` 包只在 `_build_router()` 内按需 import，避免顶层 import 拖慢后端启动（实测启动 import 8.45s → 1.71s）。
- **缓存**：`_build_router` 用 `lru_cache(maxsize=1)` 缓存 router 实例，避免每次请求重建 embedding 索引。
- **单次入库**：`SemanticRouter(encoder=encoder)` 构造时不传 routes，只经 `router.add(routes)` 一次 embedding 入库，避免 `self.routes` 重复。
- **异常兜底**：`classify_intent` 吞掉 embedding 异常并返回 `None`，日志记 warning。

### 意图专项处理（`backend/app/services/assistant_service.py`）

- `prepare_chat` 在 SSE 流开始前调用 `classify_intent`，命中 `query_project` 时：
  - `_query_projects_reply()`：查 owned + 共享项目，拼结构化回复（含节点/边统计）。
  - `_static_event_stream()`：把固定回复按 SSE chunk 逐字发出，保持前端打字机效果。
  - 消息照常落库（user + assistant 两条），会话标题逻辑不受影响。

### build_graph 图谱草稿生成（方案 B）

- `_build_graph_handler`：纯指令句（`looks_like_material` 判定 <30 字）→ 返回引导语（零 LLM）；含素材 → LLM 提取。
- `graph_draft_service.extract_graph_draft`：`with_structured_output(GraphDraft)`（json_mode）+ prompt 兜底；解析失败/节点<2 → 返回 `None` 回退引导语；丢弃悬空边。
- SSE 新增 `graph_draft` 事件：文字说明 chunk + `{"type":"graph_draft","draft":{title,nodes,edges}}` + `[DONE]`。
- 前端 `GraphDraftDialog`：列表卡片预览 → 输入项目名 → `createProject` + `saveProjectGraph` 落库 → 跳转 `/editor/{id}`。
- 详见《build_graph图谱草稿生成-实现方案.md》。

---

## 涉及文件

| 文件 | 改动 |
|---|---|
| `backend/app/services/intent_router.py` | 新增：意图 utterances 数据 + 路由构建 + 分类入口 |
| `backend/app/services/assistant_service.py` | 修改：接入 classify_intent + 查项目/建图专项处理 |
| `backend/app/services/graph_draft_service.py` | 新增：图谱草稿提取（LLM 结构化输出 + 兜底） |
| `backend/app/core/config.py` | 修改：新增 `embedding_base_url/api_key/model` 配置 |
| `backend/.env.example` | 修改：新增 `EMBEDDING_*` 配置示例 |
| `backend/pyproject.toml` | 修改：新增依赖 `semantic-router>=0.1.2` |
| `backend/tests/test_intent_router.py` | 新增：路由分类单测（4 例） |
| `backend/tests/test_graph_draft_service.py` | 新增：提取/兜底单测（11 例） |
| `backend/tests/test_assistant.py` | 修改：新增 build_graph SSE 测试（3 例） |
| `my-frontend/src/types/assistant.ts` | 修改：新增 `GraphDraft` 类型 |
| `my-frontend/src/services/assistantApi.ts` | 修改：`chatStream` 解析 `graph_draft` 事件 |
| `my-frontend/src/stores/useAssistantStore.ts` | 修改：`graphDraft` 状态 + setter |
| `my-frontend/src/components/GraphDraftDialog/*` | 新增：草稿预览弹窗（列表 + 保存为项目） |
| `my-frontend/src/pages/AssistantPage/index.tsx` | 修改：接入草稿弹窗 |

---

## 配置项（走 .env，与对话 LLM 独立）

| 变量 | 默认 | 说明 |
|---|---|---|
| `EMBEDDING_BASE_URL` | `https://api.siliconflow.cn/v1` | embedding 服务地址（硅基流动） |
| `EMBEDDING_API_KEY` | 无 | embedding 服务密钥 |
| `EMBEDDING_MODEL` | `Qwen/Qwen3-VL-Embedding-8B` | embedding 模型 |

---

## 测试与验证

- `test_intent_router.py`：4 个测试全过（命中返回意图名 / 未命中返回 None / 未配置返回 None / 异常吞掉返回 None）。
- 测试耗时：9.18s → **0.23s**（懒加载后 import 不再拖慢测试）。
- `test_graph_draft_service.py`：11 个测试全过（启发式边界 / 结构化提取 / JSON 兜底 / 围栏容忍 / 失败回 None / 悬空边过滤）。
- `test_assistant.py`：9 个测试全过（含 build_graph 三条：SSE 发 graph_draft 帧、短指令引导、提取失败回退引导）。
- 后端全套：**50 个测试全过**。
- 前端：`tsc -b` 类型检查通过、vitest **50 个测试全过**、`vite build` 构建成功。

---

## 待办 / 后续开发（未完成）

1. **embedding 模型选型**：默认 `Qwen3-VL-Embedding-8B` 是 8B 多模态模型，文本语义路由偏重、延迟高，建议换 `BAAI/bge-m3`（中文友好、秒级）。
2. **避免阻塞事件循环**：`classify_intent` 是同步调用（内部 HTTP），跑在 async 请求里可能卡住事件循环，建议 `asyncio.to_thread` 包一层（`build_graph` 分支已用 `to_thread`，`query_project`/`chat` 尚未）。
3. **embedding 故障降级**：embedding 服务持续不可用时每次请求都会重试构建（lru_cache 不缓存异常），建议缓存"不可用"哨兵状态。
4. **路由效果调优**：utterances 数量少，可后续补充样本；可评估各意图命中/误命中率。
5. **build_graph 草稿增强**：草稿坐标目前由前端网格生成，可改后端力导向/语义布局；预览可扩展为画布可视化（需改造 GraphCanvas 支持外部数据）。

---

## 备注

- semantic-router 版本：0.1.2（较老，LiteLLMEncoder 会把 api_key 强制写入全局环境变量 `HOSTED_VLLM_API_KEY`，注意副作用）。
- `hosted_vllm` + 硅基流动链路已验证可行：litellm 会把 `EMBEDDING_BASE_URL` 拼成 `.../v1/embeddings`，model 放请求体。
