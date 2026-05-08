/**
 * ProcedureDetail — Single procedure detail view with feedback and delete.
 *
 * Extracted from ProceduralMemoryPanel.tsx (Phase 121).
 */

import type { CSSProperties } from 'react';
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
    return <div className="text-center p-8 opacity-50">Laden...</div>;
  }

  return (
    <>
      <div className="flex justify-between items-start mb-3">
        <h3 className="m-0 text-[1.1rem]">{procedure.name}</h3>
        <div className="flex gap-1.5">
          {!feedbackSent ? (
            <>
              <button
                onClick={() => onFeedback(procedure.id, true)}
                title="Positives Feedback"
                className="py-1 px-2 bg-green-500/10 border border-green-500/30 rounded text-green-500 cursor-pointer text-[0.85rem]"
              >
                +1
              </button>
              <button
                onClick={() => onFeedback(procedure.id, false)}
                title="Negatives Feedback"
                className="py-1 px-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 cursor-pointer text-[0.85rem]"
              >
                -1
              </button>
            </>
          ) : (
            <span className="text-xs opacity-50 py-1 px-2">
              Feedback gesendet
            </span>
          )}
          <button
            onClick={() => onDelete(procedure.id)}
            className="py-1 px-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 cursor-pointer text-xs"
          >
            Löschen
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs opacity-50 mb-1">Trigger</div>
        <div className="p-2 rounded-md bg-white/[0.04] text-[0.85rem]">
          {procedure.trigger}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs opacity-50 mb-1">
          Schritte ({procedure.steps?.length || 0})
        </div>
        {procedure.steps?.map((step, idx) => (
          <div
            key={idx}
            className="py-1.5 px-2 mb-1 rounded bg-white/[0.04] text-[0.8rem]"
          >
            <span className="opacity-40 mr-2">{idx + 1}.</span>
            {step}
          </div>
        ))}
      </div>

      {procedure.tools_used?.length > 0 && (
        <div className="mb-4">
          <div className="text-xs opacity-50 mb-1">Tools</div>
          <div className="flex gap-1.5 flex-wrap">
            {procedure.tools_used.map(tool => (
              <span
                key={tool}
                className="py-[0.15rem] px-2 rounded bg-violet-500/15 text-[#3da5b8] text-xs"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[0.8rem]">
        <div>
          <span className="opacity-50">Erfolgsrate: </span>
          <span className="font-medium">{(procedure.success_rate * 100).toFixed(0)}%</span>
        </div>
        <div>
          <span className="opacity-50">Ausführungen: </span>
          <span className="font-medium">{procedure.execution_count}</span>
        </div>
        <div>
          <span className="opacity-50">Feedback: </span>
          <span className="font-medium">
            {procedure.feedback_score !== null
              ? procedure.feedback_score.toFixed(2)
              : 'Keins'}
          </span>
        </div>
        <div>
          <span className="opacity-50">Outcome: </span>
          <span
            className="font-medium text-[var(--c)]"
            style={{ '--c': (OUTCOME_STYLES[procedure.outcome] || OUTCOME_STYLES.partial).color } as CSSProperties}
          >
            {(OUTCOME_STYLES[procedure.outcome] || OUTCOME_STYLES.partial).label}
          </span>
        </div>
      </div>
    </>
  );
}
