# GraphRAG 图谱检索问答 · 功能清单

> 更新时间：2026-08-19 ｜ 所属模块：后端 / 前端

## 一句话概述

对用户已有的知识图谱做自然语言问答：选项目 → 输入问题 → 关键词匹配 + BFS 邻居扩展 → 子图裁剪 → LLM 流式生成答案。不引入新依赖（无 Neo4j、无向量数据库、无 jieba）。

## 背景与动机

- 用户手动建好的图谱（节点 + 边）是结构化知识，但查询需要自然语言
- 前端已有本地检索（`graphRagEngine.ts`，纯关键词匹配 + 模板拼答案），缺少 LLM 自然语言生成和流式体验
- 目标：后端检索 + LLM 流式答案，架构跟 assistant 和 build_graph 草稿同模式

## 核心作用（价值点）

1. **自然语言问答**：搜"张三在哪个公司"，LLM 用子图数据生成"张三在星辰科技工作"
2. **结构化检索**：关键词匹配实体 + BFS 沿边扩展，不依赖 LLM 做检索
3. **流式体验**：SSE 逐 token 输出，子图预览即时渲染

## 架构流程

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
         │
         ▼
  前端 GraphRagPage：流式答案 + 子图预览
```

## 检索方式

**关键词匹配 + 图遍历（BFS）**，两层混合：

| 层 | 做什么 | 用什么 |
|---|---|---|
| 关键词匹配 | 从用户问题提取关键词，遍历所有节点 label/type/properties 打分，取 topK 种子节点 | 纯 Python 正则 + 停用词 |
| 图遍历 | 从种子节点出发，沿边 BFS 扩展 1-2 跳，收集所有关联节点和边 | 纯 Python for 循环 + 集合操作 |

当前不引入向量检索（节点 label 是精确文本，关键词匹配足够），也不引入社区发现（图谱规模几十到几百节点，无需聚类）。

## 技术栈

- **后端**：FastAPI + Python 标准库（re + 集合操作）+ langchain + ChatOpenAI（复用 settings.llm_*）
- **前端**：React + TypeScript + fetch SSE 流式消费
- **零新依赖**：不装 jieba、不装向量数据库、不装 Neo4j

## 涉及文件

| 文件 | 改动 |
|---|---|
| `backend/app/services/graph_rag_service.py` | 新增：关键词提取 + 节点匹配 + BFS 扩展 + 子图裁剪 + LLM 流式生成 |
| `backend/app/api/routes/graphrag.py` | 新增：`POST /api/graphrag/query` SSE 流式路由 |
| `backend/app/main.py` | 修改：挂载 `/api/graphrag` 路由 |
| `backend/tests/test_graph_rag_service.py` | 新增：12 例测试（关键词/匹配/邻居/子图） |
| `my-frontend/src/services/graphragApi.ts` | 新增：SSE 消费（chunk + subgraph + [DONE]） |
| `my-frontend/src/pages/GraphRagPage/index.tsx` | 修改：从本地引擎切到后端 API 流式 |

## 测试与验证

- 后端：**62 测试全过**（原有 50 + 新增 12）
- 前端：tsc 类型检查通过、vitest **50 测试全过**、vite build 成功
- 路由：`/api/graphrag/query` 已注册，OpenAPI 可见

## 后续可增强（未完成）

1. **向量语义匹配**：当关键词召回不够时，复用 bge-m3 补一层语义检索（"张三" ≈ "张三先生"）
2. **全局搜索**：图谱节点多（>100）时，社区发现 + 社区摘要，支持"总结这个图谱"
3. **多项目检索**：跨多个项目检索并汇总（前端 `graphRagEngine.ts` 已有 `searchAllProjects`，后端未实现）
4. **检索结果缓存**：相同问题短期内不重复调 LLM