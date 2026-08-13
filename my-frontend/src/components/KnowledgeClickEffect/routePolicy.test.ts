import { describe, expect, it } from 'vitest';
import { shouldShowKnowledgeClickEffect } from './routePolicy';

describe('knowledge click effect route policy', () => {
  it('only enables the effect on the landing page route', () => {
    expect(shouldShowKnowledgeClickEffect('/')).toBe(true);
    expect(shouldShowKnowledgeClickEffect('/login')).toBe(false);
    expect(shouldShowKnowledgeClickEffect('/projects')).toBe(false);
    expect(shouldShowKnowledgeClickEffect('/assistant')).toBe(false);
    expect(shouldShowKnowledgeClickEffect('/editor/project-1')).toBe(false);
    expect(shouldShowKnowledgeClickEffect('/graphrag')).toBe(false);
  });
});
