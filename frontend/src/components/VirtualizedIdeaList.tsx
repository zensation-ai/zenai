/**
 * VirtualizedIdeaList
 *
 * High-performance virtualized list for rendering large numbers of ideas.
 * Uses @tanstack/react-virtual for windowing - only renders visible items.
 *
 * Benefits:
 * - Handles 1000+ ideas without performance degradation
 * - Smooth scrolling even with complex card components
 * - Reduced memory usage by only rendering visible cards
 * - Maintains grid/list view modes
 */

import { useRef, memo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { IdeaCard } from './IdeaCard';
import type { StructuredIdea } from '../types/idea';
import './VirtualizedIdeaList.css';

interface VirtualizedIdeaListProps {
  ideas: StructuredIdea[];
  viewMode: 'grid' | 'list';
  onIdeaClick?: (idea: StructuredIdea) => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  isArchived?: boolean;
  context: 'personal' | 'work';
}

// Estimated row heights for virtualization
const LIST_ROW_HEIGHT = 180;
const GRID_ROW_HEIGHT = 320;
const GRID_COLUMNS = 3;
const GRID_GAP = 16;

/**
 * VirtualizedIdeaList Component
 */
function VirtualizedIdeaListComponent({
  ideas,
  viewMode,
  onIdeaClick,
  onDelete,
  onArchive,
  onRestore,
  isArchived = false,
  context,
}: VirtualizedIdeaListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Calculate row count based on view mode
  const rowCount =
    viewMode === 'grid' ? Math.ceil(ideas.length / GRID_COLUMNS) : ideas.length;

  // Get row height based on view mode
  const getRowHeight = useCallback(
    () => (viewMode === 'grid' ? GRID_ROW_HEIGHT : LIST_ROW_HEIGHT),
    [viewMode]
  );

  // Initialize virtualizer
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: getRowHeight,
    overscan: 3, // Render 3 extra rows above/below viewport for smoother scrolling
  });

  // Get ideas for a specific row (handles grid layout)
  const getRowIdeas = useCallback(
    (rowIndex: number): StructuredIdea[] => {
      if (viewMode === 'list') {
        return [ideas[rowIndex]];
      }
      // Grid mode: return up to GRID_COLUMNS ideas for this row
      const startIndex = rowIndex * GRID_COLUMNS;
      return ideas.slice(startIndex, startIndex + GRID_COLUMNS);
    },
    [ideas, viewMode]
  );

  // Handle keyboard navigation on idea wrapper
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, idea: StructuredIdea) => {
      if ((e.key === 'Enter' || e.key === ' ') && onIdeaClick) {
        e.preventDefault();
        onIdeaClick(idea);
      }
    },
    [onIdeaClick]
  );

  if (ideas.length === 0) {
    return null;
  }

  return (
    <div
      ref={parentRef}
      className={`virtualized-list-container virtualized-${viewMode}`}
      style={{
        height: '600px', // Fixed height for virtualization container
        overflow: 'auto',
      }}
    >
      <div
        className="virtualized-list-inner"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowIdeas = getRowIdeas(virtualRow.index);

          return (
            <div
              key={virtualRow.key}
              className={`virtualized-row ${viewMode === 'grid' ? 'virtualized-grid-row' : 'virtualized-list-row'}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: viewMode === 'grid' ? 'grid' : 'block',
                gridTemplateColumns:
                  viewMode === 'grid'
                    ? `repeat(${GRID_COLUMNS}, 1fr)`
                    : undefined,
                gap: viewMode === 'grid' ? `${GRID_GAP}px` : undefined,
                padding: viewMode === 'list' ? '0 0 16px 0' : '0',
              }}
            >
              {rowIdeas.map((idea) => (
                <div
                  key={idea.id}
                  onClick={onIdeaClick ? () => onIdeaClick(idea) : undefined}
                  onKeyDown={onIdeaClick ? (e) => handleKeyDown(e, idea) : undefined}
                  className={`idea-wrapper virtualized-idea-wrapper ${onIdeaClick ? 'clickable' : ''}`}
                  {...(onIdeaClick && {
                    role: 'button',
                    tabIndex: 0,
                  })}
                  aria-label={`Gedanke: ${idea.title}`}
                >
                  <IdeaCard
                    idea={idea}
                    onDelete={onDelete}
                    onArchive={onArchive}
                    onRestore={onRestore}
                    isArchived={isArchived}
                    context={context}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const VirtualizedIdeaList = memo(VirtualizedIdeaListComponent);

/**
 * Threshold for when to use virtualization
 * Below this count, regular rendering is fine
 */
export const VIRTUALIZATION_THRESHOLD = 50;

/**
 * Smart list component that auto-selects virtualization based on count
 */
export function SmartIdeaList(props: VirtualizedIdeaListProps) {
  const { ideas, viewMode, onIdeaClick, onDelete, onArchive, onRestore, isArchived, context } = props;

  // Use virtualization for large lists
  if (ideas.length >= VIRTUALIZATION_THRESHOLD) {
    return <VirtualizedIdeaList {...props} />;
  }

  // Regular rendering for small lists
  return (
    <div className={`ideas-${viewMode}`} aria-label="Gedankenliste">
      {ideas.map((idea) => (
        <div
          key={idea.id}
          onClick={onIdeaClick ? () => onIdeaClick(idea) : undefined}
          onKeyDown={onIdeaClick ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onIdeaClick(idea);
            }
          } : undefined}
          className={`idea-wrapper ${onIdeaClick ? 'clickable' : ''}`}
          {...(onIdeaClick && {
            role: 'button',
            tabIndex: 0,
          })}
          aria-label={`Gedanke: ${idea.title}`}
        >
          <IdeaCard
            idea={idea}
            onDelete={onDelete}
            onArchive={onArchive}
            onRestore={onRestore}
            isArchived={isArchived}
            context={context}
          />
        </div>
      ))}
    </div>
  );
}

export default VirtualizedIdeaList;
