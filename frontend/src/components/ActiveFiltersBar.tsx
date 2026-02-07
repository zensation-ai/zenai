/**
 * ActiveFiltersBar - Zeigt aktive Filter als Chips (Linear-Style)
 *
 * 2026 Best Practice: Sichtbares Filter-Feedback
 * - One-Click Removal (UX-optimiert)
 * - Clear visual hierarchy
 * - Mobile-friendly
 */

import { memo } from 'react';
import './ActiveFiltersBar.css';

interface ActiveFiltersBarProps {
  filters: {
    types: Set<string>;
    categories: Set<string>;
    priorities: Set<string>;
  };
  onRemoveFilter: (key: 'types' | 'categories' | 'priorities', value: string) => void;
  onClearAll: () => void;
}

const LABELS = {
  types: {
    idea: '💡 Ideen',
    task: '✅ Aufgaben',
    insight: '🔍 Erkenntnisse',
    problem: '⚠️ Probleme',
    question: '❓ Fragen'
  },
  categories: {
    business: 'Business',
    technical: 'Technik',
    personal: 'Persönlich',
    learning: 'Lernen'
  },
  priorities: {
    high: '🔴 Hoch',
    medium: '🟡 Mittel',
    low: '🟢 Niedrig'
  },
};

export const ActiveFiltersBar = memo(function ActiveFiltersBar({ filters, onRemoveFilter, onClearAll }: ActiveFiltersBarProps) {
  const totalActive = filters.types.size + filters.categories.size + filters.priorities.size;

  if (totalActive === 0) return null;

  return (
    <div className="active-filters-bar" role="region" aria-label="Aktive Filter">
      <div className="active-filters-list">
        {Array.from(filters.types).map(type => (
          <button
            key={type}
            type="button"
            className="filter-chip neuro-hover-lift neuro-press-effect"
            onClick={() => onRemoveFilter('types', type)}
            aria-label={`Filter entfernen: ${LABELS.types[type as keyof typeof LABELS.types]}`}
          >
            <span className="chip-label">{LABELS.types[type as keyof typeof LABELS.types]}</span>
            <span className="chip-remove" aria-hidden="true">×</span>
          </button>
        ))}
        {Array.from(filters.categories).map(category => (
          <button
            key={category}
            type="button"
            className="filter-chip filter-chip-category neuro-hover-lift neuro-press-effect"
            onClick={() => onRemoveFilter('categories', category)}
            aria-label={`Filter entfernen: ${LABELS.categories[category as keyof typeof LABELS.categories]}`}
          >
            <span className="chip-label">{LABELS.categories[category as keyof typeof LABELS.categories]}</span>
            <span className="chip-remove" aria-hidden="true">×</span>
          </button>
        ))}
        {Array.from(filters.priorities).map(priority => (
          <button
            key={priority}
            type="button"
            className="filter-chip filter-chip-priority neuro-hover-lift neuro-press-effect"
            onClick={() => onRemoveFilter('priorities', priority)}
            aria-label={`Filter entfernen: ${LABELS.priorities[priority as keyof typeof LABELS.priorities]}`}
          >
            <span className="chip-label">{LABELS.priorities[priority as keyof typeof LABELS.priorities]}</span>
            <span className="chip-remove" aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="clear-all-button neuro-hover-lift neuro-press-effect neuro-focus-ring"
        onClick={onClearAll}
        aria-label={`Alle ${totalActive} Filter löschen`}
      >
        Alle {totalActive} Filter löschen
      </button>
    </div>
  );
});
