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
  pageExitTransition,
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
  const exitTransition = reducedMotion ? reducedMotionTransition : pageExitTransition;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={enterTransition}
        style={{ width: '100%' }}
      >
        <motion.div
          exit="exit"
          variants={variants}
          transition={exitTransition}
        >
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
