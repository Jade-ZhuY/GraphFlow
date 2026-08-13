import { describe, expect, it } from 'vitest';
import { GRAPH_EDITOR_BACK_PATH } from './navigation';

describe('GraphEditor navigation', () => {
  it('returns to the project list from the graph editor', () => {
    expect(GRAPH_EDITOR_BACK_PATH).toBe('/projects');
  });
});
