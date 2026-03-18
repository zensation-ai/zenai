/**
 * SearchResultCard — Individual result card for Universal Search (Phase 95)
 */

import { memo, useMemo, type ReactNode } from 'react';

// ===========================================
// Types
// ===========================================

export type SearchEntityType =
  | 'ideas'
  | 'emails'
  | 'tasks'
  | 'contacts'
  | 'documents'
  | 'chat_messages'
  | 'calendar_events'
  | 'transactions'
  | 'knowledge_entities';

export interface SearchResultItem {
  id: string;
  type: SearchEntityType;
  title: string;
  snippet: string;
  score: number;
  context: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface SearchResultCardProps {
  result: SearchResultItem;
  query: string;
  isSelected: boolean;
  onClick: () => void;
}

// ===========================================
// Type Config
// ===========================================

const TYPE_CONFIG: Record<SearchEntityType, { icon: string; label: string; color: string }> = {
  ideas: { icon: '\u{1F4A1}', label: 'Gedanke', color: '#f59e0b' },
  emails: { icon: '\u{2709}\u{FE0F}', label: 'E-Mail', color: '#3b82f6' },
  tasks: { icon: '\u{2705}', label: 'Aufgabe', color: '#10b981' },
  contacts: { icon: '\u{1F464}', label: 'Kontakt', color: '#8b5cf6' },
  documents: { icon: '\u{1F4C4}', label: 'Dokument', color: '#6366f1' },
  chat_messages: { icon: '\u{1F4AC}', label: 'Chat', color: '#ec4899' },
  calendar_events: { icon: '\u{1F4C5}', label: 'Termin', color: '#14b8a6' },
  transactions: { icon: '\u{1F4B0}', label: 'Transaktion', color: '#f97316' },
  knowledge_entities: { icon: '\u{1F310}', label: 'Wissen', color: '#06b6d4' },
};

// ===========================================
// Helpers
// ===========================================

function highlightMatch(text: string, query: string): ReactNode {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="us-highlight">{part}</mark>
      : part
  );
}

function formatRelativeTime(timestamp: string): string {
  if (!timestamp) return '';
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'gerade eben';
  if (diffMins < 60) return `vor ${diffMins}m`;
  if (diffHours < 24) return `vor ${diffHours}h`;
  if (diffDays < 7) return `vor ${diffDays}d`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ===========================================
// Component
// ===========================================

export const SearchResultCard = memo(function SearchResultCard({
  result,
  query,
  isSelected,
  onClick,
}: SearchResultCardProps) {
  const config = TYPE_CONFIG[result.type] ?? { icon: '\u{1F50D}', label: result.type, color: '#6b7280' };

  const highlightedTitle = useMemo(
    () => highlightMatch(result.title, query),
    [result.title, query]
  );

  const highlightedSnippet = useMemo(
    () => highlightMatch(result.snippet, query),
    [result.snippet, query]
  );

  return (
    <div
      className={`us-result-card ${isSelected ? 'us-result-card--selected' : ''}`}
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
      tabIndex={-1}
    >
      <div className="us-result-icon" style={{ color: config.color }}>
        {config.icon}
      </div>
      <div className="us-result-content">
        <div className="us-result-header">
          <span className="us-result-title">{highlightedTitle}</span>
          <span className="us-result-time">{formatRelativeTime(result.timestamp)}</span>
        </div>
        {result.snippet && (
          <p className="us-result-snippet">{highlightedSnippet}</p>
        )}
        <div className="us-result-meta">
          <span
            className="us-result-badge"
            style={{ backgroundColor: `${config.color}20`, color: config.color }}
          >
            {config.label}
          </span>
          <span className="us-result-context">{result.context}</span>
        </div>
      </div>
    </div>
  );
});
