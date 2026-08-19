# 聊天首响应延迟高：embedding 冷启动未预热

> 记录时间：2026-08-19 ｜ 模块：后端 / 语义路由（intent_router）/ 启动 ｜ 状态：已修复

## 问题描述（现象）

后端重启后，用户发出的第一条消息响应极慢——需要干等约 **9 秒**才能收到第一个回复。后续消息恢复正常（0.14s）。

## 影响

- 重启后首条消息延迟 9s，用户体验差。
- 开发/调试阶段频繁重启后端，每次都要等一次冷启动。
- 首请求期间 `classify_intent` 同步调用，还会阻塞事件循环。

## 根因分析

语义路由的 `_build_router()` 使用 `lru_cache` 缓存，首次调用时需要**给全部 43 条 utterances 批量调硅基流动 embedding API**（串行请求），耗时约 9s。这个缓存只在进程内有效，后端重启即消失。

在此之前，`_build_router()` 的首次调用发生在**用户第一条消息的 `classify_intent` 路径上**，所以冷启动的 9s 延迟由用户承担。

## 解决方案

在 `app/main.py` 的 `lifespan` 启动阶段，**提前调一次 `_build_router()`**，把 embedding 批量调用从"用户首请求"挪到"后端启动时"：

```python
@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    import asyncio
    from app.services.intent_router import _build_router
    try:
        await asyncio.to_thread(_build_router)
    except Exception:
        pass  # embedding 未配置或不可用，启动不崩，运行时再兜底
    yield
```

## 效果

| 场景 | 之前 | 之后 |
|---|---|---|
| 后端启动 | 无额外耗时 | 多 ~9s（一次性） |
| 用户第一条消息 | **~9s** | 0.14s |
| 后续消息 | 0.14s | 0.14s |

启动时多等 9s 对开发/运维没影响，但用户永远不用等冷启动了。

## 相关文件

| 文件 | 改动 |
|---|---|
| `backend/app/main.py` | `lifespan` 加预热逻辑 |