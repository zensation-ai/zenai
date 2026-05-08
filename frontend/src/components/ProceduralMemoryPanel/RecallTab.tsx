/**
 * RecallTab — Find matching procedures by trigger similarity.
 *
 * Extracted from ProceduralMemoryPanel.tsx (Phase 121).
 */

import { useState, useCallback, type CSSProperties } from 'react';
import axios from 'axios';
import type { RecallResult } from './types';
import { OUTCOME_STYLES } from './types';

interface RecallTabProps {
  context: string;
  onError: (msg: string) => void;
}

export function RecallTab({ context, onError }: RecallTabProps) {
  const [recallTrigger, setRecallTrigger] = useState('');
  const [recallResults, setRecallResults] = useState<RecallResult[]>([]);
  const [recallLoading, setRecallLoading] = useState(false);

  const runRecall = useCallback(async () => {
    if (!recallTrigger.trim()) return;
    setRecallLoading(true);
    try {
      const res = await axios.post(`/api/${context}/memory/procedures/recall`, {
        trigger: recallTrigger,
        limit: 10,
      });
      setRecallResults(res.data.data || res.data.procedures || []);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Fehler beim Recall');
    } finally {
      setRecallLoading(false);
    }
  }, [context, recallTrigger, onError]);

  return (
    <div>
      <p className="text-[0.85rem] opacity-60 m-0 mb-4">
        Gib einen Trigger ein, um ähnliche gespeicherte Prozeduren zu finden.
      </p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Trigger beschreiben..."
          value={recallTrigger}
          onChange={e => setRecallTrigger(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runRecall()}
          className="flex-1 py-2 px-3 rounded-md border border-white/15 bg-white/5 text-inherit text-sm"
        />
        <button
          onClick={runRecall}
          disabled={recallLoading || !recallTrigger.trim()}
          className="py-2 px-4 rounded-md border-0 bg-blue-500 text-white text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {recallLoading ? 'Suche...' : 'Abrufen'}
        </button>
      </div>

      {recallResults.length > 0 && (
        <div>
          <div className="text-[0.8rem] opacity-50 mb-3">
            {recallResults.length} passende Prozedur{recallResults.length !== 1 ? 'en' : ''} gefunden
          </div>
          {recallResults.map(result => {
            const outcomeStyle = OUTCOME_STYLES[result.outcome] || OUTCOME_STYLES.partial;
            return (
              <div
                key={result.id}
                className="p-3 mb-2 rounded-lg border border-white/[0.08] bg-white/[0.03]"
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-medium text-[0.9rem]">{result.name}</span>
                  <div className="flex gap-2 items-center">
                    <span
                      className="text-[0.7rem] py-[0.1rem] px-[0.4rem] rounded font-semibold bg-[var(--bg)] text-[var(--c)]"
                      style={{ '--bg': outcomeStyle.color + '22', '--c': outcomeStyle.color } as CSSProperties}
                    >
                      {outcomeStyle.label}
                    </span>
                    <span className="text-[0.7rem] py-[0.1rem] px-[0.4rem] rounded bg-green-500/15 text-green-500">
                      Sim: {result.similarity?.toFixed(3) || 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="text-[0.8rem] opacity-60 mb-1">
                  Trigger: {result.trigger}
                </div>
                <div className="text-xs opacity-40">
                  Erfolgsrate: {(result.success_rate * 100).toFixed(0)}% |
                  {result.steps?.length || 0} Schritte |
                  {result.tools_used?.length || 0} Tools
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
