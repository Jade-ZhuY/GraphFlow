# build_graph 图谱草稿生成 · 实现方案

> 状态：已实现（2026-08-18） ｜ 对应功能清单：《语义路由（Semantic Router）功能清单》

## Context

当前 semantic router 命中 `build_graph` 意图后没有任何专项处理，直接落回 LLM 聊天。本方案（方案 B）让该意图真正落地：**收集用户素材 → LLM 提取实体/关系 → 返回图谱草稿 → 前端预览 → 确认后保存为新项目**。纯指令句（无素材）则返回引导语，不调 LLM。

已确认的产品决策：预览用**列表卡片**（不复用画布组件）；保存目标**只新建项目**（不做覆盖已有项目）。

## 交互流程

```
用户消息
   │ classify_intent 命中 build_graph
   ├─ 纯指令句（短，无素材）──► 返回引导语（_static_event_stream，零 LLM）
   │                          └─ 用户随后贴素材 → 再次命中 build_graph 走提取
   └─ 含素材 ──► LLM 提取实体/关系（graph_draft_service）
               ├─ 提取失败 / 空节点 ──► 回退引导语
               └─ 成功 ──► SSE：文字说明 chunk + {"type":"graph_draft","draft":{...}} + [DONE]
                               │
                               ▼ 前端 AssistantPage
                    弹窗「图谱草稿预览」（GraphDraftDialog，列表卡片）
                               │ 用户输入项目名 → 确认
                               ▼
                    projectApi.createProject({name})
                    → projectApi.saveProjectGraph(id, {nodes, edges})
                    → message.success → navigate(`/editor/${projectId}`)
```

## SSE 协议扩展

新增事件类型（放在文字 chunk 之后、`[DONE]` 之前）：

```json
{"type": "graph_draft", "draft": {"title": "…", "nodes": [{"id": "n1", "label": "张三", "rdfType": "人物"}], "edges": [{"id": "e1", "source": "n1", "target": "n2", "label": "任职于"}]}}
```

前端 `chatStream` 只认 `chunk`/`error`/`[DONE]`，需同步加分支。

---

## 后端改动

### 1. 新建 `backend/app/services/graph_draft_service.py`

职责：引导语 + 素材判断 + LLM 结构化提取。

```python
# pydantic schema（提取输出，节点不含 x/y，由前端落库时布局）
class DraftNode(BaseModel):
    id: str; label: str
    rdfType: str | None = None
    properties: dict[str, Any] | None = None

class DraftEdge(BaseModel):
    id: str; source: str; target: str; label: str
    predicate: str | None = None
    properties: dict[str, Any] | None = None

class GraphDraft(BaseModel):
    title: str
    nodes: list[DraftNode]
    edges: list[DraftEdge]

BUILD_GRAPH_GUIDE = (
    "我可以帮你把一段描述转换成知识图谱草稿 📋\n"
    "请把你想要建模的内容直接发给我，比如：\n"
    "『张三任职于星辰科技，负责产品研发……』\n"
    "我会从中提取实体（节点）和关系（边），生成图谱草稿供你预览保存。"
)

def looks_like_material(text: str) -> bool:
    """启发式：消息是否像「建模素材」而非「建图指令」。纯指令句通常很短。"""
    return len(text.strip()) > 30

def extract_graph_draft(text: str) -> GraphDraft | None:
    """调 LLM 从文本提取实体/关系。返回 GraphDraft；失败或不可建模（如空节点）返回 None。
    提取 prompt：要求 id 用 n1/n2… 递增，边引用节点 id，节点数 < 2 视为不可建模。
    """
```

实现要点：
- LLM 实例复用 `assistant_service._create_llm(streaming=False)` 的配置方式（base_url/api_key/model 走 settings.llm_*）。
- 提取用 **`llm.with_structured_output(GraphDraft)`**（langchain-openai 1.2.1 + langchain-core 1.4.0 已装，`_maybe_generate_title` 是现成非流式调用先例）。**若 deepseek 的 function calling/json 模式不支持**，回退方案：prompt 要求只输出 JSON → `json.loads` + `GraphDraft.model_validate`（清理 markdown 围栏）。
- 返回 `None` 的兜底场景：LLM 调用抛异常、JSON 解析失败、`nodes` 为空或 < 2。
- 建议放 `app/services/graph_draft_service.py`（与 assistant_service 平级），用模块函数而非类，便于单测 mock。

### 2. 修改 `backend/app/services/assistant_service.py`

在 `prepare_chat`（`classify_intent` 之后，`query_project` 分支附近）加分支：

```python
elif intent == "build_graph":
    if not looks_like_material(trimmed):
        return self._build_graph_guide_event_stream(conversation_id)
    draft = extract_graph_draft(trimmed)
    if draft is None or len(draft.nodes) < 2:
        return self._build_graph_guide_event_stream(conversation_id)
    return self._build_graph_draft_event_stream(conversation_id, draft)
```

辅助方法（复用现有 `_save_message` / `_static_event_stream`）：
- `_build_graph_guide_event_stream(conversation_id)`：`_save_message` 落 assistant 引导语 → `_static_event_stream(BUILD_GRAPH_GUIDE)`。
- `_build_graph_draft_event_stream(conversation_id, draft)`：拼文字说明（`f"已为你解析出图谱草稿：{len(draft.nodes)} 个节点、{len(draft.edges)} 条边。"`）落库 → 生成器先逐字发文字 chunk，再发 `{"type":"graph_draft","draft":draft.model_dump()}` 帧，再 `[DONE]`。

### 3. 测试

