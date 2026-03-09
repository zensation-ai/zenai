/**
 * Phase 53: Conflict List Component
 *
 * Displays detected memory conflicts with type badges
 * and side-by-side memory comparison.
 */

import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

interface MemoryConflict {
  id: string;
  memory1: { id: string; content: string; layer: string; created: string };
  memory2: { id: string; content: string; layer: string; created: string };
  conflictType: 'contradiction' | 'outdated' | 'duplicate';
  confidence: number;
}

interface ConflictListProps {
  context: string;
}

const CONFLICT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  contradiction: { label: 'Widerspruch', color: '#ef4444' },
  outdated: { label: 'Veraltet', color: '#eab308' },
  duplicate: { label: 'Duplikat', color: '#3b82f6' },
};

export function ConflictList({ context }: ConflictListProps) {
  const [conflicts, setConflicts] = useState<MemoryConflict[]>([]);
  const [loading, setLoading] = useState(false);

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/${context}/memory/insights/conflicts?limit=20`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.success) setConflicts(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  if (loading) return <div className="memory-insights-loading">Konflikte werden analysiert...</div>;

  if (conflicts.length === 0) {
    return <div className="memory-insights-empty">Keine Konflikte erkannt. Alles sieht gut aus!</div>;
  }

  return (
    <div className="conflict-list">
      <p className="conflict-summary">{conflicts.length} potenzielle Konflikte erkannt</p>
      {conflicts.map((conflict) => {
        const typeConfig = CONFLICT_TYPE_CONFIG[conflict.conflictType] || { label: conflict.conflictType, color: '#666' };
        return (
          <div className="conflict-card" key={conflict.id}>
            <div className="conflict-header">
              <span
                className="conflict-type-badge"
                style={{ backgroundColor: typeConfig.color }}
              >
                {typeConfig.label}
              </span>
              <span className="conflict-confidence">
                {Math.round(conflict.confidence * 100)}% Konfidenz
              </span>
            </div>
            <div className="conflict-memories">
              <div className="conflict-memory">
                <div className="conflict-memory-label">Memory 1</div>
                <div className="conflict-memory-content">{conflict.memory1.content}</div>
                <div className="conflict-memory-meta">
                  <span className="conflict-layer">{conflict.memory1.layer}</span>
                  <span className="conflict-date">
                    {new Date(conflict.memory1.created).toLocaleDateString('de-DE')}
                  </span>
                </div>
              </div>
              <div className="conflict-divider" />
              <div className="conflict-memory">
                <div className="conflict-memory-label">Memory 2</div>
                <div className="conflict-memory-content">{conflict.memory2.content}</div>
                <div className="conflict-memory-meta">
                  <span className="conflict-layer">{conflict.memory2.layer}</span>
                  <span className="conflict-date">
                    {new Date(conflict.memory2.created).toLocaleDateString('de-DE')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
