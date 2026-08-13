import { describe, expect, it } from 'vitest';
import {
  appendCappedParticles,
  createKnowledgeBurst,
  shouldSkipKnowledgeClickTarget,
} from './effectLogic';

describe('knowledge click effect logic', () => {
  it('creates one knowledge term when creating a burst', () => {
    const burst = createKnowledgeBurst({
      x: 80,
      y: 120,
      startIndex: 1,
      terms: ['实体', '关系'],
      random: () => 0.5,
      idPrefix: 'test',
    });

    expect(burst.nextTermIndex).toBe(2);
    expect(burst.particles.map((particle) => particle.term)).toEqual(['关系']);
    expect(burst.particles.map((particle) => particle.id)).toEqual([
      'test-1-50000',
    ]);
  });

  it('keeps only the newest particles when capping active effects', () => {
    const particles = appendCappedParticles(
      [{ id: 'old-1' }, { id: 'old-2' }],
      [{ id: 'new-1' }, { id: 'new-2' }],
      3
    );

    expect(particles.map((particle) => particle.id)).toEqual([
      'old-2',
      'new-1',
      'new-2',
    ]);
  });

  it('skips form controls and editable targets', () => {
    expect(shouldSkipKnowledgeClickTarget({ tagName: 'INPUT' })).toBe(true);
    expect(shouldSkipKnowledgeClickTarget({ tagName: 'textarea' })).toBe(true);
    expect(
      shouldSkipKnowledgeClickTarget({
        tagName: 'div',
        isContentEditable: true,
      })
    ).toBe(true);
  });

  it('skips clicks inside interactive ancestors but allows canvas clicks', () => {
    expect(
      shouldSkipKnowledgeClickTarget({
        tagName: 'span',
        closest: (selector) => (selector.includes('button') ? {} : null),
      })
    ).toBe(true);

    expect(
      shouldSkipKnowledgeClickTarget({
        tagName: 'svg',
        closest: () => null,
      })
    ).toBe(false);
  });
});
