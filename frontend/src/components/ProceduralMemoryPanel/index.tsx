/**
 * ProceduralMemoryPanel - Procedural Memory & Hybrid Search
 *
 * Phase 59: Memory Excellence (Letta-Paradigm)
 * Phase 121: Decomposed into sub-components.
 *
 * - List procedures with name, trigger, outcome, success_rate
 * - Recall test (find matching procedures by trigger)
 * - Hybrid search (BM25 + semantic via RRF)
 * - Feedback buttons (thumbs up/down)
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

import type { Procedure, ProceduralMemoryPanelProps } from './types';
import { ProcedureList } from './ProcedureList';
import { ProcedureDetail } from './ProcedureDetail';
import { ProcedureForm } from './ProcedureForm';
import { RecallTab } from './RecallTab';
import { SearchTab } from './SearchTab';

export function ProceduralMemoryPanel({ context }: ProceduralMemoryPanelProps) {
  const [activeTab, setActiveTab] = useState<'procedures' | 'recall' | 'search'>('procedures');

  // Procedures state
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [proceduresLoading, setProceduresLoading] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState<string>('');
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [procedureDetailLoading, setProcedureDetailLoading] = useState(false);

  // Feedback state
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());

  // Record form state
  const [showRecordForm, setShowRecordForm] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadProcedures = useCallback(async () => {
    setProceduresLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (outcomeFilter) params.outcome = outcomeFilter;
      const res = await axios.get(`/api/${context}/memory/procedures`, { params });
      setProcedures(res.data.data || res.data.procedures || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Prozeduren');
    } finally {
      setProceduresLoading(false);
    }
  }, [context, outcomeFilter]);

  const loadProcedureDetail = useCallback(async (id: string) => {
    setProcedureDetailLoading(true);
    try {
      const res = await axios.get(`/api/${context}/memory/procedures/${id}`);
      setSelectedProcedure(res.data.data || res.data.procedure || res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Details');
    } finally {
      setProcedureDetailLoading(false);
    }
  }, [context]);

  const deleteProcedure = useCallback(async (id: string) => {
    if (!confirm('Prozedur wirklich loeschen?')) return;
    try {
      await axios.delete(`/api/${context}/memory/procedures/${id}`);
      setProcedures(prev => prev.filter(p => p.id !== id));
      if (selectedProcedure?.id === id) setSelectedProcedure(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Loeschen');
    }
  }, [context, selectedProcedure]);

  const sendFeedback = useCallback(async (id: string, success: boolean) => {
    try {
      await axios.put(`/api/${context}/memory/procedures/${id}/feedback`, {
        success,
        notes: success ? 'Positives Feedback via UI' : 'Negatives Feedback via UI',
      });
      setFeedbackSent(prev => new Set(prev).add(id));
      // Reload to reflect updated score
      if (selectedProcedure?.id === id) {
        loadProcedureDetail(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden des Feedbacks');
    }
  }, [context, selectedProcedure, loadProcedureDetail]);

  const handleError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  useEffect(() => {
    if (activeTab === 'procedures') loadProcedures();
  }, [activeTab, context, outcomeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: 600 }}>
        Procedural Memory
      </h2>

      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '0.875rem',
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ float: 'right', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
          >
            x
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {([
          ['procedures', 'Prozeduren'],
          ['recall', 'Recall'],
          ['search', 'Hybrid Search'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '0.5rem 1rem',
              background: activeTab === key ? 'rgba(59,130,246,0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === key ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === key ? '#3b82f6' : 'inherit',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: activeTab === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Procedures Tab */}
      {activeTab === 'procedures' && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
            <select
              value={outcomeFilter}
              onChange={e => setOutcomeFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: 'inherit',
                fontSize: '0.875rem',
              }}
            >
              <option value="">Alle Outcomes</option>
              <option value="success">Erfolgreich</option>
              <option value="failure">Fehlgeschlagen</option>
              <option value="partial">Teilweise</option>
            </select>
            <span style={{ fontSize: '0.8rem', opacity: 0.5, alignSelf: 'center', flex: 1 }}>
              {procedures.length} Prozeduren
            </span>
            <button
              onClick={() => setShowRecordForm(!showRecordForm)}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                border: '1px solid rgba(99,102,241,0.3)',
                background: 'rgba(99,102,241,0.1)',
                color: '#818cf8',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {showRecordForm ? 'Abbrechen' : '+ Prozedur erfassen'}
            </button>
          </div>

          {/* Record Procedure Form */}
          {showRecordForm && (
            <ProcedureForm
              context={context}
              onSaved={() => { setShowRecordForm(false); loadProcedures(); }}
              onCancel={() => setShowRecordForm(false)}
              onError={handleError}
            />
          )}

          {proceduresLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>Laden...</div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem' }}>
              {/* Procedure list */}
              <div style={{ flex: 1, maxHeight: '500px', overflowY: 'auto' }}>
                <ProcedureList
                  procedures={procedures}
                  selectedId={selectedProcedure?.id ?? null}
                  onSelect={loadProcedureDetail}
                  onDelete={deleteProcedure}
                />
              </div>

              {/* Procedure detail */}
              {selectedProcedure && (
                <div style={{
                  flex: 1,
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.03)',
                  maxHeight: '500px',
                  overflowY: 'auto',
                }}>
                  <ProcedureDetail
                    procedure={selectedProcedure}
                    loading={procedureDetailLoading}
                    feedbackSent={feedbackSent.has(selectedProcedure.id)}
                    onFeedback={sendFeedback}
                    onDelete={deleteProcedure}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recall Tab */}
      {activeTab === 'recall' && (
        <RecallTab context={context} onError={handleError} />
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <SearchTab context={context} onError={handleError} />
      )}
    </div>
  );
}
