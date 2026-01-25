import { useState, useRef, useEffect, useCallback } from 'react';
import '../neurodesign.css';
import './SearchBar.css';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching?: boolean;
}

export function SearchBar({ onSearch, onClear, isSearching: externalSearching }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [localSearching, setLocalSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSearching = externalSearching ?? localSearching;

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (resetSearchRef.current) {
        clearTimeout(resetSearchRef.current);
      }
    };
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounced search
    debounceRef.current = setTimeout(() => {
      if (value.trim()) {
        setLocalSearching(true);
        onSearch(value);
        // Reset local searching after a short delay if no external state
        if (externalSearching === undefined) {
          // Clear any existing reset timeout
          if (resetSearchRef.current) {
            clearTimeout(resetSearchRef.current);
          }
          resetSearchRef.current = setTimeout(() => setLocalSearching(false), 500);
        }
      } else {
        onClear();
      }
    }, 300);
  }, [onSearch, onClear, externalSearching]);

  const handleClear = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (resetSearchRef.current) {
      clearTimeout(resetSearchRef.current);
    }
    setQuery('');
    setLocalSearching(false);
    onClear();
  }, [onClear]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (query.trim()) {
      setLocalSearching(true);
      onSearch(query);
    }
  }, [query, onSearch]);

  return (
    <form className="search-bar liquid-glass-input" onSubmit={handleSubmit} role="search">
      <span className="search-icon" aria-hidden="true">🔍</span>
      <input
        type="search"
        className="search-input neuro-placeholder-animated"
        placeholder="Semantische Suche... (z.B. 'Ideen für Automatisierung')"
        value={query}
        onChange={handleChange}
        aria-label="Semantische Suche"
      />
      {isSearching && <span className="search-spinner" aria-label="Suche läuft">⏳</span>}
      {query && !isSearching && (
        <button
          type="button"
          className="search-clear neuro-press-effect neuro-focus-ring"
          onClick={handleClear}
          aria-label="Suche löschen"
        >
          ✕
        </button>
      )}
    </form>
  );
}
