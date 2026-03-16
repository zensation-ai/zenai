/**
 * UniversalSearch — Enhanced search overlay for cross-feature search (Phase 95)
 *
 * Features:
 * - Unified search results grouped by type
 * - Type prefix shortcuts (@, #, $, !)
 * - Faceted filter sidebar
 * - Recent searches as chips
 * - Keyboard navigation (arrows, Enter, Escape)
 * - Debounced API calls (200ms)
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { SearchResultCard } from './SearchResultCard';
import type { SearchResultItem, SearchEntityType } from './SearchResultCard';
import { useUniversalSearch } from '../../hooks/useUniversalSearch';
import './UniversalSearch.css';

// ===========================================
// Types
// ===========================================

interface UniversalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  context: string;
  onNavigate?: (type: SearchEntityType, id: string) => void;
}

// ===========================================
// Constants
// ===========================================

const TYPE_PREFIXES = [
  { prefix: '@', label: 'Kontakte', type: 'contacts' as SearchEntityType },
  { prefix: '#', label: 'Gedanken', type: 'ideas' as SearchEntityType },
  { prefix: '$', label: 'Finanzen', type: 'transactions' as SearchEntityType },
  { prefix: '!', label: 'Aufgaben', type: 'tasks' as SearchEntityType },
];

const ALL_FILTER_TYPES: Array<{ type: SearchEntityType; label: string }> = [
  { type: 'ideas', label: 'Gedanken' },
  { type: 'emails', label: 'E-Mails' },
  { type: 'tasks', label: 'Aufgaben' },
  { type: 'contacts', label: 'Kontakte' },
  { type: 'documents', label: 'Dokumente' },
  { type: 'chat_messages', label: 'Chat' },
  { type: 'calendar_events', label: 'Termine' },
  { type: 'transactions', label: 'Finanzen' },
  { type: 'knowledge_entities', label: 'Wissen' },
];

// ===========================================
// Component
// ===========================================

export const UniversalSearch = memo(function UniversalSearch({
  isOpen,
  onClose,
  context,
  onNavigate,
}: UniversalSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [activeFilters, setActiveFilters] = useState<SearchEntityType[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    results,
    loading,
    recentSearches,
    clearHistory,
    facets,
  } = useUniversalSearch(context, activeFilters.length > 0 ? activeFilters : undefined);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveFilters([]);
      setSelectedIndex(-1);
    }
  }, [isOpen, setQuery]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < results.length) {
        e.preventDefault();
        handleResultClick(results[selectedIndex]);
      }
    },
    [results, selectedIndex, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const items = resultsRef.current.querySelectorAll('.us-result-card');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleResultClick = useCallback(
    (result: SearchResultItem) => {
      if (onNavigate) {
        onNavigate(result.type, result.id);
      }
      onClose();
    },
    [onNavigate, onClose]
  );

  const toggleFilter = useCallback((type: SearchEntityType) => {
    setActiveFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }, []);

  const handleRecentClick = useCallback(
    (q: string) => {
      setQuery(q);
      inputRef.current?.focus();
    },
    [setQuery]
  );

  if (!isOpen) return null;

  // Group results by type
  const groupedResults: Record<string, SearchResultItem[]> = {};
  for (const r of results) {
    if (!groupedResults[r.type]) groupedResults[r.type] = [];
    groupedResults[r.type].push(r);
  }

  return createPortal(
    <div className="us-overlay" onClick={onClose} role="dialog" aria-label="Suche">
      <div className="us-container" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Search Input */}
        <div className="us-input-area">
          <span className="us-input-icon">{'\u{1F50D}'}</span>
          <input
            ref={inputRef}
            className="us-input"
            type="text"
            placeholder="Suchen... (@Kontakt, #Gedanke, $Finanzen, !Aufgabe)"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(-1);
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="us-clear-btn" onClick={() => setQuery('')} aria-label="Suche leeren">
              {'\u{2715}'}
            </button>
          )}
          <kbd className="us-kbd">Esc</kbd>
        </div>

        {/* Type Prefix Hints */}
        {!query && (
          <div className="us-prefix-hints">
            {TYPE_PREFIXES.map(p => (
              <button
                key={p.prefix}
                className="us-prefix-chip"
                onClick={() => {
                  setQuery(p.prefix);
                  inputRef.current?.focus();
                }}
              >
                <span className="us-prefix-key">{p.prefix}</span>
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="us-body">
          {/* Filter Sidebar */}
          <div className="us-filters">
            <div className="us-filters-title">Typ-Filter</div>
            {ALL_FILTER_TYPES.map(ft => {
              const count = facets?.[ft.type] ?? 0;
              return (
                <label key={ft.type} className="us-filter-item">
                  <input
                    type="checkbox"
                    checked={activeFilters.includes(ft.type)}
                    onChange={() => toggleFilter(ft.type)}
                  />
                  <span className="us-filter-label">{ft.label}</span>
                  {count > 0 && <span className="us-filter-count">{count}</span>}
                </label>
              );
            })}
          </div>

          {/* Results Area */}
          <div className="us-results" ref={resultsRef} role="listbox">
            {/* Loading */}
            {loading && (
              <div className="us-loading">
                <div className="us-spinner" />
                Suche...
              </div>
            )}

            {/* Empty State - No query */}
            {!query && !loading && recentSearches.length > 0 && (
              <div className="us-recent">
                <div className="us-recent-header">
                  <span>Letzte Suchen</span>
                  <button className="us-recent-clear" onClick={clearHistory}>
                    Verlauf loeschen
                  </button>
                </div>
                <div className="us-recent-chips">
                  {recentSearches.map((s, i) => (
                    <button
                      key={`${s}-${i}`}
                      className="us-recent-chip"
                      onClick={() => handleRecentClick(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State - No results */}
            {query && !loading && results.length === 0 && (
              <div className="us-empty">
                Keine Ergebnisse fuer &ldquo;{query}&rdquo;
              </div>
            )}

            {/* Results */}
            {!loading && results.length > 0 && (
              <>
                <div className="us-results-count">
                  {results.length} Ergebnis{results.length !== 1 ? 'se' : ''}
                </div>
                {results.map((result, idx) => (
                  <SearchResultCard
                    key={`${result.type}-${result.id}`}
                    result={result}
                    query={query}
                    isSelected={idx === selectedIndex}
                    onClick={() => handleResultClick(result)}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});
