/**
 * SearchFilterBar - Integrierte Suche und Filter-Leiste
 *
 * Kombiniert Suche und Filter in einem kompakten Control-Center.
 * Neuro-UX optimiert für schnelle Interaktion.
 */

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import '../neurodesign.css';
import './SearchFilterBar.css';

// Multi-Select Filter Interface (2026 Best Practice)
export interface AdvancedFilters {
  types: Set<string>;
  categories: Set<string>;
  priorities: Set<string>;
}

// Backwards Compatibility Alias
export type Filters = AdvancedFilters;

interface SearchFilterBarProps {
  filters: AdvancedFilters;
  onFilterChange: (filters: Filters) => void;
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  isSearching?: boolean;
  searchResults?: number | null;
  counts: {
    types: Record<string, number>;
    categories: Record<string, number>;
    priorities: Record<string, number>;
  };
}

const TYPE_OPTIONS = [
  { value: 'idea', label: 'Ideen', icon: '💡' },
  { value: 'task', label: 'Aufgaben', icon: '✅' },
  { value: 'insight', label: 'Erkenntnisse', icon: '🔍' },
  { value: 'problem', label: 'Probleme', icon: '⚠️' },
  { value: 'question', label: 'Fragen', icon: '❓' },
];

const CATEGORY_OPTIONS = [
  { value: 'business', label: 'Business', color: '#22c55e' },
  { value: 'technical', label: 'Technik', color: '#3b82f6' },
  { value: 'personal', label: 'Persönlich', color: '#a855f7' },
  { value: 'learning', label: 'Lernen', color: '#f59e0b' },
];

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'Hoch', icon: '🔴' },
  { value: 'medium', label: 'Mittel', icon: '🟡' },
  { value: 'low', label: 'Niedrig', icon: '🟢' },
];

