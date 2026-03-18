/**
 * ZenAI Design System - Spring Physics System
 * Phase 101-C1
 *
 * framer-motion spring configs, CSS linear() approximations,
 * and cubic-bezier fallbacks for older browsers.
 */

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// framer-motion spring configs
// ---------------------------------------------------------------------------

export const springs = {
  /** Quick, precise: UI feedback, tooltips, badges */
  snappy:  { stiffness: 400, damping: 30, mass: 1 },
  /** Smooth, calm: panels, drawers, modals */
  gentle:  { stiffness: 170, damping: 26, mass: 1 },
  /** Playful, elastic: success states, FABs, rewards */
  bouncy:  { stiffness: 300, damping: 10, mass: 1 },
  /** Fast, authoritative: nav transitions, tab switching */
  stiff:   { stiffness: 500, damping: 40, mass: 1 },
  /** Oscillating, alive: cards, drag-and-drop, lists */
  wobbly:  { stiffness: 180, damping: 12, mass: 1 },
} as const;

export type SpringPreset = keyof typeof springs;

// ---------------------------------------------------------------------------
// CSS linear() approximations (modern browsers: Chrome 113+, Firefox 112+)
// These approximate the spring physics in pure CSS.
// ---------------------------------------------------------------------------

export const springCSS = {
  snappy:  'linear(0, 0.25 8%, 0.74 20%, 0.96 35%, 1.01 48%, 1 60%, 0.99 80%, 1)',
  gentle:  'linear(0, 0.19 8%, 0.58 20%, 0.84 35%, 0.96 50%, 1.01 65%, 1 80%, 1)',
  bouncy:  'linear(0, 0.12 5%, 0.56 15%, 1.08 30%, 0.92 42%, 1.02 55%, 0.98 70%, 1)',
  stiff:   'linear(0, 0.35 10%, 0.82 25%, 0.97 40%, 1.01 55%, 1 70%, 1)',
  wobbly:  'linear(0, 0.14 6%, 0.64 18%, 1.12 32%, 0.88 48%, 1.04 62%, 0.97 78%, 1)',
} as const;

// ---------------------------------------------------------------------------
// Fallbacks for older browsers (cubic-bezier approximations)
// ---------------------------------------------------------------------------

export const springFallback = {
  snappy:  'cubic-bezier(0.25, 0.1, 0.25, 1)',
  gentle:  'cubic-bezier(0.22, 1, 0.36, 1)',
  bouncy:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
  stiff:   'cubic-bezier(0.4, 0, 0.2, 1)',
  wobbly:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ---------------------------------------------------------------------------
// Reduced motion hook
// ---------------------------------------------------------------------------

/**
 * Returns true when the user prefers reduced motion.
 * SSR-safe: defaults to false on first render.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}
