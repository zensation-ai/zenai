/**
 * EmailGridView - Virtualized grid of email cards using TanStack Virtual
 */
import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Email } from './types';
import { EmailCard } from './EmailCard';
import './EmailGridView.css';

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
        <p>Keine E-Mails gefunden</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      data-view="grid"
      className="email-grid-container"
      style={{ height: '100%', overflow: 'auto' }}
      aria-label="E-Mail Kacheln"
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const startIdx = virtualRow.index * COLUMNS;
          const rowEmails = emails.slice(startIdx, startIdx + COLUMNS);
          return (
            <div
              key={virtualRow.key}
              className="email-grid-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
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
