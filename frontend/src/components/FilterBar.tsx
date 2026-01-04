import { useState } from 'react';
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
    <div className="filter-bar">
      <div className="filter-header">
        <button
          className={`filter-toggle ${expanded ? 'expanded' : ''}`}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="filter-icon">🔽</span>
          Filter
          {activeCount > 0 && <span className="active-count">{activeCount}</span>}
        </button>

        {activeCount > 0 && (
          <button className="clear-filters" onClick={clearFilters}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      {expanded && (
        <div className="filter-content">
          {/* Type Filter */}
          <div className="filter-group">
            <label>Typ</label>
            <div className="filter-pills">
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`filter-pill ${filters.type === opt.value ? 'active' : ''}`}
                  onClick={() => toggleFilter('type', opt.value)}
                >
                  <span className="pill-icon">{opt.icon}</span>
                  {opt.label}
                  <span className="pill-count">{counts.types[opt.value] || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter */}
          <div className="filter-group">
            <label>Kategorie</label>
            <div className="filter-pills">
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`filter-pill ${filters.category === opt.value ? 'active' : ''}`}
                  style={{
                    '--pill-color': opt.color,
                  } as React.CSSProperties}
                  onClick={() => toggleFilter('category', opt.value)}
                >
                  {opt.label}
                  <span className="pill-count">{counts.categories[opt.value] || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Priority Filter */}
          <div className="filter-group">
            <label>Priorität</label>
            <div className="filter-pills">
              {priorityOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`filter-pill ${filters.priority === opt.value ? 'active' : ''}`}
                  style={{
                    '--pill-color': opt.color,
                  } as React.CSSProperties}
                  onClick={() => toggleFilter('priority', opt.value)}
                >
                  {opt.label}
                  <span className="pill-count">{counts.priorities[opt.value] || 0}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
