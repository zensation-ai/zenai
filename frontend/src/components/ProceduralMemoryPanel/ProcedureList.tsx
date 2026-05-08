/**
 * ProcedureList — Renders the list of procedures with outcome badges.
 *
 * Extracted from ProceduralMemoryPanel.tsx (Phase 121).
 */

import type { CSSProperties } from 'react';
import type { Procedure } from './types';
import { OUTCOME_STYLES } from './types';
import { cn } from '@/lib/utils';

interface ProcedureListProps {
  procedures: Procedure[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ProcedureList({ procedures, selectedId, onSelect, onDelete }: ProcedureListProps) {
  if (procedures.length === 0) {
    return (
      <div className="text-center p-8 opacity-50">
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
            className={cn(
              'p-3 mb-2 rounded-lg cursor-pointer transition-[background] duration-150',
              selectedId === proc.id
                ? 'border border-blue-500 bg-blue-500/8'
                : 'border border-white/8 bg-white/3',
            )}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-[0.9rem]">{proc.name}</span>
              <span
                className="text-[0.7rem] py-[0.1rem] px-[0.4rem] rounded font-semibold bg-[var(--bg)] text-[var(--c)]"
                style={{ '--bg': outcomeStyle.color + '22', '--c': outcomeStyle.color } as CSSProperties}
              >
                {outcomeStyle.label}
              </span>
            </div>
            <div className="text-[0.8rem] opacity-60">
              Trigger: {proc.trigger?.slice(0, 80)}
              {(proc.trigger?.length || 0) > 80 ? '...' : ''}
            </div>
            <div className="flex gap-4 mt-1.5 text-xs opacity-50 items-center">
              <span>Erfolgsrate: {(proc.success_rate * 100).toFixed(0)}%</span>
              <span>{proc.execution_count}x ausgeführt</span>
              {proc.tools_used?.length > 0 && (
                <span>{proc.tools_used.length} Tool{proc.tools_used.length !== 1 ? 's' : ''}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(proc.id); }}
                title="Prozedur löschen"
                className="ml-auto py-[0.15rem] px-[0.4rem] rounded border border-red-500/20 bg-transparent text-red-400 cursor-pointer text-[0.7rem] opacity-60 transition-opacity duration-150 hover:opacity-100"
              >
                Löschen
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
