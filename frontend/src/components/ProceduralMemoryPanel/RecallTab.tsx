/**
 * RecallTab — Find matching procedures by trigger similarity.
 *
 * Extracted from ProceduralMemoryPanel.tsx (Phase 121).
 */

import { useState, useCallback } from 'react';
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
      <p style={{ fontSize: '0.85rem', opacity: 0.6, margin: '0 0 1rem' }}>
        Gib einen Trigger ein, um aehnliche gespeicherte Prozeduren zu finden.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Trigger beschreiben..."
          value={recallTrigger}
          onChange={e => setRecallTrigger(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runRecall()}
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)',
            color: 'inherit',
            fontSize: '0.875rem',
          }}
        />
        <button
          onClick={runRecall}
          disabled={recallLoading || !recallTrigger.trim()}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            cursor: recallLoading ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            opacity: recallLoading || !recallTrigger.trim() ? 0.5 : 1,
          }}
        >
          {recallLoading ? 'Suche...' : 'Recall'}
        </button>
      </div>

      {recallResults.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '0.75rem' }}>
            {recallResults.length} passende Prozedur{recallResults.length !== 1 ? 'en' : ''} gefunden
          </div>
          {recallResults.map(result => {
            const outcomeStyle = OUTCOME_STYLES[result.outcome] || OUTCOME_STYLES.partial;
            return (
              <div
                key={result.id}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{result.name}</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      background: 'rgba(34,197,94,0.15)',
                      color: '#22c55e',
                    }}>
                      Sim: {result.similarity?.toFixed(3) || 'N/A'}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.25rem' }}>
                  Trigger: {result.trigger}
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.4 }}>
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
