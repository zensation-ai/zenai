/**
 * Phase 53: Conflict List Component
 *
 * Displays detected memory conflicts with type badges
 * and side-by-side memory comparison.
 *
 * Uses global axios instance (with auth interceptor from main.tsx).
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import axios from 'axios';
import { CONFLICT_TYPE_COLORS } from '../../constants/chart-colors';

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
  contradiction: { label: 'Widerspruch', color: CONFLICT_TYPE_COLORS.contradiction },
  outdated: { label: 'Veraltet', color: CONFLICT_TYPE_COLORS.outdated },
  duplicate: { label: 'Duplikat', color: CONFLICT_TYPE_COLORS.duplicate },
};

export function ConflictList({ context }: ConflictListProps) {
  const [conflicts, setConflicts] = useState<MemoryConflict[]>([]);
  const [loading, setLoading] = useState(false);

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/${context}/memory/insights/conflicts?limit=20`);
      if (res.data?.success) setConflicts(res.data.data);
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
        const typeConfig = CONFLICT_TYPE_CONFIG[conflict.conflictType] || { label: conflict.conflictType, color: '#6b7280' };
        return (
          <div className="conflict-card" key={conflict.id}>
            <div className="conflict-header">
              <span
                className="conflict-type-badge bg-[var(--bg)]"
                style={{ '--bg': typeConfig.color } as CSSProperties}
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
