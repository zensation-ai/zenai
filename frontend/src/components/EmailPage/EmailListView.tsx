/**
 * EmailListView - Virtualized email list using TanStack Virtual
 */
import React, { useRef } from 'react';
import type { CSSProperties } from 'react';
import { Mail } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Email } from './types';
import { EmailCard } from './EmailCard';
import { EmptyStateWithDemoSeed } from '../shared/EmptyStateWithDemoSeed';

interface EmailListViewProps {
  emails: Email[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStar?: (id: string) => void;
}

const ROW_HEIGHT = 80;

export const EmailListView: React.FC<EmailListViewProps> = ({
  emails,
  selectedId,
  onSelect,
  onStar,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  if (emails.length === 0) {
    return (
      <EmptyStateWithDemoSeed
        icon={<Mail size={40} strokeWidth={1.5} />}
        title="Keine E-Mails"
        description="Passe die Filter an oder lade Demo-Daten, um den Inbox-Flow auszuprobieren."
        createLabel={null}
      />
    );
  }

  return (
    <div
      ref={parentRef}
      data-view="list"
      className="h-full min-h-[200px] overflow-auto"
      role="list"
      aria-label="E-Mail Liste"
    >
      <div className="relative w-full h-[var(--total-h)]" style={{ '--total-h': `${virtualizer.getTotalSize()}px` } as CSSProperties}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            role="listitem"
            className="absolute left-0 w-full h-[var(--h)]"
            style={{ '--h': `${virtualItem.size}px`, transform: `translateY(${virtualItem.start}px)` } as CSSProperties}
          >
            <EmailCard
              email={emails[virtualItem.index]}
              selected={emails[virtualItem.index].id === selectedId}
              onSelect={onSelect}
              onStar={onStar}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
