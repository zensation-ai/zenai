import { RefObject, useEffect, useRef, useState, useCallback } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | null;

interface SwipeGestureOptions {
  /** Minimum distance in pixels for a swipe to be recognized (default: 100) */
  threshold?: number;
  /** Minimum velocity for a swipe (default: 0.5 px/ms) */
  velocityThreshold?: number;
  /** Called when swiping left */
  onSwipeLeft?: () => void;
  /** Called when swiping right */
  onSwipeRight?: () => void;
  /** Called when swiping up */
  onSwipeUp?: () => void;
  /** Called during swipe with direction and progress */
  onSwipeProgress?: (direction: SwipeDirection, progress: number) => void;
  /** Whether the gesture is enabled (default: true) */
  enabled?: boolean;
}

interface SwipeState {
  isDragging: boolean;
  direction: SwipeDirection;
  progress: number;
  offsetX: number;
  offsetY: number;
}

interface SwipeGestureResult extends SwipeState {
  /** Reset the swipe state */
  reset: () => void;
}

/**
 * Hook for handling swipe gestures on touch and mouse devices
 *
 * @param ref - Reference to the element to attach gestures to
 * @param options - Swipe gesture options
 * @returns Current swipe state and control functions
 */
export function useSwipeGesture(
  ref: RefObject<HTMLElement>,
  options: SwipeGestureOptions
): SwipeGestureResult {
  const {
    threshold = 100,
    velocityThreshold = 0.5,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeProgress,
    enabled = true,
  } = options;

  const [state, setState] = useState<SwipeState>({
    isDragging: false,
    direction: null,
    progress: 0,
    offsetX: 0,
    offsetY: 0,
  });

  const startPos = useRef({ x: 0, y: 0 });
  const startTime = useRef(0);
  const isDraggingRef = useRef(false);

  const reset = useCallback(() => {
    setState({
      isDragging: false,
      direction: null,
      progress: 0,
      offsetX: 0,
      offsetY: 0,
    });
    isDraggingRef.current = false;
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    const handleStart = (clientX: number, clientY: number) => {
      startPos.current = { x: clientX, y: clientY };
      startTime.current = Date.now();
      isDraggingRef.current = true;
      setState((s) => ({ ...s, isDragging: true }));
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!isDraggingRef.current) return;

      const deltaX = clientX - startPos.current.x;
      const deltaY = clientY - startPos.current.y;

      let direction: SwipeDirection = null;
      let progress = 0;

      // Determine swipe direction based on the larger delta
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        direction = deltaX > 0 ? 'right' : 'left';
        progress = Math.min(Math.abs(deltaX) / threshold, 1);
      } else if (deltaY < -20) {
        // Upward swipe (only when moving up significantly)
        direction = 'up';
        progress = Math.min(Math.abs(deltaY) / threshold, 1);
      }

      const newState = {
        isDragging: true,
        direction,
        progress,
        offsetX: deltaX,
        offsetY: direction === 'up' ? deltaY : 0,
      };

      setState(newState);
      onSwipeProgress?.(direction, progress);
    };

    const handleEnd = (clientX: number, clientY: number) => {
      if (!isDraggingRef.current) return;

      const deltaX = clientX - startPos.current.x;
      const deltaY = clientY - startPos.current.y;
      const duration = Date.now() - startTime.current;
      const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / duration;

      let shouldTrigger = false;
      let direction: SwipeDirection = null;

      // Check if swipe meets threshold or velocity requirements
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (Math.abs(deltaX) >= threshold || velocity >= velocityThreshold) {
          shouldTrigger = true;
          direction = deltaX > 0 ? 'right' : 'left';
        }
      } else if (deltaY < -20) {
        // Upward swipe
        if (Math.abs(deltaY) >= threshold || velocity >= velocityThreshold) {
          shouldTrigger = true;
          direction = 'up';
        }
      }

      if (shouldTrigger && direction) {
        // Trigger appropriate callback
        switch (direction) {
          case 'left':
            onSwipeLeft?.();
            break;
          case 'right':
            onSwipeRight?.();
            break;
          case 'up':
            onSwipeUp?.();
            break;
        }
      }

      // Reset state
      reset();
    };

    // Touch event handlers
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      handleEnd(touch.clientX, touch.clientY);
    };

    const handleTouchCancel = () => {
      reset();
    };

    // Mouse event handlers (for desktop testing)
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      handleStart(e.clientX, e.clientY);
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleMouseUp = (e: MouseEvent) => {
      handleEnd(e.clientX, e.clientY);
    };

    const handleMouseLeave = () => {
      if (isDraggingRef.current) {
        reset();
      }
    };

    // Attach event listeners
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchCancel);

    element.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);

      element.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [
    ref,
    threshold,
    velocityThreshold,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeProgress,
    enabled,
    reset,
  ]);

  return {
    ...state,
    reset,
  };
}

export default useSwipeGesture;