- 新建 `backend/tests/test_graph_draft_service.py`：
  - `looks_like_material` 边界（短指令 False / 长素材 True）
  - `extract_graph_draft`：mock LLM 返回合法 JSON → 断言 GraphDraft 解析、id/边引用一致
  - 失败兜底：mock LLM 抛异常 / 返回不可解析文本 / 空 nodes → 返回 None
- 改 `backend/tests/test_assistant.py`：
  - mock `classify_intent` 返回 `"build_graph"` + mock `extract_graph_draft` 返回假草稿 → 断言 SSE body 含 `graph_draft` 帧、文字 chunk、`[DONE]`，消息落库（user + assistant）
  - mock 提取返回 None → 断言只发引导语，SSE 不含 `graph_draft`

---

## 前端改动

### 1. `my-frontend/src/types/assistant.ts`（或 `types/graph.ts`）

```ts
export interface GraphDraft {
  title: string;
  nodes: Omit<GraphNode, 'x' | 'y'>[];
  edges: GraphEdge[];
}
```

### 2. `my-frontend/src/services/assistantApi.ts`

- `ChatStreamHandlers`（L47-51）加 `onGraphDraft?: (draft: GraphDraft) => void`
- 帧解析（L130-134）payload 类型扩展 `draft?`，分支链（L135-139）加 `else if (payload.type === 'graph_draft' && payload.draft)`

### 3. `my-frontend/src/stores/useAssistantStore.ts`

- `AssistantState`（L35-54）加 `graphDraft: GraphDraft | null` + `setGraphDraft`；初始 `null`
- `sendUserMessage` 的 handlers（L214-241）传 `onGraphDraft: (draft) => get().setGraphDraft(draft)`

### 4. 新建 `my-frontend/src/components/GraphDraftDialog/index.tsx`

参照 `ImportProjectDialog`（antd `Modal` + `confirmLoading` + `destroyOnHidden`）结构，Props `{ open, onClose }`：
- **预览区**：节点列表 + 边列表（列表卡片样式参考 `GraphRagPage/index.tsx` 的节点卡/边项，~L524-598），只读展示 label/统计
- **表单**：项目名称输入（必填，参照 ProjectGallery 新建项目 Modal）
- **确认落库**：
  1. 补节点 `x/y`：网格布局，如 `100 + (idx % 5) * 120`（与 `graph_io_service._parse_pg_json` 的散开算法一致）；id 复用 draft 自带 `n1/n2…`（保证边引用一致，且 id 去重——`save_graph` 会校验）
  2. `projectApi.createProject({ name })` → 拿 `projectId`
  3. `projectApi.saveProjectGraph(projectId, { nodes, edges })`
  4. `message.success` + `navigate(`/editor/${projectId}`)`（与 ProjectGallery L51 一致）
  5. 失败：`message.error(getApiErrorMessage(error))`，弹窗不关

### 5. `my-frontend/src/pages/AssistantPage/index.tsx`

- 从 store 读 `graphDraft`，本地 `useState` 控制弹窗开合；收到 `graphDraft` 非空时打开弹窗
- 渲染 `<GraphDraftDialog open onClose={() => store.setGraphDraft(null)} />`

### 6. 前端测试（可选但建议）

- `useAssistantStore.test.ts`：mock `chatStream` 调 `onGraphDraft` → 断言 `graphDraft` 状态更新
- 新建 `GraphDraftDialog` 测试：mock `createProject`/`saveProjectGraph` → 断言落库调用与成功提示（或仅做组件渲染冒烟）

---

## 复用的现有函数/模式（不新造）

| 用途 | 复用 |
|---|---|
| 非流式 LLM | `assistant_service._create_llm(streaming=False)` 的配置方式 |
| 固定文本流式输出 | `assistant_service._static_event_stream` |
| 消息落库 | `assistant_service._save_message` |
| 意图识别 | `intent_router.classify_intent` |
| 新建项目 | 前端 `projectApi.createProject`（后端 `POST /api/projects`） |
| 写入节点/边 | 前端 `projectApi.saveProjectGraph`（后端 `PUT /api/projects/{id}/graph`，`replace_graph` 全量替换） |
| 弹窗 | `ImportProjectDialog` 的 antd Modal 模式 |
| 节点卡/边项样式 | `GraphRagPage` 子图预览 |
| 坐标散开 | `graph_io_service._parse_pg_json` 的 `100 + (idx % 5) * 120` |

## 关键约束（易踩坑）

- `save_graph`（`project_service.py:554 _validate_graph`）校验：**节点/边 id 不能重复、边引用的 source/target 必须存在于节点 id 集合**——落库前确保 draft 的边只引用 draft 内节点，且 id 唯一。
- 节点 `x/y` 在数据库/schema 层必填，**draft 里不带坐标，前端落库时必须补**。
- `useGraphStore` 是全局单例，**不要**把草稿塞进 `setGraphData`（会污染当前编辑器状态）；落库后跳转编辑器时 `GraphEditor` 会自动加载后端返回的图。

## 验证

1. 后端：DL 环境跑 `pytest tests/test_graph_draft_service.py tests/test_assistant.py tests/test_intent_router.py`，全部通过。
2. 前端：`npm run build`（或 tsc）通过类型检查；手动验证（run 项目）：聊「根据这段话建一个知识图谱」+ 贴素材 → 弹草稿预览 → 输入项目名确认 → 跳转编辑器看到节点/边。

## 风险 / 待实现时确认

- `with_structured_output` 对 deepseek 的兼容性：若失败回退 prompt + `json.loads` 解析。
- LLM 提取质量：id/边引用由 prompt 约束 + `save_graph` 校验兜底，提取出错返回引导语而非抛错。
- `extract_graph_draft` 在 async `prepare_chat` 内是同步调用——与既有 `classify_intent` 同问题，本次可顺带用 `asyncio.to_thread` 包一层（或留待语义路由的同步改异步一并处理）。
