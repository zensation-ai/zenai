/**
 * AnimatedButton — Phase 84
 *
 * A button wrapper that adds a subtle press animation (scale to 0.97).
 * Uses framer-motion whileTap for GPU-composited transform animation.
 * Respects prefers-reduced-motion.
 */

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../../utils/animations';

interface AnimatedButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
  'aria-label'?: string;
  style?: React.CSSProperties;
}

export function AnimatedButton({ children, ...props }: AnimatedButtonProps) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.button
      whileTap={reducedMotion ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25, duration: 0.1 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
