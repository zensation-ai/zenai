/**
 * useSwipeDismiss — Framer Motion drag-to-dismiss for modal panels.
 *
 * Spread `dragProps` onto a `motion.*` element to enable swipe-down-to-close
 * on mobile. Uses velocity + distance thresholds to decide whether to dismiss
 * or snap back.
 *
 * Usage:
 *   const { dragProps, resetDrag } = useSwipeDismiss({ onDismiss: onClose });
 *   <motion.aside {...dragProps}>...</motion.aside>
 */

import { useCallback } from 'react';
import {
  useMotionValue,
  useAnimation,
  useDragControls,
  type PanInfo,
} from 'framer-motion';
import { springs } from '@/lib/motion';

interface UseSwipeDismissOptions {
  onDismiss: () => void;
  /** Velocity (px/s) above which the panel is dismissed regardless of distance */
  velocityThreshold?: number;
  /** Distance (px) above which the panel is dismissed regardless of velocity */
  distanceThreshold?: number;
}

interface SwipeDismissResult {
  dragControls: ReturnType<typeof useDragControls>;
  dragProps: {
    drag: 'y';
    dragConstraints: { top: number };
    dragElastic: { top: number; bottom: number };
    dragControls: ReturnType<typeof useDragControls>;
    animate: ReturnType<typeof useAnimation>;
    style: { y: ReturnType<typeof useMotionValue<number>> };
    onDragEnd: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  };
  resetDrag: () => void;
}

export function useSwipeDismiss({
  onDismiss,
  velocityThreshold = 500,
  distanceThreshold = 100,
}: UseSwipeDismissOptions): SwipeDismissResult {
  const y = useMotionValue(0);
  const controls = useAnimation();
  const dragControls = useDragControls();

  const resetDrag = useCallback(() => {
    void controls.start({ y: 0, transition: { type: 'spring', ...springs.snappy } });
  }, [controls]);

  const onDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const shouldDismiss =
        info.velocity.y > velocityThreshold || info.offset.y > distanceThreshold;

      if (shouldDismiss) {
        void controls.start({
          y: '110%',
          transition: { type: 'spring', ...springs.gentle },
        });
        onDismiss();
      } else {
        void controls.start({ y: 0, transition: { type: 'spring', ...springs.snappy } });
      }
    },
    [controls, onDismiss, velocityThreshold, distanceThreshold],
  );

  return {
    dragControls,
    dragProps: {
      drag: 'y',
      dragConstraints: { top: 0 },
      dragElastic: { top: 0, bottom: 0.25 },
      dragControls,
      animate: controls,
      style: { y },
      onDragEnd,
    },
    resetDrag,
  };
}
