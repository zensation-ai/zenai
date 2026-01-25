import { useState } from 'react';
import '../neurodesign.css';
import './FilterBar.css';

export interface Filters {
  type: string | null;
  category: string | null;
  priority: string | null;
}

interface FilterBarProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  counts: {
    types: Record<string, number>;
    categories: Record<string, number>;
    priorities: Record<string, number>;
  };
}

const typeOptions = [
  { value: 'idea', label: 'Ideen', icon: '💡' },
  { value: 'task', label: 'Aufgaben', icon: '✅' },
  { value: 'insight', label: 'Erkenntnisse', icon: '🔍' },
  { value: 'problem', label: 'Probleme', icon: '⚠️' },
  { value: 'question', label: 'Fragen', icon: '❓' },
];

const categoryOptions = [
  { value: 'business', label: 'Business', color: '#22c55e' },
  { value: 'technical', label: 'Technik', color: '#3b82f6' },
  { value: 'personal', label: 'Persönlich', color: '#a855f7' },
  { value: 'learning', label: 'Lernen', color: '#f59e0b' },
];

const priorityOptions = [
  { value: 'high', label: 'Hoch', color: '#ef4444' },
  { value: 'medium', label: 'Mittel', color: '#f59e0b' },
  { value: 'low', label: 'Niedrig', color: '#64748b' },
];

export function FilterBar({ filters, onFilterChange, counts }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  const activeCount = [filters.type, filters.category, filters.priority].filter(Boolean).length;

  const clearFilters = () => {
    onFilterChange({ type: null, category: null, priority: null });
  };

  const toggleFilter = (key: keyof Filters, value: string) => {
    onFilterChange({
      ...filters,
      [key]: filters[key] === value ? null : value,
    });
  };

  return (
    <div className="filter-bar liquid-glass" role="region" aria-label="Filteroptionen">
      <div className="filter-header">
        <button
          type="button"
          className={`filter-toggle neuro-press-effect neuro-focus-ring neuro-hover-lift ${expanded ? 'expanded' : ''}`}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded ? 'true' : 'false'}
          aria-controls="filter-content"
          aria-label={`Filter ${expanded ? 'einklappen' : 'ausklappen'}${activeCount > 0 ? `, ${activeCount} aktiv` : ''}`}
        >
          <span className="filter-icon" aria-hidden="true">🔽</span>
          Filter
          {activeCount > 0 && <span className="active-count" aria-hidden="true">{activeCount}</span>}
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            className="clear-filters neuro-press-effect neuro-focus-ring neuro-hover-lift"
            onClick={clearFilters}
            aria-label="Alle Filter zurücksetzen"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {expanded && (
        <div id="filter-content" className="filter-content neuro-expand-in">
          {/* Type Filter */}
          <div className="filter-group" role="group" aria-labelledby="filter-type-label">
            <label id="filter-type-label">Typ</label>
            <div className="filter-pills">
              {typeOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={`filter-pill neuro-press-effect neuro-focus-ring ${filters.type === opt.value ? 'active' : ''}`}
                  onClick={() => toggleFilter('type', opt.value)}
                  aria-pressed={filters.type === opt.value}
                  aria-label={`${opt.label} (${counts.types[opt.value] || 0})`}
                >
                  <span className="pill-icon" aria-hidden="true">{opt.icon}</span>
                  {opt.label}
                  <span className="pill-count" aria-hidden="true">{counts.types[opt.value] || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter */}
          <div className="filter-group" role="group" aria-labelledby="filter-category-label">
            <label id="filter-category-label">Kategorie</label>
            <div className="filter-pills">
              {categoryOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={`filter-pill neuro-press-effect neuro-focus-ring ${filters.category === opt.value ? 'active' : ''}`}
                  style={{
                    '--pill-color': opt.color,
                  } as React.CSSProperties}
                  onClick={() => toggleFilter('category', opt.value)}
                  aria-pressed={filters.category === opt.value}
                  aria-label={`${opt.label} (${counts.categories[opt.value] || 0})`}
                >
                  {opt.label}
                  <span className="pill-count" aria-hidden="true">{counts.categories[opt.value] || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Priority Filter */}
          <div className="filter-group" role="group" aria-labelledby="filter-priority-label">
            <label id="filter-priority-label">Priorität</label>
            <div className="filter-pills">
              {priorityOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={`filter-pill neuro-press-effect neuro-focus-ring ${filters.priority === opt.value ? 'active' : ''}`}
                  style={{
                    '--pill-color': opt.color,
                  } as React.CSSProperties}
                  onClick={() => toggleFilter('priority', opt.value)}
                  aria-pressed={filters.priority === opt.value}
                  aria-label={`${opt.label} (${counts.priorities[opt.value] || 0})`}
                >
                  {opt.label}
                  <span className="pill-count" aria-hidden="true">{counts.priorities[opt.value] || 0}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
