import type { GraphEdge } from '@/types/graph';

export type GraphNodeShape = 'node-circle';

export interface NodeVisualMetrics {
  shape: GraphNodeShape;
  radius: number;
}

export interface CircleLike {
  x: number;
  y: number;
  radius: number;
}

export interface EdgeRenderPoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const NODE_METRICS: NodeVisualMetrics = {
  shape: 'node-circle',
  radius: 42,
};

export function formatPropertySummary(
  properties: Record<string, unknown> | null | undefined,
  maxItems = 3
): string {
  if (!properties) return '';

  return Object.entries(properties)
    .slice(0, maxItems)
    .map(([key, value]) => `${key} = ${String(value)}`)
    .join(', ');
}

export function formatEdgeLabel(
  edge: Pick<GraphEdge, 'label' | 'properties'>
): string {
  const propertySummary = formatPropertySummary(edge.properties, 2);
  return propertySummary
    ? `${edge.label} {${propertySummary.replaceAll(' = ', ': ')}}`
    : edge.label;
}

export function getNodeVisualMetrics(): NodeVisualMetrics {
  return NODE_METRICS;
}

function getCircleBorderPoint(
  from: CircleLike,
  to: CircleLike
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return { x: from.x, y: from.y };
  }

  return {
    x: from.x + (dx / distance) * from.radius,
    y: from.y + (dy / distance) * from.radius,
  };
}

export function calculateCircleEdgePoints(
  source: CircleLike,
  target: CircleLike
): EdgeRenderPoints {
  const start = getCircleBorderPoint(source, target);
  const end = getCircleBorderPoint(target, source);

  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  };
}
