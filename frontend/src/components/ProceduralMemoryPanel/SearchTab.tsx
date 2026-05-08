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
      <p className="text-[0.85rem] opacity-60 m-0 mb-4">
        Hybrid Search kombiniert BM25 Full-Text mit semantischer Suche (Reciprocal Rank Fusion).
      </p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Suchbegriff eingeben..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch()}
          className="flex-1 py-2 px-3 rounded-md border border-white/15 bg-white/5 text-inherit text-sm"
        />
        <select
          value={searchMode}
          onChange={e => setSearchMode(e.target.value as 'hybrid' | 'bm25')}
          className="py-2 px-3 rounded-md border border-white/15 bg-white/5 text-inherit text-sm"
        >
          <option value="hybrid">Hybrid (BM25 + Semantic)</option>
          <option value="bm25">BM25 Only</option>
        </select>
        <button
          onClick={runSearch}
          disabled={searchLoading || !searchQuery.trim()}
          className="py-2 px-4 rounded-md border-0 bg-blue-500 text-white text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {searchLoading ? 'Suche...' : 'Suchen'}
        </button>
      </div>

      {searchResults.length > 0 && (
        <div>
          <div className="text-[0.8rem] opacity-50 mb-3">
            {searchResults.length} Ergebnis{searchResults.length !== 1 ? 'se' : ''}
            ({searchMode === 'hybrid' ? 'Hybrid RRF' : 'BM25'})
          </div>
          {searchResults.map((result, idx) => (
            <div
              key={result.id || idx}
              className="p-3 mb-2 rounded-lg border border-white/[0.08] bg-white/[0.03]"
            >
              <div className="flex justify-between mb-1.5">
                <span className="text-xs opacity-50 uppercase">
                  {result.source || result.type || 'memory'}
                </span>
                <span className="text-xs py-[0.1rem] px-[0.4rem] rounded bg-green-500/15 text-green-500">
                  Score: {result.score?.toFixed(3) || 'N/A'}
                </span>
              </div>
              <p className="m-0 text-[0.85rem] leading-normal">
                {result.content?.slice(0, 300)}
                {(result.content?.length || 0) > 300 ? '...' : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {!searchLoading && searchResults.length === 0 && searchQuery && (
        <div className="text-center p-8 opacity-40 text-sm">
          Enter drücken oder Suchen klicken
        </div>
      )}
    </div>
  );
}
