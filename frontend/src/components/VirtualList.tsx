import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Estimated height of each item in pixels */
  estimateSize: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** Height of the scrollable container (CSS value) */
  height: string | number;
  /** Number of items to render outside the visible area */
  overscan?: number;
  /** Optional className for the outer container */
  className?: string;
  /** Optional style for the outer container */
  style?: CSSProperties;
  /** Key extractor for stable rendering */
  getItemKey?: (index: number) => string | number;
}

/**
 * VirtualList — Renders only visible items for large lists.
 *
 * Built on @tanstack/react-virtual (already a project dependency).
 * Supports dynamic item heights via the estimateSize prop.
 *
 * Usage:
 *   <VirtualList
 *     items={ideas}
 *     estimateSize={72}
 *     height="calc(100vh - 200px)"
 *     renderItem={(idea, index) => <IdeaCard key={idea.id} idea={idea} />}
 *   />
 */
export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  height,
  overscan = 5,
  className,
  style,
  getItemKey,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        height,
        overflow: 'auto',
        contain: 'strict',
        ...style,
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {renderItem(items[virtualRow.index], virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
