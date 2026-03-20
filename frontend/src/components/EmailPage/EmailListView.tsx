/**
 * EmailListView - Virtualized email list using TanStack Virtual
 */
import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Email } from './types';
import { EmailCard } from './EmailCard';

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
      <div className="email-list-empty" role="status">
        <p>Keine E-Mails gefunden</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      data-view="list"
      style={{ height: '100%', minHeight: 200, overflow: 'auto' }}
      role="list"
      aria-label="E-Mail Liste"
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            role="listitem"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
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
