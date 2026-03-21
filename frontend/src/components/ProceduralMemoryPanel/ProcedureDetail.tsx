/**
 * ProcedureDetail — Single procedure detail view with feedback and delete.
 *
 * Extracted from ProceduralMemoryPanel.tsx (Phase 121).
 */

import type { Procedure } from './types';
import { OUTCOME_STYLES } from './types';

interface ProcedureDetailProps {
  procedure: Procedure;
  loading: boolean;
  feedbackSent: boolean;
  onFeedback: (id: string, success: boolean) => void;
  onDelete: (id: string) => void;
}

export function ProcedureDetail({ procedure, loading, feedbackSent, onFeedback, onDelete }: ProcedureDetailProps) {
  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>Laden...</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{procedure.name}</h3>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {!feedbackSent ? (
            <>
              <button
                onClick={() => onFeedback(procedure.id, true)}
                title="Positives Feedback"
                style={{
                  padding: '0.25rem 0.5rem',
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: '4px',
                  color: '#22c55e',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                +1
              </button>
              <button
                onClick={() => onFeedback(procedure.id, false)}
                title="Negatives Feedback"
                style={{
                  padding: '0.25rem 0.5rem',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '4px',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                -1
              </button>
            </>
          ) : (
            <span style={{ fontSize: '0.75rem', opacity: 0.5, padding: '0.25rem 0.5rem' }}>
              Feedback gesendet
            </span>
          )}
          <button
            onClick={() => onDelete(procedure.id)}
            style={{
              padding: '0.25rem 0.5rem',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '4px',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Loeschen
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.25rem' }}>Trigger</div>
        <div style={{
          padding: '0.5rem',
          borderRadius: '6px',
          background: 'rgba(255,255,255,0.04)',
          fontSize: '0.85rem',
        }}>
          {procedure.trigger}
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.25rem' }}>
          Schritte ({procedure.steps?.length || 0})
        </div>
        {procedure.steps?.map((step, idx) => (
          <div
            key={idx}
            style={{
              padding: '0.375rem 0.5rem',
              marginBottom: '0.25rem',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.04)',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ opacity: 0.4, marginRight: '0.5rem' }}>{idx + 1}.</span>
            {step}
          </div>
        ))}
      </div>

      {procedure.tools_used?.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.25rem' }}>Tools</div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {procedure.tools_used.map(tool => (
              <span
                key={tool}
                style={{
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  background: 'rgba(139,92,246,0.15)',
                  color: '#a78bfa',
                  fontSize: '0.75rem',
                }}
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
        <div>
          <span style={{ opacity: 0.5 }}>Erfolgsrate: </span>
          <span style={{ fontWeight: 500 }}>{(procedure.success_rate * 100).toFixed(0)}%</span>
        </div>
        <div>
          <span style={{ opacity: 0.5 }}>Ausfuehrungen: </span>
          <span style={{ fontWeight: 500 }}>{procedure.execution_count}</span>
        </div>
        <div>
          <span style={{ opacity: 0.5 }}>Feedback: </span>
          <span style={{ fontWeight: 500 }}>
            {procedure.feedback_score !== null
              ? procedure.feedback_score.toFixed(2)
              : 'Keins'}
          </span>
        </div>
        <div>
          <span style={{ opacity: 0.5 }}>Outcome: </span>
          <span style={{
            fontWeight: 500,
            color: (OUTCOME_STYLES[procedure.outcome] || OUTCOME_STYLES.partial).color,
          }}>
            {(OUTCOME_STYLES[procedure.outcome] || OUTCOME_STYLES.partial).label}
          </span>
        </div>
      </div>
    </>
  );
}
