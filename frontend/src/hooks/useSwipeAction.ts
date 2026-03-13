/**
 * useSwipeAction - Touch Swipe Gesture Hook
 *
 * Provides swipe-left and swipe-right detection for list items.
 * Inspired by Apple Mail / iOS notification swipe patterns.
 *
 * Features:
 * - Configurable swipe threshold (default 80px)
 * - Velocity-based detection for quick swipes
 * - Horizontal-only detection (ignores vertical scrolling)
 * - Spring-back animation support via CSS transform
 * - Haptic feedback integration
 *
 * Usage:
 *   const { handlers, style, swiping } = useSwipeAction({
 *     onSwipeLeft: () => archive(id),
 *     onSwipeRight: () => favorite(id),
 *     threshold: 80,
 *   });
 *
 *   <div {...handlers} style={style}>Content</div>
 */

import { useRef, useState, useCallback, type TouchEvent, type CSSProperties } from 'react';
import { haptic } from '../utils/haptics';

interface SwipeActionOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  /** Maximum translateX in px (visual cap) */
  maxDistance?: number;
  /** Enable haptic feedback on threshold cross */
  hapticFeedback?: boolean;
}

interface SwipeState {
  startX: number;
  startY: number;
  currentX: number;
  startTime: number;
  isHorizontal: boolean | null;
  hasCrossedThreshold: boolean;
}

export function useSwipeAction({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
  maxDistance = 120,
  hapticFeedback = true,
}: SwipeActionOptions) {
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const stateRef = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    currentX: 0,
    startTime: 0,
    isHorizontal: null,
    hasCrossedThreshold: false,
  });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    stateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      startTime: Date.now(),
      isHorizontal: null,
      hasCrossedThreshold: false,
    };
    setSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!swiping) return;
    const touch = e.touches[0];
    const state = stateRef.current;
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;

    // Determine direction on first move (10px dead zone)
    if (state.isHorizontal === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      state.isHorizontal = Math.abs(dx) > Math.abs(dy);
      if (!state.isHorizontal) {
        setSwiping(false);
        setOffsetX(0);
        return;
      }
    }

    if (!state.isHorizontal) return;

    // Only allow swipe in directions that have handlers
    if (dx < 0 && !onSwipeLeft) return;
    if (dx > 0 && !onSwipeRight) return;

    // Apply resistance at maxDistance (rubber band effect)
    const clamped = Math.sign(dx) * Math.min(Math.abs(dx), maxDistance);
    const resistance = Math.abs(dx) > maxDistance
      ? clamped + (dx - clamped) * 0.3
      : dx;

    state.currentX = touch.clientX;
    setOffsetX(resistance);

    // Haptic feedback when crossing threshold
    if (hapticFeedback && !state.hasCrossedThreshold && Math.abs(dx) >= threshold) {
      state.hasCrossedThreshold = true;
      haptic('medium');
    }
  }, [swiping, onSwipeLeft, onSwipeRight, threshold, maxDistance, hapticFeedback]);

  const handleTouchEnd = useCallback(() => {
    if (!swiping) return;
    const state = stateRef.current;
    const dx = state.currentX - state.startX;
    const elapsed = Date.now() - state.startTime;
    const velocity = Math.abs(dx) / elapsed; // px/ms

    // Trigger action if threshold met OR velocity is high enough (quick flick)
    const triggered = Math.abs(dx) >= threshold || (velocity > 0.5 && Math.abs(dx) > 30);

    if (triggered && state.isHorizontal) {
      if (dx < 0 && onSwipeLeft) {
        haptic('success');
        onSwipeLeft();
      } else if (dx > 0 && onSwipeRight) {
        haptic('success');
        onSwipeRight();
      }
    }

    setSwiping(false);
    setOffsetX(0);
  }, [swiping, threshold, onSwipeLeft, onSwipeRight]);

  const handlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };

  const style: CSSProperties = {
    transform: offsetX !== 0 ? `translateX(${offsetX}px)` : undefined,
    transition: swiping ? 'none' : (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'transform 0.01ms' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)'),
    willChange: swiping ? 'transform' : undefined,
  };

  return {
    handlers,
    style,
    swiping,
    offsetX,
    /** Whether the current swipe has crossed the action threshold */
    pastThreshold: Math.abs(offsetX) >= threshold,
    /** Swipe direction: -1 left, 1 right, 0 none */
    direction: offsetX === 0 ? 0 : (offsetX < 0 ? -1 : 1) as -1 | 0 | 1,
  };
}
