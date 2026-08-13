import { describe, expect, it } from 'vitest';
import { calculateDirectedEdgePoints } from './graphGeometry';

describe('calculateDirectedEdgePoints', () => {
  it('shortens a horizontal edge to the node boundaries', () => {
    expect(
      calculateDirectedEdgePoints(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        20
      )
    ).toEqual({
      x1: 20,
      y1: 0,
      x2: 80,
      y2: 0,
    });
  });

  it('keeps the direction when shortening a diagonal edge', () => {
    expect(
      calculateDirectedEdgePoints(
        { x: 0, y: 0 },
        { x: 60, y: 80 },
        20
      )
    ).toEqual({
      x1: 12,
      y1: 16,
      x2: 48,
      y2: 64,
    });
  });

  it('does not produce invalid coordinates for overlapping nodes', () => {
    expect(
      calculateDirectedEdgePoints(
        { x: 32, y: 48 },
        { x: 32, y: 48 },
        20
      )
    ).toEqual({
      x1: 32,
      y1: 48,
      x2: 32,
      y2: 48,
    });
  });
});
