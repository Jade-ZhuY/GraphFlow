import type { GraphEdge, GraphNode } from './graph';

export interface RagSearchResult {
  projectId: string;
  projectName: string;
  query: string;
  /** 直接匹配到的节点 */
  matchedNodes: GraphNode[];
  /** 直接匹配到的边 */
  matchedEdges: GraphEdge[];
  /** 扩展得到的邻居节点 */
  expandedNodes: GraphNode[];
  /** 最终用于回答的子图 */
  subgraph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  /** 生成的自然语言回答 */
  answer: string;
  /** 命中的关键词 */
  keywords: string[];
}

export interface RagSearchOptions {
  projectId: string;
  query: string;
  /** 最大匹配节点数，默认 5 */
  topK?: number;
  /** 邻居扩展深度，默认 1 */
  hopDepth?: number;
  /** 匹配用的关键词，默认从 query 自动提取 */
  keywords?: string[];
}

export interface RagMultiProjectResult {
  query: string;
  /** 按相关度排序的项目结果 */
  results: RagSearchResult[];
  /** 总匹配项目数 */
  totalProjects: number;
  /** 汇总生成的回答 */
  combinedAnswer: string;
}

export interface RagProjectSummary {
  id: string;
  name: string;
  nodeCount: number;
  edgeCount: number;
}
