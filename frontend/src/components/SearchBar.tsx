import { useState, useCallback } from 'react';
import './SearchBar.css';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
}

export function SearchBar({ onSearch, onClear }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Debounce search
  const debounce = <T extends (...args: any[]) => void>(fn: T, delay: number) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  };

  const debouncedSearch = useCallback(
    debounce((q: string) => {
      if (q.trim()) {
        setIsSearching(true);
        onSearch(q);
        setTimeout(() => setIsSearching(false), 500);
      } else {
        onClear();
      }
    }, 300),
    [onSearch, onClear]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  const handleClear = () => {
    setQuery('');
    onClear();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <span className="search-icon">🔍</span>
      <input
        type="text"
        className="search-input"
        placeholder="Semantische Suche... (z.B. 'Ideen für Automatisierung')"
        value={query}
        onChange={handleChange}
      />
      {isSearching && <span className="search-spinner">⏳</span>}
      {query && !isSearching && (
        <button type="button" className="search-clear" onClick={handleClear}>
          ✕
        </button>
      )}
    </form>
  );
}
