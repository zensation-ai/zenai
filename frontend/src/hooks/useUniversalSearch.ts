/**
 * useUniversalSearch — Hook for Universal Cross-Feature Search (Phase 95)
 *
 * Manages search state, debounced API calls, and search history.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SearchResultItem, SearchEntityType } from '../components/UniversalSearch/SearchResultCard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

const DEBOUNCE_MS = 200;

interface UseUniversalSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResultItem[];
  loading: boolean;
  recentSearches: string[];
  clearHistory: () => void;
  facets: Record<SearchEntityType, number>;
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export function useUniversalSearch(
  context: string,
  activeTypes?: SearchEntityType[]
): UseUniversalSearchReturn {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [facets, setFacets] = useState<Record<SearchEntityType, number>>({} as Record<SearchEntityType, number>);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  // Load recent searches on mount
  useEffect(() => {
    fetchAPI<Array<{ query: string }>>(`/api/${context}/search/history?limit=10`)
      .then(data => {
        const unique = [...new Set((data ?? []).map(d => d.query))];
        setRecentSearches(unique.slice(0, 10));
      })
      .catch(() => {});
  }, [context]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setFacets({} as Record<SearchEntityType, number>);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      // Cancel previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body: Record<string, unknown> = {
          query: trimmed,
          limit: 30,
        };
        if (activeTypes && activeTypes.length > 0) {
          body.types = activeTypes;
        }

        const data = await fetchAPI<{
          results: SearchResultItem[];
          facets: Record<SearchEntityType, number>;
        }>(`/api/${context}/search/unified`, {
          method: 'POST',
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setResults(data.results ?? []);
          setFacets(data.facets ?? ({} as Record<SearchEntityType, number>));
          setLoading(false);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setResults([]);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, context, activeTypes]);

  const clearHistory = useCallback(() => {
    fetchAPI(`/api/${context}/search/history`, { method: 'DELETE' }).catch(() => {});
    setRecentSearches([]);
  }, [context]);

  return {
    query,
    setQuery,
    results,
    loading,
    recentSearches,
    clearHistory,
    facets,
  };
}
