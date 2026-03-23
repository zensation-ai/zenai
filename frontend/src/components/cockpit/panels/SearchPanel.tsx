import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Lightbulb, Mail, User, FileText, Calendar,
  Brain, MessageSquare, DollarSign, Loader2, RotateCw,
} from 'lucide-react';
import type { PanelProps } from '../panelRegistry';
import { usePanelContext } from '../../../contexts/PanelContext';
import type { PanelType } from '../../../contexts/PanelContext';

// ── Type mappings ───────────────────────────────────────────────────────

const TYPE_TO_PANEL: Record<string, PanelType> = {
  idea: 'ideas',
  email: 'email',
  contact: 'contacts',
  document: 'documents',
  calendar_event: 'calendar',
  fact: 'memory',
  chat: 'ideas',
  transaction: 'finance',
};

const TYPE_TO_ICON: Record<string, typeof Lightbulb> = {
  idea: Lightbulb,
  email: Mail,
  contact: User,
  document: FileText,
  calendar_event: Calendar,
  fact: Brain,
  chat: MessageSquare,
  transaction: DollarSign,
};

const TYPE_LABELS: Record<string, string> = {
  idea: 'Ideen',
  email: 'Emails',
  contact: 'Kontakte',
  document: 'Dokumente',
  calendar_event: 'Kalender',
  fact: 'Gedaechtnis',
  chat: 'Chats',
  transaction: 'Finanzen',
};

// ── Types ───────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  type: string;
  title: string;
  snippet?: string;
  score?: number;
  context?: string;
}

// ── Storage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = 'zenai-recent-searches';
const MAX_RECENT = 5;

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): void {
  try {
    const existing = loadRecentSearches();
    const filtered = existing.filter(s => s !== query);
    const updated = [query, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* quota exceeded */ }
}

// ── Component ───────────────────────────────────────────────────────────

export default function SearchPanel({ context }: PanelProps) {
  const { dispatch } = usePanelContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Flat list of visible results for keyboard navigation
  const flatResults = useMemo(() => {
    const grouped = groupByType(results);
    const flat: SearchResult[] = [];
    for (const [type, items] of grouped) {
      const limit = expandedTypes.has(type) ? items.length : Math.min(5, items.length);
      flat.push(...items.slice(0, limit));
    }
    return flat;
  }, [results, expandedTypes]);

  // ── Search execution ──────────────────────────────────────────────────

  const executeSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) return;

    setLoading(true);
    setError(false);

    try {
      const res = await axios.post('/api/search/global', {
        query: q.trim(),
        contexts: [context],
        limit: 30,
      });

      const data = res.data?.data ?? [];
      setResults(data);
      setSearched(true);
      setActiveIndex(-1);
      saveRecentSearch(q.trim());
    } catch {
      setError(true);
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [context]);

  // ── Debounced input handler ───────────────────────────────────────────

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(-1);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setError(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      executeSearch(value);
    }, 300);
  }, [executeSearch]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // ── Result click handler ──────────────────────────────────────────────

  const openResult = useCallback((result: SearchResult) => {
    const panel = TYPE_TO_PANEL[result.type] ?? 'ideas';
    dispatch({ type: 'OPEN_PANEL', panel, filter: result.title });
  }, [dispatch]);

  // ── Keyboard navigation ───────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev <= 0 ? flatResults.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < flatResults.length) {
      e.preventDefault();
      openResult(flatResults[activeIndex]);
    }
  }, [flatResults, activeIndex, openResult]);

  // ── Recent search chip click ──────────────────────────────────────────

  const handleRecentClick = useCallback((term: string) => {
    setQuery(term);
    executeSearch(term);
  }, [executeSearch]);

  // ── Render ────────────────────────────────────────────────────────────

  const recentSearches = loadRecentSearches();
  const grouped = groupByType(results);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Suche..."
          autoFocus
          value={query}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '8px 12px',
            paddingRight: loading ? 36 : 12,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: '#e5e5e5',
            fontSize: 14,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {loading && (
          <span
            role="status"
            aria-label="Suche..."
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
            }}
          >
            <Loader2
              size={16}
              style={{
                color: 'rgba(255,255,255,0.4)',
                animation: 'spin 1s linear infinite',
              }}
            />
          </span>
        )}
      </div>

      {/* Empty input: show recent searches + suggestions */}
      {!query && !searched && (
        <div>
          {recentSearches.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {recentSearches.map(term => (
                <button
                  key={term}
                  onClick={() => handleRecentClick(term)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                  }}
                >
                  {term}
                </button>
              ))}
            </div>
          )}
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, margin: 0 }}>
            Versuche: offene Tasks, ungelesene Mails, letzte Ideen
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 8px' }}>
            Suche fehlgeschlagen
          </p>
          <button
            onClick={() => executeSearch(query)}
            aria-label="Erneut versuchen"
            style={{
              padding: '6px 14px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <RotateCw size={12} />
            Erneut versuchen
          </button>
        </div>
      )}

      {/* No results */}
      {searched && !error && !loading && results.length === 0 && query.trim().length >= 2 && (
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', margin: '16px 0' }}>
          Keine Ergebnisse fuer &ldquo;{query}&rdquo;
        </p>
      )}

      {/* Results grouped by type */}
      {grouped.map(([type, items]) => {
        const Icon = TYPE_TO_ICON[type] ?? FileText;
        const label = TYPE_LABELS[type] ?? type;
        const expanded = expandedTypes.has(type);
        const visibleItems = expanded ? items : items.slice(0, 5);
        const hasMore = items.length > 5 && !expanded;

        return (
          <div key={type} style={{ marginBottom: 4 }}>
            {/* Group header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 0',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <Icon size={12} />
              {label}
              <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>
                ({items.length})
              </span>
            </div>

            {/* Result items */}
            {visibleItems.map(item => {
              const flatIndex = flatResults.indexOf(item);
              const isActive = flatIndex === activeIndex;

              return (
                <button
                  key={item.id}
                  onClick={() => openResult(item)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={() => setActiveIndex(flatIndex)}
                >
                  <div style={{ color: '#e5e5e5', fontSize: 13, fontWeight: 500 }}>
                    {item.title}
                  </div>
                  {item.snippet && (
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: 11,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.snippet}
                    </div>
                  )}
                </button>
              );
            })}

            {/* "Mehr anzeigen" */}
            {hasMore && (
              <button
                onClick={() =>
                  setExpandedTypes(prev => {
                    const next = new Set(prev);
                    next.add(type);
                    return next;
                  })
                }
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '4px 10px',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.4)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Mehr anzeigen ({items.length - 5} weitere)
              </button>
            )}
          </div>
        );
      })}

      {/* Spinner keyframe (inline, only rendered once) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function groupByType(results: SearchResult[]): [string, SearchResult[]][] {
  const map = new Map<string, SearchResult[]>();
  for (const r of results) {
    const existing = map.get(r.type);
    if (existing) {
      existing.push(r);
    } else {
      map.set(r.type, [r]);
    }
  }
  return Array.from(map.entries());
}
