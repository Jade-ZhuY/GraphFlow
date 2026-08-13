export interface GraphPoint {
  x: number;
  y: number;
}

export interface DirectedEdgePoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function calculateDirectedEdgePoints(
  source: GraphPoint,
  target: GraphPoint,
  nodeRadius: number
): DirectedEdgePoints {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return {
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
    };
  }

  const edgeOffset = Math.min(nodeRadius, distance / 2);
  const ux = dx / distance;
  const uy = dy / distance;

  return {
    x1: source.x + ux * edgeOffset,
    y1: source.y + uy * edgeOffset,
    x2: target.x - ux * edgeOffset,
    y2: target.y - uy * edgeOffset,
  };
}
