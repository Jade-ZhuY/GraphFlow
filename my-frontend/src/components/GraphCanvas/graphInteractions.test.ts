import { describe, expect, it } from 'vitest';
import { canDragNodeInMode } from './graphInteractions';

describe('graph canvas interaction policy', () => {
  it('only starts node dragging in select mode', () => {
    expect(canDragNodeInMode('select')).toBe(true);
    expect(canDragNodeInMode('addEdge')).toBe(false);
    expect(canDragNodeInMode('addNode')).toBe(false);
    expect(canDragNodeInMode('delete')).toBe(false);
  });
});
