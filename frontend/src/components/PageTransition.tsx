/**
 * PageTransition — Phase 84
 *
 * Wraps page content with a fade + subtle Y-slide animation.
 * Uses framer-motion AnimatePresence for enter/exit transitions.
 * Respects prefers-reduced-motion — instant transition if enabled.
 */

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  pageVariants,
  pageTransition,
  reducedMotionVariants,
  reducedMotionTransition,
  usePrefersReducedMotion,
} from '../utils/animations';

interface PageTransitionProps {
  /** Unique key for the current page (triggers animation on change) */
  pageKey: string;
  children: ReactNode;
}

export function PageTransition({ pageKey, children }: PageTransitionProps) {
  const reducedMotion = usePrefersReducedMotion();

  const variants = reducedMotion ? reducedMotionVariants : pageVariants;
  const enterTransition = reducedMotion ? reducedMotionTransition : pageTransition;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants}
        transition={enterTransition}
        style={{ width: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
