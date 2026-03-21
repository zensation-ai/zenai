/**
 * SearchTab — Hybrid BM25 + semantic search via RRF.
 *
 * Extracted from ProceduralMemoryPanel.tsx (Phase 121).
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import type { SearchResult } from './types';

interface SearchTabProps {
  context: string;
  onError: (msg: string) => void;
}

export function SearchTab({ context, onError }: SearchTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'hybrid' | 'bm25'>('hybrid');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const endpoint = searchMode === 'hybrid'
        ? `/api/${context}/memory/hybrid-search`
        : `/api/${context}/memory/bm25`;
      const res = await axios.get(endpoint, {
        params: { q: searchQuery, limit: 10 },
      });
      setSearchResults(res.data.data || res.data.results || []);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Fehler bei der Suche');
    } finally {
      setSearchLoading(false);
    }
  }, [context, searchQuery, searchMode, onError]);

  return (
    <div>
      <p style={{ fontSize: '0.85rem', opacity: 0.6, margin: '0 0 1rem' }}>
        Hybrid Search kombiniert BM25 Full-Text mit semantischer Suche (Reciprocal Rank Fusion).
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Suchbegriff eingeben..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch()}
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)',
            color: 'inherit',
            fontSize: '0.875rem',
          }}
        />
        <select
          value={searchMode}
          onChange={e => setSearchMode(e.target.value as 'hybrid' | 'bm25')}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)',
            color: 'inherit',
            fontSize: '0.875rem',
          }}
        >
          <option value="hybrid">Hybrid (BM25 + Semantic)</option>
          <option value="bm25">BM25 Only</option>
        </select>
        <button
          onClick={runSearch}
          disabled={searchLoading || !searchQuery.trim()}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            cursor: searchLoading ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            opacity: searchLoading || !searchQuery.trim() ? 0.5 : 1,
          }}
        >
          {searchLoading ? 'Suche...' : 'Suchen'}
        </button>
      </div>

      {searchResults.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '0.75rem' }}>
            {searchResults.length} Ergebnis{searchResults.length !== 1 ? 'se' : ''}
            ({searchMode === 'hybrid' ? 'Hybrid RRF' : 'BM25'})
          </div>
          {searchResults.map((result, idx) => (
            <div
              key={result.id || idx}
              style={{
                padding: '0.75rem',
                marginBottom: '0.5rem',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase' }}>
                  {result.source || result.type || 'memory'}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '4px',
                  background: 'rgba(34,197,94,0.15)',
                  color: '#22c55e',
                }}>
                  Score: {result.score?.toFixed(3) || 'N/A'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
                {result.content?.slice(0, 300)}
                {(result.content?.length || 0) > 300 ? '...' : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {!searchLoading && searchResults.length === 0 && searchQuery && (
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.4, fontSize: '0.875rem' }}>
          Enter druecken oder Suchen klicken
        </div>
      )}
    </div>
  );
}
