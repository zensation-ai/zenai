import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { IdeaCard2 } from './IdeaCard2';
import type { StructuredIdea } from '../../types';

interface IdeaListViewProps {
  ideas: StructuredIdea[];
  onIdeaClick: (idea: StructuredIdea) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
}

const ROW_HEIGHT = 64;
const GAP = 4;

export function IdeaListView({ ideas, onIdeaClick, selectionMode, selectedIds, onSelect }: IdeaListViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: ideas.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT + GAP,
    overscan: 5,
  });

  if (ideas.length === 0) {
    return null;
  }

  const virtualItems = virtualizer.getVirtualItems();
  // Fallback for test environments where container has 0 height
  const itemsToRender = virtualItems.length > 0
    ? virtualItems
    : ideas.map((_, i) => ({ key: i, index: i, start: i * (ROW_HEIGHT + GAP) }));

  return (
    <div ref={parentRef} className="idea-list-view" style={{ overflow: 'auto', flex: 1 }}>
      <div style={{ height: virtualizer.getTotalSize() || ideas.length * (ROW_HEIGHT + GAP), position: 'relative' }}>
        {itemsToRender.map(row => {
          const idea = ideas[row.index];
          return (
            <div
              key={row.key}
              style={{
                position: 'absolute',
                top: row.start,
                left: 0,
                right: 0,
                padding: '0 var(--spacing-4, 16px)',
              }}
            >
              <IdeaCard2
                idea={idea}
                onClick={onIdeaClick}
                view="list"
                selectionMode={selectionMode}
                isSelected={selectedIds?.has(idea.id)}
                onSelect={onSelect}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
