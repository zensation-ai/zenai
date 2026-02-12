/**
 * GlobalSearch - AI-powered cross-resource search overlay
 *
 * Calls POST /api/search/global and GET /api/search/quick
 * to search across Ideas, Documents, Voice Memos, Meetings,
 * AI Facts, and Chat History simultaneously.
 *
 * Integrates with CommandPalette-style overlay (portal rendering,
 * keyboard navigation, Escape to close).
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import type { AIContext } from './ContextSwitcher';
import { logError } from '../utils/errors';
import './GlobalSearch.css';

// ============================================
// Types
// ============================================

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  context: AIContext;
  onNavigate: (page: string) => void;
}

interface SearchResult {
  id: string;
  type: 'idea' | 'document' | 'voice_memo' | 'meeting' | 'ai_fact' | 'chat';
  title: string;
  snippet: string;
  relevance: number;
  created_at: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  total: number;
  query: string;
  searchTime?: number;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; page: string }> = {
  idea: { icon: '💡', label: 'Gedanke', page: 'ideas' },
  document: { icon: '📄', label: 'Dokument', page: 'documents' },
  voice_memo: { icon: '🎤', label: 'Sprachnotiz', page: 'documents' },
  meeting: { icon: '📋', label: 'Meeting', page: 'documents' },
  ai_fact: { icon: '🧠', label: 'KI-Wissen', page: 'my-ai' },
  chat: { icon: '💬', label: 'Chat', page: 'chat' },
};

// ============================================
// Component
// ============================================

const GlobalSearchComponent: React.FC<GlobalSearchProps> = ({
  isOpen,
  onClose,
  context,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setSearchTime(null);
      setTotal(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    return () => { abortRef.current?.abort(); };
  }, [isOpen]);

  // Debounced search
  const performSearch = useCallback(async (q: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();

    if (q.length < 2) {
      setResults([]);
      setTotal(0);
      setSearchTime(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      // Use quick search for short queries, global for longer ones
      const res = q.length <= 5
        ? await axios.get<SearchResponse>('/api/search/quick', {
            params: { q, context, limit: 20 },
            signal: controller.signal,
          })
        : await axios.post<SearchResponse>('/api/search/global', {
            query: q, contexts: [context], limit: 20, includeMemory: true,
          }, { signal: controller.signal });

      if (res.data?.success) {
        setResults(res.data.results || []);
        setTotal(res.data.total || 0);
        setSearchTime(res.data.searchTime ?? null);
        setSelectedIndex(0);
      }
    } catch (err) {
      if (!axios.isCancel(err)) {
        logError('GlobalSearch:search', err);
        setResults([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [context]);

  // Debounce input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, performSearch]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (results.length > 0) {
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (results.length > 0) {
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          const r = results[selectedIndex];
          const config = TYPE_CONFIG[r.type];
          if (config) onNavigate(config.page);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, selectedIndex, onNavigate, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('.gsearch-result');
    const item = items[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleResultClick = useCallback((result: SearchResult) => {
    const config = TYPE_CONFIG[result.type];
    if (config) onNavigate(config.page);
    onClose();
  }, [onNavigate, onClose]);

  const formatTime = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.floor(diff / 86400000);
    return `vor ${days} Tagen`;
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="gsearch-overlay" role="dialog" aria-modal="true" aria-label="Globale Suche">
      <div className="gsearch-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="gsearch-container" onKeyDown={handleKeyDown}>
        {/* Search Input */}
        <div className="gsearch-input-wrapper">
          <svg className="gsearch-input-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="gsearch-input"
            placeholder="Suche in Gedanken, Dokumenten, Chats, KI-Wissen..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="gsearch-status"
          />
          {loading && <span className="gsearch-spinner" aria-label="Suche läuft" />}
          <kbd className="gsearch-kbd">ESC</kbd>
        </div>

        {/* Screen reader status */}
        <div id="gsearch-status" className="sr-only" aria-live="polite" aria-atomic="true">
          {loading ? 'Suche läuft...' : results.length > 0
            ? `${total} Ergebnis${total !== 1 ? 'se' : ''} gefunden`
            : query.length >= 2 ? 'Keine Ergebnisse' : ''}
        </div>

        {/* Results */}
        <div className="gsearch-results" ref={listRef}>
          {query.length < 2 && (
            <div className="gsearch-hint">
              <span className="gsearch-hint-icon" aria-hidden="true">🔍</span>
              <p>Mindestens 2 Zeichen eingeben, um zu suchen.</p>
              <p className="gsearch-hint-sub">Durchsucht Gedanken, Dokumente, Meetings, Chats und KI-Wissen.</p>
            </div>
          )}

          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="gsearch-empty">
              <span aria-hidden="true">🤷</span>
              <p>Keine Ergebnisse für &quot;{query}&quot;</p>
            </div>
          )}

          {results.map((result, index) => {
            const config = TYPE_CONFIG[result.type] || { icon: '📎', label: result.type, page: 'home' };
            return (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                className={`gsearch-result ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleResultClick(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="gsearch-result-icon" aria-hidden="true">{config.icon}</span>
                <div className="gsearch-result-content">
                  <span className="gsearch-result-title">{result.title}</span>
                  {result.snippet && (
                    <span className="gsearch-result-snippet">{result.snippet}</span>
                  )}
                </div>
                <div className="gsearch-result-meta">
                  <span className="gsearch-result-type">{config.label}</span>
                  <span className="gsearch-result-time">{formatTime(result.created_at)}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="gsearch-footer">
            <span className="gsearch-footer-count">
              {total} Ergebnis{total !== 1 ? 'se' : ''}
              {searchTime != null && ` in ${searchTime}ms`}
            </span>
            <span className="gsearch-footer-nav">
              <kbd>↑↓</kbd> Navigieren <kbd>↵</kbd> Öffnen <kbd>ESC</kbd> Schließen
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export const GlobalSearch = memo(GlobalSearchComponent);
GlobalSearch.displayName = 'GlobalSearch';
export default GlobalSearch;
