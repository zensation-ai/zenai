/**
 * UnifiedAssistant Overlay (Phase 91)
 *
 * Siri-like assistant overlay triggered by Cmd+Shift+Space.
 * Provides natural language navigation, creation, search, and actions.
 */

import { useRef, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import type { Page } from '../../types/idea';
import {
  useUnifiedAssistant,
  type AssistantAction,
  type ContextSuggestion,
} from '../../hooks/useUnifiedAssistant';
import './UnifiedAssistant.css';

// ===========================================
// Types
// ===========================================

interface UnifiedAssistantProps {
  context: string;
  currentPage: string;
  onNavigate: (page: Page) => void;
  onOpenSearch?: () => void;
}

// ===========================================
// Intent Labels
// ===========================================

const INTENT_LABELS: Record<string, string> = {
  navigate: 'Navigation',
  create: 'Erstellen',
  search: 'Suche',
  action: 'Aktion',
  question: 'Frage',
};

// ===========================================
// Component
// ===========================================

export const UnifiedAssistant = memo(function UnifiedAssistant({
  context,
  currentPage,
  onNavigate,
  onOpenSearch,
}: UnifiedAssistantProps) {
  const {
    isOpen,
    close,
    query,
    setQuery,
    results,
    suggestions,
    isLoading,
    selectedIndex,
    setSelectedIndex,
    submitQuery,
  } = useUnifiedAssistant({ context, currentPage });

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      closingRef.current = false;
      // Small delay to ensure animation has started
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Get the current action items to display
  const displayItems: (AssistantAction | ContextSuggestion)[] =
    results?.actions ?? (query.trim().length < 2 ? suggestions : []);

  const totalItems = displayItems.length;

  // Handle closing with animation
  const handleClose = useCallback(() => {
    closingRef.current = true;
    // Let closing animation play
    setTimeout(() => {
      close();
      closingRef.current = false;
    }, 150);
    // Force re-render to add closing class
    inputRef.current?.blur();
  }, [close]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;

        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(
            totalItems > 0 ? (selectedIndex + 1) % totalItems : 0
          );
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(
            totalItems > 0 ? (selectedIndex - 1 + totalItems) % totalItems : 0
          );
          break;

        case 'Enter':
          e.preventDefault();
          if (totalItems > 0 && selectedIndex < totalItems) {
            const item = displayItems[selectedIndex];
            handleItemSelect(item);
          } else {
            submitQuery();
          }
          break;
      }
    },
    [handleClose, selectedIndex, totalItems, displayItems, submitQuery, setSelectedIndex]
  );

  // Handle item selection
  const handleItemSelect = useCallback(
    (item: AssistantAction | ContextSuggestion) => {
      // ContextSuggestion has a `query` field
      if ('query' in item && 'category' in item) {
        // It is a suggestion — set query and process
        setQuery(item.query);
        return;
      }

      // AssistantAction
      const action = item as AssistantAction;
      if (action.page) {
        onNavigate(action.page as Page);
        close();
      } else if (action.type === 'search' && onOpenSearch) {
        onOpenSearch();
        close();
      } else if (action.type === 'question') {
        onNavigate('chat' as Page);
        close();
      } else {
        close();
      }
    },
    [onNavigate, onOpenSearch, close, setQuery]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!resultsRef.current) return;
    const items = resultsRef.current.querySelectorAll('.ua-result-item');
    const selected = items[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen && !closingRef.current) return null;

  const overlayClass = `unified-assistant-overlay${closingRef.current ? ' closing' : ''}`;
  const backdropClass = `unified-assistant-backdrop${closingRef.current ? ' closing' : ''}`;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={backdropClass}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Overlay */}
      <div
        className={overlayClass}
        role="dialog"
        aria-modal="true"
        aria-label="KI-Assistent"
        onKeyDown={handleKeyDown}
      >
        {/* Input Area */}
        <div className="ua-input-area">
          <svg
            className="ua-search-icon"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            className="ua-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Was moechtest du tun?"
            autoComplete="off"
            spellCheck={false}
          />

          {isLoading ? (
            <div className="ua-loading-indicator" aria-label="Verarbeitung..." />
          ) : (
            <span className="ua-shortcut-badge">
              <kbd>esc</kbd>
            </span>
          )}
        </div>

        {/* Results / Suggestions */}
        <div className="ua-results" ref={resultsRef}>
          {/* Section Label */}
          {results && results.actions.length > 0 && (
            <p className="ua-section-label">
              {INTENT_LABELS[results.intent] ?? 'Ergebnis'} ({results.actions.length})
            </p>
          )}

          {!results && query.trim().length < 2 && suggestions.length > 0 && (
            <p className="ua-section-label">Vorschlaege</p>
          )}

          {/* Items */}
          {displayItems.map((item, idx) => {
            const isAction = 'type' in item && !('category' in item);
            const label = isAction ? (item as AssistantAction).label : (item as ContextSuggestion).label;
            const description = isAction ? (item as AssistantAction).description : undefined;
            const icon = isAction ? (item as AssistantAction).icon : (item as ContextSuggestion).icon;
            const badge = isAction ? (item as AssistantAction).type : (item as ContextSuggestion).category;

            return (
              <button
                key={`${label}-${idx}`}
                className={`ua-result-item${idx === selectedIndex ? ' selected' : ''}`}
                onClick={() => handleItemSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                type="button"
              >
                <span className="ua-result-icon" aria-hidden="true">
                  {icon ?? '✨'}
                </span>
                <span className="ua-result-text">
                  <span className="ua-result-label">{label}</span>
                  {description && (
                    <span className="ua-result-description">{description}</span>
                  )}
                </span>
                <span className="ua-result-badge">{INTENT_LABELS[badge ?? ''] ?? badge}</span>
                <span className="ua-result-enter">
                  <kbd>Enter</kbd>
                </span>
              </button>
            );
          })}

          {/* Empty state when query typed but no results */}
          {query.trim().length >= 2 && !isLoading && results && results.actions.length === 0 && (
            <div className="ua-empty">
              <span className="ua-empty-icon">🔍</span>
              <span>Keine Ergebnisse gefunden</span>
              <span>Versuche eine andere Formulierung</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ua-footer">
          <div className="ua-footer-keys">
            <span className="ua-footer-key">
              <kbd>↑</kbd><kbd>↓</kbd> Navigieren
            </span>
            <span className="ua-footer-key">
              <kbd>↵</kbd> Auswahl
            </span>
            <span className="ua-footer-key">
              <kbd>esc</kbd> Schliessen
            </span>
          </div>
          <span>ZenAI Assistent</span>
        </div>
      </div>
    </>,
    document.body
  );
});

export default UnifiedAssistant;
