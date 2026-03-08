/**
 * EmailList - Premium email list with avatars, hover actions, batch operations
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Email, EmailTab } from './types';
import { CATEGORY_LABELS, PRIORITY_LABELS, stringToColor, getInitials, formatEmailDate, truncateText } from './types';
import './EmailList.css';

// Touch swipe threshold in pixels
const SWIPE_THRESHOLD = 80;

interface EmailListProps {
  emails: Email[];
  loading: boolean;
  error: string | null;
  total: number;
  searchQuery: string;
  onSearch: (query: string) => void;
  onSelect: (email: Email) => void;
  onStar: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onBatchAction: (ids: string[], status: string) => void;
  selectedId: string | null;
  focusedIndex: number;
  searchInputRef: React.RefObject<HTMLInputElement>;
  activeFolder: EmailTab;
}

export function EmailList({
  emails, loading, error, total, searchQuery, onSearch,
  onSelect, onStar, onArchive, onDelete, onBatchAction,
  selectedId, focusedIndex, searchInputRef, activeFolder,
}: EmailListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const [swipeId, setSwipeId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  // Detect touch device
  const isTouchDevice = useMemo(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  []);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('.el-row');
      const item = items[focusedIndex];
      if (item) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusedIndex]);

  // Touch handlers for swipe-to-action on mobile
  const handleTouchStart = useCallback((id: string, e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
    setSwipeId(id);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeId) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Only register horizontal swipes (not vertical scrolling)
    if (!isSwiping.current && Math.abs(dy) > Math.abs(dx)) {
      setSwipeId(null);
      return;
    }
    isSwiping.current = true;
    // Clamp swipe offset between -150 and 150
    setSwipeOffset(Math.max(-150, Math.min(150, dx)));
  }, [swipeId]);

  const handleTouchEnd = useCallback(() => {
    if (!swipeId) return;
    if (swipeOffset > SWIPE_THRESHOLD) {
      // Swipe right → archive
      onArchive(swipeId);
    } else if (swipeOffset < -SWIPE_THRESHOLD) {
      // Swipe left → delete
      onDelete(swipeId);
    }
    setSwipeId(null);
    setSwipeOffset(0);
    isSwiping.current = false;
  }, [swipeId, swipeOffset, onArchive, onDelete]);

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
    if (selected.size === emails.length) setSelected(new Set());
    else setSelected(new Set(emails.map(e => e.id)));
  }, [emails, selected.size]);

  const handleBatchAction = useCallback((status: string) => {
    if (selected.size === 0) return;
    onBatchAction(Array.from(selected), status);
    setSelected(new Set());
  }, [selected, onBatchAction]);

  const isUnread = (email: Email) => email.status === 'received';
  const senderDisplay = (email: Email) => {
    if (email.direction === 'outbound') {
      return email.to_addresses[0]?.name || email.to_addresses[0]?.email || 'Entwurf';
    }
    return email.from_name || email.from_address;
  };

  return (
    <div className="el-container">
      {/* Search */}
      <div className="el-search" role="search">
        <span className="el-search-icon" aria-hidden="true">⌕</span>
        <input
          ref={searchInputRef}
          type="search"
          className="el-search-input"
          placeholder="Suchen... (/ druecken)"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="E-Mails durchsuchen"
        />
        {searchQuery && (
          <button className="el-search-clear" onClick={() => onSearch('')}>
            &times;
          </button>
        )}
      </div>

      {/* Batch bar */}
      {selected.size > 0 && (
        <div className="el-batch">
          <label className="el-batch-check">
            <input type="checkbox" checked={selected.size === emails.length} onChange={selectAll} />
            <span>{selected.size} ausgewaehlt</span>
          </label>
          <div className="el-batch-actions">
            <button onClick={() => handleBatchAction('read')} title="Als gelesen markieren">✓ Gelesen</button>
            <button onClick={() => handleBatchAction('archived')} title="Archivieren">📦 Archiv</button>
            <button onClick={() => handleBatchAction('trash')} title="Loeschen" className="el-batch-delete">🗑 Loeschen</button>
          </div>
          <button className="el-batch-cancel" onClick={() => setSelected(new Set())}>Abbrechen</button>
        </div>
      )}

      {/* List header */}
      {emails.length > 0 && selected.size === 0 && (
        <div className="el-list-header">
          <button className="el-select-all-btn" onClick={selectAll} title="Alle auswaehlen">
            <span className="el-checkbox-empty" />
          </button>
          <span className="el-count">{total} E-Mail{total !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Scrollable list */}
      <div className="el-scroll" ref={listRef} role="list" aria-label="E-Mail-Liste">
        {/* Loading */}
        {loading && emails.length === 0 && (
          <div className="el-state" role="status" aria-live="polite">
            <div className="el-spinner" aria-hidden="true" />
            <p>Lade E-Mails...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="el-state el-state--error" role="alert">
            <p>{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && emails.length === 0 && (
          <div className="el-state el-state--empty" role="status">
            <span className="el-empty-icon" aria-hidden="true">
              {activeFolder === 'inbox' ? '📭' : activeFolder === 'sent' ? '📤' : activeFolder === 'drafts' ? '📝' : '📦'}
            </span>
            <p>{searchQuery ? `Keine Ergebnisse fuer "${searchQuery}"` : 'Keine E-Mails'}</p>
          </div>
        )}

        {/* Email rows */}
        {emails.map((email, idx) => {
          const sender = senderDisplay(email);
          const initials = getInitials(email.from_name, email.from_address);
          const avatarColor = stringToColor(email.from_address);
          const unread = isUnread(email);
          const isSelected = selectedId === email.id;
          const isFocused = focusedIndex === idx && !selectedId;
          const isChecked = selected.has(email.id);
          const isSwipingThis = swipeId === email.id && Math.abs(swipeOffset) > 10;

          return (
            <div
              key={email.id}
              className={[
                'el-row',
                unread && 'el-row--unread',
                isSelected && 'el-row--selected',
                isFocused && 'el-row--focused',
                isChecked && 'el-row--checked',
                isSwipingThis && swipeOffset > 0 && 'el-row--swipe-right',
                isSwipingThis && swipeOffset < 0 && 'el-row--swipe-left',
              ].filter(Boolean).join(' ')}
              style={isSwipingThis ? { transform: `translateX(${swipeOffset}px)`, transition: 'none' } : undefined}
              onClick={() => { if (!isSwiping.current) onSelect(email); }}
              role="listitem"
              tabIndex={0}
              aria-label={`${unread ? 'Ungelesen: ' : ''}${sender} - ${email.subject || '(Kein Betreff)'}`}
              aria-selected={isSelected}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelect(email); }}
              onTouchStart={isTouchDevice ? (e) => handleTouchStart(email.id, e) : undefined}
              onTouchMove={isTouchDevice ? handleTouchMove : undefined}
              onTouchEnd={isTouchDevice ? handleTouchEnd : undefined}
            >
              {/* Checkbox (visible on hover or when batch mode) */}
              <div className="el-row-check" onClick={(e) => toggleSelect(email.id, e)}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  tabIndex={-1}
                  aria-label={`${sender} auswaehlen`}
                />
              </div>

              {/* Avatar */}
              <div
                className="el-avatar"
                style={{ backgroundColor: avatarColor + '20', color: avatarColor }}
              >
                {email.direction === 'outbound' ? '→' : initials}
              </div>

              {/* Content */}
              <div className="el-content">
                <div className="el-row-top">
                  <span className={`el-sender ${unread ? 'el-sender--bold' : ''}`}>
                    {sender}
                  </span>
                  <span className="el-date">{formatEmailDate(email.received_at || email.created_at)}</span>
                </div>
                <div className={`el-subject ${unread ? 'el-subject--bold' : ''}`}>
                  {email.subject || '(Kein Betreff)'}
                  {(email.thread_count ?? 0) > 1 && (
                    <span className="el-thread-badge">{email.thread_count}</span>
                  )}
                </div>
                <div className="el-preview">
                  {email.ai_summary || truncateText(email.body_text, 100)}
                </div>
              </div>

              {/* Right side: badges + actions */}
              <div className="el-right">
                {/* Badges (visible when not hovered) */}
                <div className="el-badges">
                  {email.ai_category && CATEGORY_LABELS[email.ai_category] && (
                    <span
                      className="el-badge"
                      style={{ backgroundColor: CATEGORY_LABELS[email.ai_category].color + '20', color: CATEGORY_LABELS[email.ai_category].color }}
                    >
                      {CATEGORY_LABELS[email.ai_category].icon}
                    </span>
                  )}
                  {email.ai_priority && email.ai_priority !== 'medium' && email.ai_priority !== 'low' && PRIORITY_LABELS[email.ai_priority] && (
                    <span
                      className="el-badge"
                      style={{ backgroundColor: PRIORITY_LABELS[email.ai_priority].color + '20', color: PRIORITY_LABELS[email.ai_priority].color }}
                    >
                      {PRIORITY_LABELS[email.ai_priority].icon}
                    </span>
                  )}
                  {email.has_attachments && <span className="el-badge el-badge--muted">📎</span>}
                  {email.labels?.length > 0 && email.labels.slice(0, 2).map(label => (
                    <span key={label} className="el-label-chip">{label}</span>
                  ))}
                </div>

                {/* Quick actions (visible on hover / always on touch) */}
                <div className={`el-quick-actions ${isTouchDevice ? 'el-quick-actions--touch' : ''}`}>
                  <button
                    className={`el-qa-btn ${email.is_starred ? 'el-qa-btn--starred' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onStar(email.id); }}
                    title={email.is_starred ? 'Stern entfernen' : 'Stern setzen'}
                    aria-label={email.is_starred ? 'Stern entfernen' : 'Stern setzen'}
                  >
                    {email.is_starred ? '★' : '☆'}
                  </button>
                  <button
                    className="el-qa-btn"
                    onClick={(e) => { e.stopPropagation(); onArchive(email.id); }}
                    title="Archivieren (e)"
                    aria-label="Archivieren"
                  >
                    📦
                  </button>
                  <button
                    className="el-qa-btn el-qa-btn--danger"
                    onClick={(e) => { e.stopPropagation(); onDelete(email.id); }}
                    title="Loeschen (#)"
                    aria-label="Loeschen"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {/* Star indicator (always visible on mobile or when starred) */}
              {email.is_starred && (
                <span className="el-star-indicator">★</span>
              )}

              {/* Unread dot */}
              {unread && <span className="el-unread-dot" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
