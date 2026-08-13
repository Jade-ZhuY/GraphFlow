import type { GraphEdge, GraphNode, GraphProject } from '@/types/graph';
import type {
  RagMultiProjectResult,
  RagProjectSummary,
  RagSearchOptions,
  RagSearchResult,
} from '@/types/graphRag';

/**
 * GraphRAG front-end engine.
 * Performs keyword-based retrieval over the nodes/edges of a knowledge graph
 * and generates a natural-language answer from the matched subgraph.
 */

const STOP_WORDS = new Set([
  '的', '了', '是', '我', '你', '他', '她', '它', '我们', '你们', '他们',
  '在', '有', '和', '与', '或', '一个', '这个', '那个', '这些', '哪些', '什么',
  '怎么', '如何', '为什么', '谁', '哪里', '多少', '吗', '呢', '吧', '啊',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'and', 'but', 'or', 'yet', 'so', 'if', 'because', 'although', 'though',
  '我的', '项目', '图谱', '图', '知识图谱', '里面', '里面', '中', '中',
  'tell', 'me', 'about', 'what', 'how', 'who', 'where', 'when', 'which',
  '基于', '根据', '查询', '检索', '查找', '搜索', '有关', '相关', '涉及',
]);

export function extractKeywords(query: string): string[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[\n\r,;.?!，。！？；：:""''()（）[\]{}]/g, ' ')
    .trim();

  const rawTokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
  const tokens = new Set<string>();

  for (const token of rawTokens) {
    if (STOP_WORDS.has(token)) continue;
    // Skip pure numbers and very short tokens
    if (/^\d+$/.test(token)) continue;
    if (token.length === 1 && /[^一-龥a-zA-Z0-9]/.test(token)) continue;
    tokens.add(token);
  }

  // For Chinese text, also extract 1-4 character sliding windows to catch
  // compound terms and key single-character concepts (e.g. 人, 城).
  const chineseChars = cleaned.replace(/[^一-龥]/g, '');
  for (let i = 0; i < chineseChars.length; i++) {
    for (let len = 1; len <= 4 && i + len <= chineseChars.length; len++) {
      const sub = chineseChars.slice(i, i + len);
      if (STOP_WORDS.has(sub)) continue;
      tokens.add(sub);
    }
  }

  return Array.from(tokens);
}

function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\n\r,;.?!，。！？；：:""''()（）[\]{}]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function containsKeyword(text: string, keyword: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes(keyword.toLowerCase());
}

/**
 * Cross-lingual / semantic keyword expansion.
 * Maps common Chinese concepts to likely English tokens in RDF types,
 * predicates, property keys, and PG labels.
 */
const SEMANTIC_ALIASES: Record<string, string[]> = {
  人: ['person', 'people'],
  人物: ['person', 'people'],
  员工: ['employee', 'worksfor', 'works_for'],
  工作: ['worksfor', 'works_on', 'work'],
  就职: ['worksfor', 'works_for'],
  公司: ['organization', 'org', 'company'],
  组织: ['organization', 'org'],
  部门: ['department', 'dept'],
  项目: ['project'],
  朋友: ['friend', 'knows'],
  认识: ['knows', 'friend'],
  研究: ['research', 'interest'],
  研究方向: ['researcharea', 'research_area'],
  主题: ['topic', 'subject'],
  城市: ['city'],
  角色: ['role'],
};

function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set(keywords);
  for (const kw of keywords) {
    const aliases = SEMANTIC_ALIASES[kw];
    if (aliases) {
      for (const a of aliases) expanded.add(a);
    }
  }
  return Array.from(expanded);
}

function scoreNode(node: GraphNode, keywords: string[]): number {
  let score = 0;
  const labelTokens = tokenizeText(node.label);
  for (const kw of keywords) {
    if (containsKeyword(node.label, kw)) score += 10;
    for (const t of labelTokens) {
      if (t.includes(kw) || kw.includes(t)) score += 3;
    }
    if (node.rdfType && containsKeyword(node.rdfType, kw)) score += 5;
    if (node.uri && containsKeyword(node.uri, kw)) score += 2;
    if (node.properties) {
      for (const [k, v] of Object.entries(node.properties)) {
        const valueText = typeof v === 'string' ? v : String(v);
        if (containsKeyword(k, kw) || containsKeyword(valueText, kw)) {
          score += 3;
        }
      }
    }
  }
  return score;
}

