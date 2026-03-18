/**
 * ZenAI Design System - Motion Variants Library
 * Phase 101-C2
 *
 * Standardized framer-motion variants using spring presets from springs.ts.
 * Import motionVariants for standard animations, reducedMotionVariants
 * for accessibility-safe opacity-only alternatives.
 */

import type { Variants } from 'framer-motion';
import { springs } from './springs';

// ---------------------------------------------------------------------------
// Standard motion variants (use with AnimatePresence + motion.*)
// ---------------------------------------------------------------------------

/** Fade in/out — subtlest, for overlays and tooltips */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { type: 'spring', ...springs.gentle },
  },
  exit: {
    opacity: 0,
    transition: { type: 'spring', ...springs.stiff, duration: 0.15 },
  },
};

/** Slide up from below — for cards, panels, toasts */
export const slideUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', ...springs.gentle },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { type: 'spring', ...springs.stiff, duration: 0.15 },
  },
};

/** Scale in — for modals, popovers, context menus */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', ...springs.snappy },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { type: 'spring', ...springs.stiff, duration: 0.12 },
  },
};

/** List item — for individual items within a staggered list */
export const listItem: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', ...springs.gentle },
  },
  exit: {
    opacity: 0,
    x: -4,
    transition: { type: 'spring', ...springs.stiff, duration: 0.1 },
  },
};

/** Stagger container — apply to parent, children use listItem or slideUp */
export const stagger: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
};

/** Slide in from right — for sidebars, drawers */
export const slideInRight: Variants = {
  initial: { opacity: 0, x: 32 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', ...springs.gentle },
  },
  exit: {
    opacity: 0,
    x: 16,
    transition: { type: 'spring', ...springs.stiff, duration: 0.15 },
  },
};

/** Bounce in — for success states, rewards, celebrations */
export const bounceIn: Variants = {
  initial: { opacity: 0, scale: 0.6 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', ...springs.bouncy },
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: { type: 'spring', ...springs.stiff, duration: 0.12 },
  },
};

// ---------------------------------------------------------------------------
// Aggregate map (for programmatic access)
// ---------------------------------------------------------------------------

export const motionVariants = {
  fadeIn,
  slideUp,
  scaleIn,
  listItem,
  stagger,
  slideInRight,
  bounceIn,
} as const;

export type MotionVariantName = keyof typeof motionVariants;

// ---------------------------------------------------------------------------
// Reduced motion variants (opacity-only, for prefers-reduced-motion)
// Must have matching keys to motionVariants.
// ---------------------------------------------------------------------------

const reducedFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit:    { opacity: 0, transition: { duration: 0.1 } },
};

export const reducedMotionVariants: Record<MotionVariantName, Variants> = {
  fadeIn:       reducedFade,
  slideUp:      reducedFade,
  scaleIn:      reducedFade,
  listItem:     reducedFade,
  stagger:      { initial: {}, animate: {}, exit: {} },
  slideInRight: reducedFade,
  bounceIn:     reducedFade,
};
