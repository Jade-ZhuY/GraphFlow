import { useEffect, useRef, useState } from 'react';
import { KNOWLEDGE_CLICK_TERMS } from '@/constants/knowledgeTerms';
import {
  appendCappedParticles,
  createKnowledgeBurst,
  KNOWLEDGE_CLICK_EFFECT_LIFETIME_MS,
  shouldSkipKnowledgeClickTarget,
} from './effectLogic';
import type {
  KnowledgeClickTarget,
  KnowledgeParticle,
} from './effectLogic';
import './index.css';

const DRAG_CLICK_DISTANCE_LIMIT = 8;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type PointerStart = {
  x: number;
  y: number;
  button: number;
};

function isDraggedClick(event: MouseEvent, start: PointerStart | null) {
  if (!start) return false;
  const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
  return start.button !== 0 || distance > DRAG_CLICK_DISTANCE_LIMIT;
}

function KnowledgeClickEffect() {
  const [particles, setParticles] = useState<KnowledgeParticle[]>([]);
  const termIndexRef = useRef(0);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const reducedMotionRef = useRef(false);
  const cleanupTimersRef = useRef<number[]>([]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);

    const updateReducedMotion = () => {
      reducedMotionRef.current = mediaQuery.matches;
    };

    updateReducedMotion();
    mediaQuery.addEventListener('change', updateReducedMotion);

    return () => {
      mediaQuery.removeEventListener('change', updateReducedMotion);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        button: event.button,
      };
    };

    const handleClick = (event: MouseEvent) => {
      if (reducedMotionRef.current || event.defaultPrevented) return;
      if (isDraggedClick(event, pointerStartRef.current)) return;
      if (
        shouldSkipKnowledgeClickTarget(event.target as KnowledgeClickTarget)
      ) {
        return;
      }

      const burst = createKnowledgeBurst({
        x: event.clientX,
        y: event.clientY,
        startIndex: termIndexRef.current,
        terms: KNOWLEDGE_CLICK_TERMS,
      });
      termIndexRef.current = burst.nextTermIndex;

      setParticles((currentParticles) =>
        appendCappedParticles(currentParticles, burst.particles)
      );

      const particleIds = new Set(
        burst.particles.map((particle) => particle.id)
      );
      const timerId = window.setTimeout(() => {
        setParticles((currentParticles) =>
          currentParticles.filter((particle) => !particleIds.has(particle.id))
        );
        cleanupTimersRef.current = cleanupTimersRef.current.filter(
          (activeTimerId) => activeTimerId !== timerId
        );
      }, KNOWLEDGE_CLICK_EFFECT_LIFETIME_MS);
      cleanupTimersRef.current.push(timerId);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('click', handleClick, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('click', handleClick, true);
      cleanupTimersRef.current.forEach((timerId) =>
        window.clearTimeout(timerId)
      );
      cleanupTimersRef.current = [];
    };
  }, []);

  if (particles.length === 0) return null;

  return (
    <div className="knowledge-click-effect-layer" aria-hidden="true">
      {particles.map((particle) => (
        <span
          key={particle.id}
          className={`knowledge-click-effect-particle tone-${particle.tone}`}
          style={
            {
              '--click-x': `${particle.x}px`,
              '--click-y': `${particle.y}px`,
              '--float-x': `${particle.dx}px`,
              '--float-y': `${particle.dy}px`,
              '--float-rotate': `${particle.rotate}deg`,
              '--float-delay': `${particle.delay}ms`,
              '--particle-size': `${particle.size}px`,
            } as React.CSSProperties
          }
        >
          {particle.term}
        </span>
      ))}
    </div>
  );
}

export default KnowledgeClickEffect;
