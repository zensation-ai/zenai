/**
 * useVirtualList
 *
 * Generic wrapper around @tanstack/react-virtual's useVirtualizer.
 * Handles ref creation and scroll element setup, and exposes a minimal
 * surface for rendering virtualised lists and grids.
 *
 * Usage:
 *   const { parentRef, virtualItems, totalSize, scrollToIndex } =
 *     useVirtualList({ count: items.length, estimateSize: () => 80 });
 */

import { useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { VirtualItem } from '@tanstack/react-virtual';

// Re-export for consumers who need the type
export type { VirtualItem };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UseVirtualListOptions {
  /** Total number of items in the list */
  count: number;
  /**
   * Callback that returns the estimated pixel height (vertical) or width
   * (horizontal) for the item at the given index.
   */
  estimateSize: (index: number) => number;
  /** Number of extra items rendered outside the visible viewport (default: 3) */
  overscan?: number;
  /** Render items along the horizontal axis instead of vertical (default: false) */
  horizontal?: boolean;
}

export interface UseVirtualListResult {
  /** Attach this ref to the scrollable container element */
  parentRef: RefObject<HTMLDivElement>;
  /** The virtual items that should be rendered in the current viewport */
  virtualItems: VirtualItem[];
  /** Total pixel size of the inner container (height for vertical, width for horizontal) */
  totalSize: number;
  /** Imperatively scroll to the item at the given index */
  scrollToIndex: (index: number) => void;
}

/**
 * Handle type for consumers that need to pass the ref around imperatively.
 */
export type VirtualListHandle = RefObject<HTMLDivElement>;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Generic virtual list hook.
 *
 * Wraps `useVirtualizer` from `@tanstack/react-virtual` and handles:
 * - `parentRef` creation and `getScrollElement` wiring
 * - Exposing `virtualItems`, `totalSize`, and `scrollToIndex`
 *
 * @example
 * ```tsx
 * const { parentRef, virtualItems, totalSize, scrollToIndex } = useVirtualList({
 *   count: rows.length,
 *   estimateSize: () => 48,
 *   overscan: 5,
 * });
 *
 * return (
 *   <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
 *     <div style={{ height: totalSize, position: 'relative' }}>
 *       {virtualItems.map(item => (
 *         <div
 *           key={item.key}
 *           style={{
 *             position: 'absolute',
 *             top: item.start,
 *             height: item.size,
 *             width: '100%',
 *           }}
 *         >
 *           {rows[item.index]}
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualList({
  count,
  estimateSize,
  overscan = 3,
  horizontal = false,
}: UseVirtualListOptions): UseVirtualListResult {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
    horizontal,
  });

  const scrollToIndex = useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index);
    },
    [virtualizer],
  );

  return {
    parentRef,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    scrollToIndex,
  };
}
