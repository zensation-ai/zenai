/**
 * usePullToRefresh — Pull-to-refresh hook for touch devices.
 *
 * Attaches to a scrollable container and calls queryClient.invalidateQueries()
 * when the user pulls down past the threshold at the top of the scroll area.
 * Only activates on touch devices.
 *
 * Usage:
 *   const ptr = usePullToRefresh({ queryKey: ['ideas', context] });
 *   <div ref={ptr.containerRef} {...ptr.touchHandlers}>
 *     <div style={ptr.contentStyle}>{children}</div>
 *   </div>
 */

import { useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface UsePullToRefreshOptions {
  /** Specific query key to invalidate. Omit to invalidate all queries. */
  queryKey?: unknown[];
  /** Whether pull-to-refresh is active (default: true) */
  enabled?: boolean;
  /** Pull distance (px) needed to trigger refresh (default: 60) */
  threshold?: number;
}

interface UsePullToRefreshResult {
  containerRef: React.RefObject<HTMLDivElement>;
  touchHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  /** Inline style to translate content while pulling */
  contentStyle: React.CSSProperties;
  isPulling: boolean;
  isRefreshing: boolean;
  /** 0–1 pull progress toward threshold */
  progress: number;
}

const MAX_PULL_MULTIPLIER = 2;
const RESISTANCE = 0.5;

export function usePullToRefresh({
  queryKey,
  enabled = true,
  threshold = 60,
}: UsePullToRefreshOptions = {}): UsePullToRefreshResult {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const touchStartY = useRef(0);
  const isTouching = useRef(false);
  const maxPull = threshold * MAX_PULL_MULTIPLIER;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || isRefreshing) return;
      // Only activate when scrolled to the very top
      if (containerRef.current && containerRef.current.scrollTop > 0) return;
      touchStartY.current = e.touches[0].clientY;
      isTouching.current = true;
    },
    [enabled, isRefreshing],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isTouching.current || !enabled || isRefreshing) return;
      // Stop if user scrolled down inside the container
      if (containerRef.current && containerRef.current.scrollTop > 0) {
        isTouching.current = false;
        setPullDistance(0);
        setIsPulling(false);
        return;
      }

      const deltaY = e.touches[0].clientY - touchStartY.current;
      if (deltaY > 0) {
        const distance = Math.min(deltaY * RESISTANCE, maxPull);
        setPullDistance(distance);
        setIsPulling(true);
        // Prevent native scroll bounce while pulling
        if (distance > 10) e.preventDefault();
      } else {
        setPullDistance(0);
        setIsPulling(false);
      }
    },
    [enabled, isRefreshing, maxPull],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isTouching.current || !enabled) return;
    isTouching.current = false;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold); // hold at threshold during refresh

      try {
        if (queryKey) {
          await queryClient.invalidateQueries({ queryKey });
        } else {
          await queryClient.invalidateQueries();
        }
      } catch {
        // Silently handle refresh errors
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
        setIsPulling(false);
      }
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [pullDistance, isRefreshing, enabled, threshold, queryClient, queryKey]);

  const contentStyle: React.CSSProperties =
    pullDistance > 0
      ? {
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
        }
      : {};

  return {
    containerRef,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    contentStyle,
    isPulling,
    isRefreshing,
    progress: Math.min(pullDistance / threshold, 1),
  };
}
