/**
 * Animation Utilities — Phase 84
 *
 * Reusable animation variants and spring configs for framer-motion.
 * All animations use GPU-composited properties only (transform, opacity).
 * Respects prefers-reduced-motion.
 */

import { useEffect, useState } from 'react';
import type { Transition, Variants } from 'framer-motion';

// ============================================
// Spring Presets
// ============================================

export const springs = {
  gentle: { type: 'spring' as const, stiffness: 200, damping: 25 },
  snappy: { type: 'spring' as const, stiffness: 300, damping: 30 },
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 20 },
} as const;

// ============================================
// Duration Presets (seconds)
// ============================================

export const durations = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.2,
  slow: 0.3,
  page: 0.4,
} as const;

// ============================================
// Reusable Animation Variants
// ============================================

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const slideRight: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

// ============================================
// Stagger Children Config
// ============================================

export const staggerContainer: Variants = {
  animate: {
    transition: { staggerChildren: 0.03 },
  },
};

export const staggerItem = slideUp;

// ============================================
// Page Transition Variants
// ============================================

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const pageTransition: Transition = {
  ...springs.gentle,
  opacity: { duration: durations.normal },
};

export const pageExitTransition: Transition = {
  duration: durations.fast,
  ease: 'easeOut',
};

// ============================================
// Reduced motion variants (instant transitions)
// ============================================

export const reducedMotionVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const reducedMotionTransition: Transition = {
  duration: 0.01,
};

// ============================================
// Reduced Motion Hook
// ============================================

/**
 * Returns true if the user prefers reduced motion.
 * Listens for changes to the media query.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}