function scoreEdge(edge: GraphEdge, keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (containsKeyword(edge.label, kw)) score += 8;
    if (edge.predicate && containsKeyword(edge.predicate, kw)) score += 5;
    if (edge.properties) {
      for (const [k, v] of Object.entries(edge.properties)) {
        const valueText = typeof v === 'string' ? v : String(v);
        if (containsKeyword(k, kw) || containsKeyword(valueText, kw)) {
          score += 3;
        }
      }
    }
  }
  return score;
}

function expandHops(
  project: GraphProject,
  seedNodeIds: Set<string>,
  hopDepth: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const reachedNodeIds = new Set(seedNodeIds);
  const includedEdges: GraphEdge[] = [];

  for (let hop = 0; hop < hopDepth; hop++) {
    const nextIds = new Set<string>();
    for (const edge of project.edges) {
      const sourceIn = reachedNodeIds.has(edge.source);
      const targetIn = reachedNodeIds.has(edge.target);
      if (sourceIn || targetIn) {
        if (!includedEdges.some((e) => e.id === edge.id)) {
          includedEdges.push(edge);
        }
        if (sourceIn) nextIds.add(edge.target);
        if (targetIn) nextIds.add(edge.source);
      }
    }
    nextIds.forEach((id) => reachedNodeIds.add(id));
  }

  const nodeMap = new Map(project.nodes.map((n) => [n.id, n]));
  const nodes = Array.from(reachedNodeIds)
    .map((id) => nodeMap.get(id))
    .filter(Boolean) as GraphNode[];

  return { nodes, edges: includedEdges };
}

export function generateAnswer(
  project: GraphProject,
  query: string,
  result: Pick<RagSearchResult, 'matchedNodes' | 'matchedEdges' | 'subgraph' | 'keywords'>
): string {
  const { matchedNodes, matchedEdges, subgraph } = result;

  if (matchedNodes.length === 0 && matchedEdges.length === 0) {
    return `我在项目「${project.name}」中检索了相关知识，但没有找到与「${query}」直接匹配的内容。\n\n你可以尝试：\n- 换用项目里出现的实体名称（如节点标签或关系类型）\n- 使用更简短的关键词\n- 前往 GraphRAG 检索页面手动选择项目并调整查询`;
  }

  const nodeMap = new Map(subgraph.nodes.map((n) => [n.id, n]));

  const nodeLines = matchedNodes
    .slice(0, 8)
    .map((n) => {
      let detail = n.label;
      if (n.rdfType) detail += `（类型：${n.rdfType}）`;
      if (n.properties && Object.keys(n.properties).length > 0) {
        const props = Object.entries(n.properties)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        detail += ` — ${props}`;
      }
      return `- ${detail}`;
    })
    .join('\n');

  const edgeLines = matchedEdges
    .slice(0, 8)
    .map((e) => {
      const s = nodeMap.get(e.source)?.label ?? e.source;
      const t = nodeMap.get(e.target)?.label ?? e.target;
      let detail = `${s} —${e.label}→ ${t}`;
      if (e.properties && Object.keys(e.properties).length > 0) {
        const props = Object.entries(e.properties)
          .slice(0, 2)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        detail += `（${props}）`;
      }
      return `- ${detail}`;
    })
    .join('\n');

  const totalNodes = subgraph.nodes.length;
  const totalEdges = subgraph.edges.length;

  // Build a simple path summary for the top matched node if possible
  let pathSummary = '';
  if (matchedNodes.length > 0) {
    const topNode = matchedNodes[0];
    const relatedEdges = subgraph.edges.filter(
      (e) => e.source === topNode.id || e.target === topNode.id
    );
    if (relatedEdges.length > 0) {
      const edgeDescriptions = relatedEdges
        .slice(0, 5)
        .map((e) => {
          const s = nodeMap.get(e.source)?.label ?? e.source;
          const t = nodeMap.get(e.target)?.label ?? e.target;
          return `${s} 和 ${t} 通过「${e.label}」相关联`;
        })
        .join('；');
      pathSummary = `\n\n围绕「${topNode.label}」，${edgeDescriptions}。`;
    }
  }

  return `基于你的项目「${project.name}」，针对「${query}」检索到以下内容：\n\n**匹配到的实体**：\n${nodeLines || '（无直接匹配的实体）'}\n\n**匹配到的关系**：\n${edgeLines || '（无直接匹配的关系）'}\n\n本次检索共覆盖 ${totalNodes} 个实体、${totalEdges} 条关系。${pathSummary}\n\n你可以继续追问具体实体或关系，也可以到 GraphRAG 页面查看更详细的子图。`;
}