export const SearchFilterBar = memo(function SearchFilterBar({
  filters,
  onFilterChange,
  onSearch,
  onClearSearch,
  isSearching = false,
  searchResults = null,
  counts,
}: SearchFilterBarProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Berechne aktive Filter (Multi-Select)
  const activeFilterCount = useMemo(() => {
    return filters.types.size + filters.categories.size + filters.priorities.size;
  }, [filters]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        if (value.trim()) {
          onSearch(value);
        } else {
          onClearSearch();
        }
      }, 300);
    },
    [onSearch, onClearSearch]
  );

  const handleClearSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setQuery('');
    onClearSearch();
  }, [onClearSearch]);

  const toggleFilter = useCallback(
    (key: keyof AdvancedFilters, value: string) => {
      const currentSet = new Set(filters[key]);

      if (currentSet.has(value)) {
        currentSet.delete(value);
      } else {
        currentSet.add(value);
      }

      onFilterChange({
        ...filters,
        [key]: currentSet,
      });
    },
    [filters, onFilterChange]
  );

  const clearAllFilters = useCallback(() => {
    onFilterChange({
      types: new Set(),
      categories: new Set(),
      priorities: new Set()
    });
  }, [onFilterChange]);

  return (
    <div className="search-filter-bar" role="search" aria-label="Suche und Filter">
      {/* Hauptzeile: Suche + Filter-Toggle */}
      <div className="sfb-main-row">
        {/* Suchfeld */}
        <div className="sfb-search-wrapper">
          <span className="sfb-search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            className="sfb-search-input"
            placeholder="Semantische Suche... (z.B. 'Ideen für Automatisierung')"
            value={query}
            onChange={handleSearchChange}
            aria-label="Semantische Suche"
          />
          {isSearching && (
            <span className="sfb-search-spinner" aria-label="Suche läuft">
              <span className="spinner-dot"></span>
              <span className="spinner-dot"></span>
              <span className="spinner-dot"></span>
            </span>
          )}
          {query && !isSearching && (
            <button
              type="button"
              className="sfb-search-clear neuro-press-effect neuro-focus-ring"
              onClick={handleClearSearch}
              aria-label="Suche löschen"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter-Toggle */}
        <button
          type="button"
          className={`sfb-filter-toggle neuro-press-effect neuro-focus-ring ${showFilters ? 'active' : ''} ${
            activeFilterCount > 0 ? 'has-filters' : ''
          }`}
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-controls="sfb-filter-panel"
          aria-label={`Filter ${showFilters ? 'ausblenden' : 'anzeigen'}${activeFilterCount > 0 ? `, ${activeFilterCount} aktiv` : ''}`}
        >
          <span className="sfb-filter-icon" aria-hidden="true">⚙️</span>
          <span className="sfb-filter-label">Filter</span>
          {activeFilterCount > 0 && (
            <span className="sfb-filter-badge" aria-label={`${activeFilterCount} aktive Filter`}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Suchergebnis-Info */}
      {searchResults !== null && (
        <div className="sfb-search-info" role="status" aria-live="polite">
          <span className="sfb-result-count">
            {searchResults} {searchResults === 1 ? 'Ergebnis' : 'Ergebnisse'} gefunden
          </span>
          <button
            type="button"
            className="sfb-clear-search neuro-press-effect neuro-focus-ring"
            onClick={handleClearSearch}
            aria-label="Suchergebnisse zurücksetzen"
          >
            × Suche zurücksetzen
          </button>
        </div>
      )}

      {/* Filter-Panel */}
      {showFilters && (
        <div id="sfb-filter-panel" className="sfb-filter-panel">
          {/* Typ-Filter */}
          <div className="sfb-filter-group">
            <label className="sfb-filter-group-label">Typ</label>
            <div className="sfb-filter-pills">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`sfb-pill neuro-press-effect neuro-focus-ring ${
                    filters.types.has(opt.value) ? 'active' : ''
                  }`}
                  onClick={() => toggleFilter('types', opt.value)}
                  aria-pressed={filters.types.has(opt.value)}
                  aria-label={`${opt.label} filtern${counts.types[opt.value] > 0 ? `, ${counts.types[opt.value]} vorhanden` : ''}`}
                >
                  <span className="sfb-pill-icon" aria-hidden="true">{opt.icon}</span>
                  <span className="sfb-pill-label">{opt.label}</span>
                  {counts.types[opt.value] > 0 && (
                    <span className="sfb-pill-count">{counts.types[opt.value]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Priorität-Filter */}
          <div className="sfb-filter-group">
            <label className="sfb-filter-group-label">Priorität</label>
            <div className="sfb-filter-pills">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`sfb-pill sfb-pill-priority neuro-press-effect neuro-focus-ring ${
                    filters.priorities.has(opt.value) ? 'active' : ''
                  }`}
                  onClick={() => toggleFilter('priorities', opt.value)}
                  aria-pressed={filters.priorities.has(opt.value)}
                  aria-label={`Priorität ${opt.label} filtern`}
                  data-priority={opt.value}
                >
                  <span className="sfb-pill-icon" aria-hidden="true">{opt.icon}</span>
                  <span className="sfb-pill-label">{opt.label}</span>
                  {counts.priorities[opt.value] > 0 && (
                    <span className="sfb-pill-count">{counts.priorities[opt.value]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Kategorie-Filter */}
          <div className="sfb-filter-group">
            <label className="sfb-filter-group-label">Kategorie</label>
            <div className="sfb-filter-pills">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`sfb-pill sfb-pill-category neuro-press-effect neuro-focus-ring ${
                    filters.categories.has(opt.value) ? 'active' : ''
                  }`}
                  onClick={() => toggleFilter('categories', opt.value)}
                  aria-pressed={filters.categories.has(opt.value)}
                  aria-label={`Kategorie ${opt.label} filtern`}
                  style={{ '--category-color': opt.color } as React.CSSProperties}
                  data-category={opt.value}
                >
                  <span className="sfb-pill-label">{opt.label}</span>
                  {counts.categories[opt.value] > 0 && (
                    <span className="sfb-pill-count">{counts.categories[opt.value]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Filter zurücksetzen */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="sfb-clear-all neuro-press-effect neuro-focus-ring"
              onClick={clearAllFilters}
              aria-label="Alle Filter zurücksetzen"
            >
              Alle Filter zurücksetzen
            </button>
          )}
        </div>
      )}
    </div>
  );
});
