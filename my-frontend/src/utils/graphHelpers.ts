import type { GraphEdge } from '@/types/graph';

export function getNodeDegree(nodeId: string, edges: GraphEdge[]): number {
  return edges.filter((e) => e.source === nodeId || e.target === nodeId).length;
}

export function getGraphDensity(nodeCount: number, edgeCount: number): number {
  if (nodeCount <= 1) return 0;
  const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
  return edgeCount / maxEdges;
}

export function getConnectedNodes(nodeId: string, edges: GraphEdge[]): string[] {
  const connected = new Set<string>();
  edges.forEach((e) => {
    if (e.source === nodeId) connected.add(e.target);
    if (e.target === nodeId) connected.add(e.source);
  });
  return Array.from(connected);
}

export function validateEdge(
  sourceId: string,
  targetId: string,
  existingEdges: GraphEdge[],
  allowSelfLoop = false
): { valid: boolean; message?: string } {
  if (sourceId === targetId && !allowSelfLoop) {
    return { valid: false, message: '不允许自环边' };
  }
  const duplicate = existingEdges.find(
    (e) => e.source === sourceId && e.target === targetId
  );
  if (duplicate) {
    return { valid: false, message: '该边已存在' };
  }
  return { valid: true };
}
