/**
 * EmailGridView - Virtualized grid of email cards using TanStack Virtual
 */
import React, { useRef } from 'react';
import type { CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Email } from './types';
import { EmailCard } from './EmailCard';
interface EmailGridViewProps {
  emails: Email[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStar?: (id: string) => void;
}

const COLUMNS = 3;
const ROW_HEIGHT = 200;

export const EmailGridView: React.FC<EmailGridViewProps> = ({
  emails,
  selectedId,
  onSelect,
  onStar,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(emails.length / COLUMNS);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 2,
  });

  if (emails.length === 0) {
    return (
      <div className="email-grid-empty" role="status">
        <span className="text-[2.5rem] block mb-3">📭</span>
        <p className="font-medium text-base">Keine E-Mails gefunden</p>
        <p className="text-sm opacity-60 mt-1">Passe die Filter an oder warte auf neue Nachrichten</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      data-view="grid"
      className="email-grid-container h-full min-h-[200px] overflow-auto"
      aria-label="E-Mail Kacheln"
    >
      <div className="relative w-full h-[var(--total-h)]" style={{ '--total-h': `${virtualizer.getTotalSize()}px` } as CSSProperties}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const startIdx = virtualRow.index * COLUMNS;
          const rowEmails = emails.slice(startIdx, startIdx + COLUMNS);
          return (
            <div
              key={virtualRow.key}
              className="email-grid-row absolute left-0 w-full h-[var(--h)]"
              style={{ '--h': `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` } as CSSProperties}
            >
              {rowEmails.map(email => (
                <EmailCard
                  key={email.id}
                  email={email}
                  selected={email.id === selectedId}
                  onSelect={onSelect}
                  onStar={onStar}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
