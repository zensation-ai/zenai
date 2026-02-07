/**
 * QuickStats - Kompakte Statistik-Anzeige mit integrierter Suche
 *
 * Neuro-UX Prinzipien:
 * - Miller's Law: Max 7 Items sichtbar
 * - Progressive Disclosure: Details bei Hover
 * - Cognitive Chunking: Visuelle Gruppierung
 */

import { useMemo, memo } from 'react';
import '../neurodesign.css';
import './QuickStats.css';

interface Idea {
  type: string;
  category: string;
  priority: string;
}

interface QuickStatsProps {
  ideas: Idea[];
  onFilterClick?: (filterType: 'type' | 'category' | 'priority', value: string) => void;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  task: { icon: '✅', label: 'Aufgaben', color: '#22c55e' },
  idea: { icon: '💡', label: 'Ideen', color: '#f59e0b' },
  problem: { icon: '⚠️', label: 'Probleme', color: '#ef4444' },
  insight: { icon: '🔍', label: 'Erkenntnisse', color: '#3b82f6' },
  question: { icon: '❓', label: 'Fragen', color: '#8b5cf6' },
};

const PRIORITY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  high: { icon: '🔴', label: 'Hoch', color: '#ef4444' },
  medium: { icon: '🟡', label: 'Mittel', color: '#f59e0b' },
  low: { icon: '🟢', label: 'Niedrig', color: '#22c55e' },
};

export const QuickStats = memo(function QuickStats({ ideas, onFilterClick }: QuickStatsProps) {
  const stats = useMemo(() => {
    const types: Record<string, number> = {};
    const priorities: Record<string, number> = {};
    const categories: Record<string, number> = {};

    ideas.forEach((idea) => {
      types[idea.type] = (types[idea.type] || 0) + 1;
      priorities[idea.priority] = (priorities[idea.priority] || 0) + 1;
      categories[idea.category] = (categories[idea.category] || 0) + 1;
    });

    return { types, priorities, categories, total: ideas.length };
  }, [ideas]);

  if (ideas.length === 0) return null;

  // Sortiere nach Anzahl (absteigend)
  const sortedTypes = Object.entries(stats.types)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5); // Max 5 Typen anzeigen

  const sortedPriorities = Object.entries(stats.priorities)
    .filter(([key]) => PRIORITY_CONFIG[key])
    .sort(([a], [b]) => {
      const order = ['high', 'medium', 'low'];
      return order.indexOf(a) - order.indexOf(b);
    });

  const handleClick = (filterType: 'type' | 'category' | 'priority', value: string) => {
    if (onFilterClick) {
      onFilterClick(filterType, value);
    }
  };

  return (
    <div className="quick-stats" role="region" aria-label="Statistik-Übersicht">
      {/* Typ-Statistiken */}
      <div className="quick-stats-section quick-stats-types">
        <span className="quick-stats-label">NACH TYP</span>
        <div className="quick-stats-items">
          {sortedTypes.map(([type, count]) => {
            const config = TYPE_CONFIG[type];
            if (!config) return null;
            return (
              <button
                key={type}
                type="button"
                className="quick-stat-pill neuro-press-effect neuro-focus-ring"
                onClick={() => handleClick('type', type)}
                style={{ '--pill-accent': config.color } as React.CSSProperties}
                aria-label={`Nach ${config.label} filtern, ${count} vorhanden`}
              >
                <span className="quick-stat-icon" aria-hidden="true">{config.icon}</span>
                <span className="quick-stat-name">{config.label}:</span>
                <span className="quick-stat-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Prioritäts-Statistiken */}
      <div className="quick-stats-section quick-stats-priority">
        <span className="quick-stats-label">NACH PRIORITÄT</span>
        <div className="quick-stats-items">
          {sortedPriorities.map(([priority, count]) => {
            const config = PRIORITY_CONFIG[priority];
            if (!config || count === 0) return null;
            return (
              <button
                key={priority}
                type="button"
                className="quick-stat-pill priority-pill neuro-press-effect neuro-focus-ring"
                onClick={() => handleClick('priority', priority)}
                style={{ '--pill-accent': config.color } as React.CSSProperties}
                aria-label={`Nach Priorität ${config.label} filtern, ${count} vorhanden`}
              >
                <span className="quick-stat-icon" aria-hidden="true">{config.icon}</span>
                <span className="quick-stat-name">{config.label}:</span>
                <span className="quick-stat-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Kategorie-Indikator (kompakt) */}
      {Object.keys(stats.categories).length > 0 && (
        <div className="quick-stats-section quick-stats-categories">
          <span className="quick-stats-label">NACH KATEGORIE</span>
          <div className="quick-stats-items">
            {Object.entries(stats.categories)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 4)
              .map(([category, count]) => (
                <button
                  key={category}
                  type="button"
                  className="quick-stat-pill category-pill neuro-press-effect neuro-focus-ring"
                  onClick={() => handleClick('category', category)}
                  data-category={category}
                  aria-label={`Nach Kategorie ${category} filtern, ${count} vorhanden`}
                >
                  <span className="quick-stat-name">{category}:</span>
                  <span className="quick-stat-count">{count}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
});
