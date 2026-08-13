import { describe, expect, it } from 'vitest';
import type { GraphEdge } from '@/types/graph';
import {
  calculateCircleEdgePoints,
  formatEdgeLabel,
  formatPropertySummary,
  getNodeVisualMetrics,
} from './graphVisualModel';

describe('graphVisualModel', () => {
  it('uses the edge label with compact property summaries', () => {
    const edge: Pick<GraphEdge, 'label' | 'properties'> = {
      label: 'SINGS',
      properties: {
        since: 2020,
        confidence: 0.95,
      },
    };

    expect(formatEdgeLabel(edge)).toBe('SINGS {since: 2020, confidence: 0.95}');
  });

  it('returns just the label when there are no properties', () => {
    const edge: Pick<GraphEdge, 'label' | 'properties'> = {
      label: '认识',
      properties: undefined,
    };

    expect(formatEdgeLabel(edge)).toBe('认识');
  });

  it('limits property summaries to the requested number of properties', () => {
    expect(
      formatPropertySummary(
        {
          name: '周杰伦',
          birth_year: 1979,
          region: 'Taiwan',
        },
        2
      )
    ).toBe('name = 周杰伦, birth_year = 1979');
  });

  it('returns uniform circular metrics for every node', () => {
    expect(getNodeVisualMetrics()).toEqual({
      shape: 'node-circle',
      radius: 42,
    });
  });

  it('calculates edge endpoints on circle borders', () => {
    const points = calculateCircleEdgePoints(
      { x: 0, y: 0, radius: 40 },
      { x: 200, y: 0, radius: 30 }
    );

    expect(points).toEqual({
      x1: 40,
      y1: 0,
      x2: 170,
      y2: 0,
    });
  });
});
