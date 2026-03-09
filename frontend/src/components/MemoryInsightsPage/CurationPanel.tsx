/**
 * Phase 53: Curation Panel Component
 *
 * Displays curation suggestions with action buttons
 * for archiving, promoting, merging, and deleting memories.
 */

import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

interface CurationSuggestion {
  id: string;
  memoryId: string;
  content: string;
  layer: string;
  suggestion: 'archive' | 'promote' | 'merge' | 'delete';
  reason: string;
  priority: number;
}

interface CurationPanelProps {
  context: string;
}

const SUGGESTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  archive: { label: 'Archivieren', icon: 'archive', color: '#8b5cf6' },
  promote: { label: 'Befoerdern', icon: 'upgrade', color: '#22c55e' },
  merge: { label: 'Zusammenfuehren', icon: 'merge_type', color: '#3b82f6' },
  delete: { label: 'Loeschen', icon: 'delete_outline', color: '#ef4444' },
};

const LAYER_LABELS: Record<string, string> = {
  working: 'Working Memory',
  episodic: 'Episodic Memory',
  short_term: 'Short-Term Memory',
  long_term: 'Long-Term Memory',
};

export function CurationPanel({ context }: CurationPanelProps) {
  const [suggestions, setSuggestions] = useState<CurationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/${context}/memory/insights/curation`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.success) setSuggestions(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.id));

  if (loading) return <div className="memory-insights-loading">Kurations-Vorschlaege werden generiert...</div>;

  if (visibleSuggestions.length === 0) {
    return <div className="memory-insights-empty">Keine Kurations-Vorschlaege. Ihr Memory-System ist gut organisiert!</div>;
  }

  return (
    <div className="curation-panel">
      <p className="curation-summary">{visibleSuggestions.length} Vorschlaege zur Optimierung</p>
      {visibleSuggestions.map((suggestion) => {
        const config = SUGGESTION_CONFIG[suggestion.suggestion] || {
          label: suggestion.suggestion,
          icon: 'help',
          color: '#666',
        };
        return (
          <div className="curation-card" key={suggestion.id}>
            <div className="curation-card-header">
              <span
                className="curation-type-badge"
                style={{ backgroundColor: config.color }}
              >
                <span className="material-icons curation-icon">{config.icon}</span>
                {config.label}
              </span>
              <span className="curation-layer">{LAYER_LABELS[suggestion.layer] || suggestion.layer}</span>
            </div>
            <div className="curation-content">{suggestion.content}</div>
            <div className="curation-reason">{suggestion.reason}</div>
            <div className="curation-actions">
              <button
                className="curation-action-btn primary"
                style={{ backgroundColor: config.color }}
                onClick={() => handleDismiss(suggestion.id)}
              >
                <span className="material-icons">{config.icon}</span>
                {config.label}
              </button>
              <button
                className="curation-action-btn secondary"
                onClick={() => handleDismiss(suggestion.id)}
              >
                Ignorieren
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
