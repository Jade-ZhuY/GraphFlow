# 聊天首响应延迟高：语义路由 embedding 模型偏重（8B 多模态）

> 记录时间：2026-08-18 ｜ 模块：后端 / 语义路由（intent_router） ｜ 状态：**待修复（已给方案）**

## 问题描述（现象）

聊天助手响应偏慢，尤其**后端重启后的第一条消息**体感明显：发「你好」等消息，页面要干等约 **10 秒**才收到第一个回复。该延迟来自语义路由的 embedding 环节，而非 LLM 本身。

## 影响

- **首请求冷启动 ~10s**：后端重启后第一条消息被拖慢到秒级，体验差。
- **事件循环被阻塞**：`classify_intent` 是同步调用，跑在 async 请求里，首请求期间**所有并发的用户请求一起排队**。
- 单次 query 也要走 8B 模型推理，token 开销大、成本高。

## 根因分析

### 直接原因：用 8B 多模态模型做文本意图分类

语义路由配置的 embedding 模型是 **`Qwen3-VL-Embedding-8B`**——一个 8 参数的多模态（视觉-语言）embedding 模型。拿它给 17 条意图样例句子批量算向量，冷启动要 10 秒；而语义路由的定位是「毫秒级、不花 LLM 钱」，这个模型完全违背了目标。

### 叠加因素：同步调用阻塞事件循环

`assistant_service.prepare_chat`（async）里直接同步调 `classify_intent`（内部 HTTP），没有 `to_thread` 包裹。首请求那 10 秒会卡住整个 asyncio 事件循环。`build_graph` 分支已经用 `asyncio.to_thread` 包了提取，但 `classify_intent` 本身（query_project / chat 路径）还没有。

## 实测数据（真实 embedding API 调用）

| 环节 | 耗时 | 说明 |
|---|---|---|
| router 首次构建（后端重启后首条消息触发，17 条 utterances 批量 embedding） | **9.96s** | 一次性冷启动 |
| 单次 query embedding（8B 模型） | 0.18s | router 缓存后每次消息只算 1 条 |
| classify_intent 完整调用（缓存后） | 0.19s | 含上面那次 query |

向量维度 4096——比通用文本模型（如 bge-m3 的 1024 维）大 4 倍，存储与计算都更重。

## 解决方案（按收益排序，尚未实施）

1. **换 `BAAI/bge-m3`**（治本）：硅基流动现成文本 embedding 模型，1024 维、中文友好、秒级。预计首构建从 ~10s 降到 1s 级，单次 query 更快更便宜。
   - 改 `backend/.env` 与 `.env.example` 的 `EMBEDDING_MODEL`，以及 `config.py` 默认值。
2. **`classify_intent` 也包 `asyncio.to_thread`**：`query_project`/`chat` 路径补齐（`build_graph` 已用），避免同步阻塞事件循环。
3. **启动预热**：后端启动时预构建 router（先调一次 `_build_router()`），把 10s 冷启动挪到启动阶段，用户永远不用等第一句。

> ⚠️ 改动后需重启后端：`_build_router()` 是 `lru_cache` 缓存，且 embedding 模型在构建时固定。

## 关联

- 同源问题：`语义路由误分类-阈值过低导致你好命中查项目.md`（8B 模型对短文本区分度一般，放大了低阈值问题）。
- 对应《语义路由（Semantic Router）功能清单》待办 #1「embedding 模型选型」。

## 相关文件

| 文件 | 说明 |
|---|---|
| `backend/.env` / `.env.example` | `EMBEDDING_MODEL` 待换为 `BAAI/bge-m3` |
| `backend/app/core/config.py` | `embedding_model` 默认值待改 |
| `backend/app/services/assistant_service.py` | `classify_intent` 待包 `to_thread` |
| `backend/app/services/intent_router.py` | 可加启动预热钩子 |
