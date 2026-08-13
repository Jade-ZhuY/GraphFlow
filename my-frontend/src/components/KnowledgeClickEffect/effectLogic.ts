export const MAX_ACTIVE_KNOWLEDGE_PARTICLES = 12;
export const KNOWLEDGE_CLICK_EFFECT_LIFETIME_MS = 1400;

export const KNOWLEDGE_CLICK_IGNORED_SELECTOR =
  'input, textarea, select, option, button, a, [contenteditable="true"], [role="textbox"], [data-click-effect="off"]';

const FALLBACK_TERMS = ['知识图谱'] as const;
const PARTICLE_TONES = ['terracotta', 'amber', 'sage', 'crimson'] as const;

export type KnowledgeClickTone = (typeof PARTICLE_TONES)[number];

export type KnowledgeClickTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
};

export type KnowledgeParticle = {
  id: string;
  term: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rotate: number;
  delay: number;
  size: number;
  tone: KnowledgeClickTone;
};

type CreateKnowledgeBurstParams = {
  x: number;
  y: number;
  startIndex: number;
  terms: readonly string[];
  random?: () => number;
  idPrefix?: string;
};

export function shouldSkipKnowledgeClickTarget(
  target: KnowledgeClickTarget | null
) {
  if (!target) return false;

  const tagName = target.tagName?.toLowerCase();
  if (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    tagName === 'option'
  ) {
    return true;
  }

  if (target.isContentEditable) return true;

  return Boolean(target.closest?.(KNOWLEDGE_CLICK_IGNORED_SELECTOR));
}

export function appendCappedParticles<T>(
  currentParticles: T[],
  newParticles: T[],
  maxParticles = MAX_ACTIVE_KNOWLEDGE_PARTICLES
) {
  return [...currentParticles, ...newParticles].slice(-maxParticles);
}

export function createKnowledgeBurst({
  x,
  y,
  startIndex,
  terms,
  random = Math.random,
  idPrefix = 'knowledge-click',
}: CreateKnowledgeBurstParams) {
  const usableTerms = terms.length > 0 ? terms : FALLBACK_TERMS;
  const particleCount = 1;

  const particles: KnowledgeParticle[] = Array.from(
    { length: particleCount },
    (_, index) => {
      const termIndex = startIndex + index;
      const offsetX = Math.round((random() - 0.5) * 32);
      const offsetY = Math.round((random() - 0.5) * 20);
      const dx = Math.round((random() - 0.5) * 72);
      const dy = -72 - Math.round(random() * 54);
      const rotate = Math.round((random() - 0.5) * 24);
      const size = 13 + Math.round(random() * 3);
      const delay = index * 60 + Math.round(random() * 30);

      return {
        id: `${idPrefix}-${termIndex}-${Math.round(random() * 100000)}`,
        term: usableTerms[termIndex % usableTerms.length],
        x: x + offsetX,
        y: y + offsetY,
        dx,
        dy,
        rotate,
        delay,
        size,
        tone: PARTICLE_TONES[termIndex % PARTICLE_TONES.length],
      };
    }
  );

  return {
    particles,
    nextTermIndex: startIndex + particleCount,
  };
}
