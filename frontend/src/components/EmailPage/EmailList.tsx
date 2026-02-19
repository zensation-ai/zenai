/**
 * EmailList - Email list with search, filter, and bulk actions
 */

import { useState, useCallback } from 'react';
import type { Email } from './types';
import { CATEGORY_LABELS, PRIORITY_LABELS } from './types';
import './EmailList.css';

interface EmailListProps {
  emails: Email[];
  loading: boolean;
  error: string | null;
  total: number;
  searchQuery: string;
  onSearch: (query: string) => void;
  onSelect: (email: Email) => void;
  onStar: (id: string) => void;
  onDelete: (id: string) => void;
  onBatchAction: (ids: string[], status: string) => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '–';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '–';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  if (isThisYear) {
    return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: '2-digit' });
}

function truncate(text: string | null, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

export function EmailList({ emails, loading, error, total, searchQuery, onSearch, onSelect, onStar, onDelete, onBatchAction }: EmailListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selected.size === emails.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(emails.map(e => e.id)));
    }
  }, [emails, selected.size]);

  const handleBatchAction = useCallback((status: string) => {
    if (selected.size === 0) return;
    onBatchAction(Array.from(selected), status);
    setSelected(new Set());
  }, [selected, onBatchAction]);

  return (
    <div className="email-list">
      {/* Search Bar */}
      <div className="email-search">
        <input
          type="text"
          className="email-search-input"
          placeholder="E-Mails durchsuchen..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
        />
        {searchQuery && (
          <button className="email-search-clear" onClick={() => onSearch('')} aria-label="Suche leeren">
            &times;
          </button>
        )}
      </div>

      {/* Batch Actions */}
      {selected.size > 0 && (
        <div className="email-batch-bar">
          <span>{selected.size} ausgewählt</span>
          <button onClick={() => handleBatchAction('read')}>Als gelesen</button>
          <button onClick={() => handleBatchAction('archived')}>Archivieren</button>
          <button onClick={() => handleBatchAction('trash')}>Löschen</button>
          <button onClick={() => setSelected(new Set())}>Abbrechen</button>
        </div>
      )}

      {/* Select All */}
      {emails.length > 0 && selected.size === 0 && (
        <div className="email-list-header">
          <button className="email-select-all" onClick={selectAll}>
            Alle auswählen
          </button>
          <span className="email-count">{total} E-Mail{total !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Loading State */}
      {loading && emails.length === 0 && (
        <div className="email-loading">
          <div className="email-loading-spinner" />
          <p>Lade E-Mails...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="email-error">
          <p>{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && emails.length === 0 && (
        <div className="email-empty">
          <span className="email-empty-icon">📭</span>
          <p>Keine E-Mails{searchQuery ? ` für "${searchQuery}"` : ''}</p>
        </div>
      )}

      {/* Email Rows */}
      {emails.map(email => (
        <div
          key={email.id}
          className={`email-row ${email.status === 'received' ? 'email-row--unread' : ''} ${selected.has(email.id) ? 'email-row--selected' : ''}`}
          onClick={() => onSelect(email)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onSelect(email); }}
        >
          {/* Checkbox */}
          <div className="email-row-check" onClick={(e) => toggleSelect(email.id, e)}>
            <input
              type="checkbox"
              checked={selected.has(email.id)}
              onChange={() => {}}
              tabIndex={-1}
            />
          </div>

          {/* Star */}
          <button
            className={`email-row-star ${email.is_starred ? 'email-row-star--active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onStar(email.id); }}
            aria-label={email.is_starred ? 'Stern entfernen' : 'Stern setzen'}
          >
            {email.is_starred ? '★' : '☆'}
          </button>

          {/* Unread indicator */}
          {email.status === 'received' && <span className="email-row-unread-dot" />}

          {/* Content */}
          <div className="email-row-content">
            <div className="email-row-top">
              <span className={`email-row-from ${email.status === 'received' ? 'email-row-from--bold' : ''}`}>
                {email.direction === 'outbound' ? `An: ${email.to_addresses[0]?.email || ''}` : email.from_name || email.from_address}
              </span>
              <span className="email-row-date">{formatDate(email.received_at || email.created_at)}</span>
            </div>
            <div className="email-row-subject">
              {email.subject || '(Kein Betreff)'}
            </div>
            <div className="email-row-preview">
              {email.ai_summary || truncate(email.body_text, 120)}
            </div>
          </div>

          {/* Badges */}
          <div className="email-row-badges">
            {email.ai_category && CATEGORY_LABELS[email.ai_category] && (
              <span
                className="email-badge"
                style={{ backgroundColor: CATEGORY_LABELS[email.ai_category].color + '30', color: CATEGORY_LABELS[email.ai_category].color }}
              >
                {CATEGORY_LABELS[email.ai_category].label}
              </span>
            )}
            {email.ai_priority && email.ai_priority !== 'medium' && PRIORITY_LABELS[email.ai_priority] && (
              <span
                className="email-badge"
                style={{ backgroundColor: PRIORITY_LABELS[email.ai_priority].color + '30', color: PRIORITY_LABELS[email.ai_priority].color }}
              >
                {PRIORITY_LABELS[email.ai_priority].label}
              </span>
            )}
            {email.has_attachments && <span className="email-badge email-badge--attachment">📎</span>}
            {email.thread_count && email.thread_count > 1 && (
              <span className="email-badge email-badge--thread">{email.thread_count}</span>
            )}
          </div>

          {/* Delete */}
          <button
            className="email-row-delete"
            onClick={(e) => { e.stopPropagation(); onDelete(email.id); }}
            aria-label="Löschen"
          >
            🗑
          </button>
        </div>
      ))}
    </div>
  );
}