export function searchGraph(
  project: GraphProject,
  options: Omit<RagSearchOptions, 'projectId'>
): RagSearchResult {
  const query = options.query.trim();
  const topK = options.topK ?? 5;
  const hopDepth = Math.max(0, Math.min(2, options.hopDepth ?? 1));
  const rawKeywords = options.keywords && options.keywords.length > 0
    ? options.keywords
    : extractKeywords(query);
  const keywords = expandKeywords(rawKeywords);

  const nodeScores = project.nodes
    .map((n) => ({ node: n, score: scoreNode(n, keywords) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const edgeScores = project.edges
    .map((e) => ({ edge: e, score: scoreEdge(e, keywords) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const matchedNodes = nodeScores.slice(0, topK).map((s) => s.node);
  const matchedEdges = edgeScores.slice(0, topK).map((s) => s.edge);

  const seedNodeIds = new Set<string>(
    matchedNodes.map((n) => n.id)
  );
  // Also include edge endpoints if edge is a strong signal
  for (const { edge, score } of edgeScores.slice(0, topK)) {
    if (score >= 6) {
      seedNodeIds.add(edge.source);
      seedNodeIds.add(edge.target);
    }
  }

  const expansion = expandHops(project, seedNodeIds, hopDepth);
  const expansionNodeIds = new Set(matchedNodes.map((n) => n.id));
  const expandedNodes = expansion.nodes.filter((n) => !expansionNodeIds.has(n.id));

  const subgraph = {
    nodes: expansion.nodes,
    edges: expansion.edges,
  };

  const answer = generateAnswer(project, query, {
    matchedNodes,
    matchedEdges,
    subgraph,
    keywords,
  });

  return {
    projectId: project.id,
    projectName: project.name,
    query,
    matchedNodes,
    matchedEdges,
    expandedNodes,
    subgraph,
    answer,
    keywords,
  };
}

export function searchAllProjects(
  projects: GraphProject[],
  query: string
): RagMultiProjectResult {
  const keywords = expandKeywords(extractKeywords(query));
  const results: RagSearchResult[] = [];

  for (const project of projects) {
    const result = searchGraph(project, { query, keywords });
    if (
      result.matchedNodes.length > 0 ||
      result.matchedEdges.length > 0
    ) {
      results.push(result);
    }
  }

  // Sort by total matched entities descending
  results.sort((a, b) => {
    const scoreA = a.matchedNodes.length + a.matchedEdges.length;
    const scoreB = b.matchedNodes.length + b.matchedEdges.length;
    return scoreB - scoreA;
  });

  let combinedAnswer: string;
  if (results.length === 0) {
    combinedAnswer = `我在当前所有图谱项目中都检索了「${query}」，暂时没有找到匹配内容。你可以先创建一个知识图谱项目，或者使用更具体的关键词再试一次。`;
  } else if (results.length === 1) {
    combinedAnswer = results[0].answer;
  } else {
    const summary = results
      .slice(0, 3)
      .map((r) => `- **${r.projectName}**：匹配到 ${r.matchedNodes.length} 个实体、${r.matchedEdges.length} 条关系`)
      .join('\n');
    const topAnswer = results[0].answer;
    combinedAnswer = `我在 ${results.length} 个项目中找到了相关内容。最相关的是「${results[0].projectName}」：\n\n${summary}\n\n---\n\n${topAnswer}`;
  }

  return {
    query,
    results,
    totalProjects: results.length,
    combinedAnswer,
  };
}

export function summarizeProject(project: GraphProject): RagProjectSummary {
  return {
    id: project.id,
    name: project.name,
    nodeCount: project.nodes.length,
    edgeCount: project.edges.length,
  };
}
