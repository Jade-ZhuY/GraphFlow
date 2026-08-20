# GraphRAG 图谱检索问答 · 检索流程

> 更新时间：2026-08-19 ｜ 模块：后端 / GraphRAG

## 检索流程全景

```
用户选择项目 + 输入问题
           │
           ▼
   ┌──────────────────────────────────────────────────┐
   │  ① 关键词提取（纯 Python 正则 + 滑动窗口 + 停用词）  │
   └──────────────────────────────────────────────────┘
           │
           ▼
   ┌──────────────────────────────────────────────────┐
   │  ② 种子节点匹配（两路混合）                         │
   │                                                  │
   │  ┌──────────────┐    ┌──────────────────┐        │
   │  │ 关键词匹配     │    │ 语义匹配（embedding）│        │
   │  │ 字符串包含     │    │ bge-m3 + 余弦相似度  │        │
   │  │ 精确命中       │    │ 语义补盲区          │        │
   │  └──────────────┘    └──────────────────┘        │
   │           │                  │                   │
   │           └────── 合并去重 ───┘                   │
   │                      │                           │
   │                  种子节点 (topK)                   │
   └──────────────────────────────────────────────────┘
           │
           ▼
   ┌──────────────────────────────────────────────────┐
   │  ③ BFS 邻居扩展（沿边遍历 1-2 hop）                │
   │     从种子节点出发，沿 source/target 逐跳扩展       │
   │     收集所有途径的节点和边                           │
   └──────────────────────────────────────────────────┘
           │
           ▼
   ┌──────────────────────────────────────────────────┐
   │  ④ 子图裁剪                                       │
   │     matchedNodes + matchedEdges + expandedNodes   │
   │     + subgraph (nodes + edges) + keywords         │
   └──────────────────────────────────────────────────┘
           │
           ▼
   ┌──────────────────────────────────────────────────┐
   │  ⑤ LLM 生成答案（SSE 流式）                        │
   │     子图结构化数据 + 用户问题 → prompt              │
   │     → ChatOpenAI(streaming=True) → 逐 token 返回   │
   │     SSE: chunk(逐字) + subgraph(节点/边) + [DONE]  │
   └──────────────────────────────────────────────────┘
           │
           ▼
   ┌──────────────────────────────────────────────────┐
   │  ⑥ 前端渲染                                       │
   │     答案区域：流式逐字渲染（打字机效果）              │
   │     子图预览：匹配节点卡片 + 关系列表 + 邻居节点      │
   └──────────────────────────────────────────────────┘
```

## 各层详解

### ① 关键词提取

**位置**：`graph_rag_service.py` → `extract_keywords(query)`

**方式**：纯 Python 正则 + 中文滑动窗口 + 停用词过滤，零外部依赖

```
输入："张三在哪个公司任职"
   │
   ▼ 去标点 → "张三在哪个公司任职"
   │
   ▼ 空格分词 → ["张三在哪个公司任职"]
   │
   ▼ 中文滑动窗口 1-4 字 → ["张","张三","张三在","张三在哪", "公司","公司任职", ...]
   │
   ▼ 停用词过滤（"哪个","在","哪"等） → 关键词列表
```

**特点**：无分词库（未装 jieba），靠滑动窗口枚举所有子串，再用停用词过滤噪音。

### ② 种子节点匹配（两路混合）

**位置**：`graph_rag_service.py` → `build_subgraph()` 内合并

#### 关键词匹配（match_nodes）

| 属性 | 值 |
|---|---|
| 方式 | `if keyword in node.label` 字符串包含 |
| 打分 | label 命中 +10，rdf_type 命中 +5，properties 命中 +3 |
| 特点 | 精确匹配，快，零 API 调用 |
| 盲区 | 字面不同但语义相同（"科技公司" ≠ "星辰科技"） |

#### 语义匹配（match_nodes_semantic）

| 属性 | 值 |
|---|---|
| 方式 | bge-m3 embedding + 余弦相似度 |
| 模型 | BAAI/bge-m3（硅基流动，1024 维） |
| 阈值 | 相似度 > 0.5 |
| 特点 | 语义补盲区，"科技公司" 能找到 "星辰科技" |
| 成本 | 每次检索调 1 次 embedding API（批量，含所有节点 label） |

#### 合并规则

```
关键词匹配结果 + 语义匹配结果
→ 关键词优先排在前面
→ 按 node.id 去重
→ 取 topK 个作为种子节点
```

