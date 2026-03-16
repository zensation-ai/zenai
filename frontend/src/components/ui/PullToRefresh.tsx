/**
 * Phase 85: PullToRefresh Component
 *
 * Wraps scrollable content and adds pull-to-refresh gesture:
 * - Pull down gesture triggers refresh callback
 * - Custom spinner animation during refresh
 * - 60px threshold before triggering
 * - Rotation icon that completes at threshold
 * - Uses touch events (touchstart, touchmove, touchend)
 * - GPU-composited transforms
 */

import { useRef, useState, useCallback, type ReactNode } from 'react';
import './PullToRefresh.css';

const PULL_THRESHOLD = 60;
const MAX_PULL = 120;

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  /** Whether pull-to-refresh is enabled (default: true) */
  enabled?: boolean;
}

export function PullToRefresh({
  onRefresh,
  children,
  enabled = true,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const touchStartY = useRef(0);
  const isTouching = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || isRefreshing) return;

    // Only activate if content is scrolled to top
    const container = containerRef.current;
    if (container && container.scrollTop > 0) return;

    touchStartY.current = e.touches[0].clientY;
    isTouching.current = true;
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isTouching.current || !enabled || isRefreshing) return;

    const container = containerRef.current;
    if (container && container.scrollTop > 0) {
      isTouching.current = false;
      setPullDistance(0);
      setIsPulling(false);
      return;
    }

    const deltaY = e.touches[0].clientY - touchStartY.current;

    if (deltaY > 0) {
      // Apply resistance: diminishing returns past threshold
      const distance = Math.min(deltaY * 0.5, MAX_PULL);
      setPullDistance(distance);
      setIsPulling(true);

      // Prevent native scroll while pulling
      if (distance > 10) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [enabled, isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isTouching.current || !enabled) return;
    isTouching.current = false;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD); // Hold at threshold during refresh

      try {
        await onRefresh();
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
  }, [pullDistance, isRefreshing, onRefresh, enabled]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const rotation = progress * 360;

  return (
    <div
      className="ptr-container"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className={`ptr-indicator ${isPulling || isRefreshing ? 'visible' : ''}`}
        style={{
          transform: `translateY(${pullDistance - 40}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <svg
          className={`ptr-spinner ${isRefreshing ? 'refreshing' : ''}`}
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
            opacity: Math.min(progress * 2, 1),
          }}
        >
          <path
            d="M12 4V2m0 2a8 8 0 1 0 8 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {progress >= 1 && !isRefreshing && (
            <circle
              cx="12"
              cy="12"
              r="3"
              fill="currentColor"
              opacity="0.5"
            />
          )}
        </svg>
      </div>

      {/* Content with pull offset */}
      <div
        className="ptr-content"
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
