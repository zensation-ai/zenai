/**
 * ProcedureList — Renders the list of procedures with outcome badges.
 *
 * Extracted from ProceduralMemoryPanel.tsx (Phase 121).
 */

import type { Procedure } from './types';
import { OUTCOME_STYLES } from './types';

interface ProcedureListProps {
  procedures: Procedure[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ProcedureList({ procedures, selectedId, onSelect, onDelete }: ProcedureListProps) {
  if (procedures.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
        Keine Prozeduren gefunden
      </div>
    );
  }

  return (
    <>
      {procedures.map(proc => {
        const outcomeStyle = OUTCOME_STYLES[proc.outcome] || OUTCOME_STYLES.partial;
        return (
          <div
            key={proc.id}
            onClick={() => onSelect(proc.id)}
            style={{
              padding: '0.75rem',
              marginBottom: '0.5rem',
              borderRadius: '8px',
              border: selectedId === proc.id
                ? '1px solid #3b82f6'
                : '1px solid rgba(255,255,255,0.08)',
              background: selectedId === proc.id
                ? 'rgba(59,130,246,0.08)'
                : 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{proc.name}</span>
              <span style={{
                fontSize: '0.7rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                background: outcomeStyle.color + '22',
                color: outcomeStyle.color,
                fontWeight: 600,
              }}>
                {outcomeStyle.label}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
              Trigger: {proc.trigger?.slice(0, 80)}
              {(proc.trigger?.length || 0) > 80 ? '...' : ''}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.375rem', fontSize: '0.75rem', opacity: 0.5, alignItems: 'center' }}>
              <span>Erfolgsrate: {(proc.success_rate * 100).toFixed(0)}%</span>
              <span>{proc.execution_count}x ausgefuehrt</span>
              {proc.tools_used?.length > 0 && (
                <span>{proc.tools_used.length} Tool{proc.tools_used.length !== 1 ? 's' : ''}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(proc.id); }}
                title="Prozedur loeschen"
                style={{
                  marginLeft: 'auto',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '4px',
                  border: '1px solid rgba(239,68,68,0.2)',
                  background: 'transparent',
                  color: '#f87171',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  opacity: 0.6,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
              >
                Loeschen
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
