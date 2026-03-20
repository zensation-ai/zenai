import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { IdeaCard2 } from './IdeaCard2';
import type { StructuredIdea } from '../../types';

interface IdeaGridViewProps {
  ideas: StructuredIdea[];
  onIdeaClick: (idea: StructuredIdea) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
}

const COLUMNS = 3;
const ROW_HEIGHT = 220;
const GAP = 12;

export function IdeaGridView({ ideas, onIdeaClick, selectionMode, selectedIds, onSelect }: IdeaGridViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(ideas.length / COLUMNS);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT + GAP,
    overscan: 3,
  });

  if (ideas.length === 0) {
    return null;
  }

  const virtualItems = virtualizer.getVirtualItems();
  // Fallback for test environments where container has 0 height
  const rowsToRender = virtualItems.length > 0
    ? virtualItems
    : Array.from({ length: rowCount }, (_, i) => ({ key: i, index: i, start: i * (ROW_HEIGHT + GAP) }));

  return (
    <div ref={parentRef} className="idea-grid-view" style={{ overflow: 'auto', flex: 1 }}>
      <div style={{ height: virtualizer.getTotalSize() || rowCount * (ROW_HEIGHT + GAP), position: 'relative' }}>
        {rowsToRender.map(row => {
          const startIdx = row.index * COLUMNS;
          const rowIdeas = ideas.slice(startIdx, startIdx + COLUMNS);
          return (
            <div
              key={row.key}
              style={{
                position: 'absolute',
                top: row.start,
                left: 0,
                right: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
                gap: `${GAP}px`,
                padding: '0 var(--spacing-4, 16px)',
              }}
            >
              {rowIdeas.map(idea => (
                <IdeaCard2
                  key={idea.id}
                  idea={idea}
                  onClick={onIdeaClick}
                  view="grid"
                  selectionMode={selectionMode}
                  isSelected={selectedIds?.has(idea.id)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