### ③ BFS 邻居扩展

**位置**：`graph_rag_service.py` → `expand_neighbors(seed_ids, edges, hop_depth)`

**方式**：从种子节点出发，沿边逐跳扩展，默认 1 跳（可配置 1-2 跳）

```
种子: ["张三"]
   │
   ▼ 第 1 跳
   │ 遍历所有边，找 source 或 target 为 "张三" 的边
   │ → 张三 —任职于→ 星辰科技
   │ → 张三 —同事→ 李四
   │ → 把 "星辰科技"、"李四" 加入 reached 集合
   │
   ▼ 第 2 跳（可选）
   │ 从 "星辰科技" 出发 → 位于 → 北京
   │ 从 "李四" 出发 → 任职于 → 星辰科技（已存在）
   │ → 把 "北京" 加入
   │
   ▼ 子图: {张三, 星辰科技, 李四, 北京, 任职于 x2, 同事, 位于}
```

**特点**：纯 Python for 循环 + 集合操作，不依赖图数据库。MySQL 一次性加载全量节点/边到内存。

### ④ 子图裁剪

**位置**：`graph_rag_service.py` → `build_subgraph()` 末尾

**输出结构**：

```json
{
  "matchedNodes": [...],    // 直接匹配到的节点（种子节点）
  "matchedEdges": [...],    // 种子节点直接关联的边
  "expandedNodes": [...],   // BFS 扩展新增的邻居节点
  "subgraph": {
    "nodes": [...],         // 所有子图节点（种子 + 邻居）
    "edges": [...]          // 所有子图边
  },
  "keywords": [...]         // 命中的关键词
}
```

### ⑤ LLM 生成答案

**位置**：`graph_rag_service.py` → `stream_answer()` / `stream_multi_answer()`

**方式**：子图结构化数据 + 用户问题 → 拼成 prompt → ChatOpenAI(streaming=True) → 逐 token SSE 返回

**SSE 协议**：

```
data: {"type":"subgraph","data":{matchedNodes,subgraph,...}}  ← 前端即刻渲染预览
data: {"type":"chunk","content":"张三"}                       ← 逐 token 流式
data: {"type":"chunk","content":"在"}
data: {"type":"chunk","content":"星辰科技"}
...
data: [DONE]                                                  ← 结束
```

**LLM 配置**：复用 `settings.llm_*`（跟 assistant 同一套）

### ⑥ 多项目检索

**位置**：`graph_rag_service.py` → `query_all_projects()` + `stream_multi_answer()`

**方式**：遍历用户所有项目，分别执行 ①→④，按匹配度排序取 top 3，汇总子图，统一生成答案。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 关键词提取 | Python 正则 + 滑动窗口 | 零依赖 |
| 语义匹配 | litellm + bge-m3（硅基流动） | 复用 embedding 配置 |
| 图遍历 | Python for 循环 + 集合 | 内存 BFS |
| 答案生成 | langchain + ChatOpenAI | 复用 settings.llm_* |
| 流式输出 | FastAPI StreamingResponse + SSE | 跟 assistant/chat 同模式 |
| 前端 | fetch ReadableStream + React | 流式渲染 + 子图预览 |

## 不引入的依赖

- ❌ 无 jieba（纯 Python 正则分词）
- ❌ 无向量数据库（numpy 内存数组）
- ❌ 无 Neo4j（MySQL + Python 遍历）
- ❌ 零新 pip 依赖（所有库已在 pyproject.toml）

## 检索方式对比

| | 关键词匹配 | 语义匹配 | BFS 图遍历 |
|---|---|---|---|
| 作用 | 找种子节点 | 补关键词盲区 | 扩展关联实体 |
| 原理 | 字符串包含 | embedding 余弦相似度 | 沿边逐跳遍历 |
| 成本 | 零 | 1 次 embedding API | 零 |
| 擅长 | 精确匹配 | 语义近似 | 关系推理 |
| 盲区 | 字面不同 | 专有名词/编号 | 文本理解 |

## 相关文件

| 文件 | 说明 |
|---|---|
| `backend/app/services/graph_rag_service.py` | 全部检索逻辑 |
| `backend/app/api/routes/graphrag.py` | SSE 路由（单项目 + 多项目） |
| `backend/tests/test_graph_rag_service.py` | 12 例测试 |
| `my-frontend/src/services/graphragApi.ts` | 前端 SSE 消费 |
| `my-frontend/src/pages/GraphRagPage/index.tsx` | 检索页面 |