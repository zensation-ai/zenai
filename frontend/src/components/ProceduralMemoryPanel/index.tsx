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
import { cn } from '@/lib/utils';

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
    if (!confirm('Prozedur wirklich löschen?')) return;
    try {
      await axios.delete(`/api/${context}/memory/procedures/${id}`);
      setProcedures(prev => prev.filter(p => p.id !== id));
      if (selectedProcedure?.id === id) setSelectedProcedure(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen');
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
    <div className="p-4">
      <h2 className="m-0 mb-4 text-xl font-semibold">
        Prozedurales Gedächtnis
      </h2>

      {error && (
        <div className="py-3 px-4 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right bg-transparent border-0 text-red-500 cursor-pointer"
          >
            x
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-white/10">
        {([
          ['procedures', 'Prozeduren'],
          ['recall', 'Abruf'],
          ['search', 'Hybridsuche'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'py-2 px-4 border-0 cursor-pointer text-sm border-b-2',
              activeTab === key
                ? 'bg-blue-500/15 border-b-blue-500 text-blue-500 font-semibold'
                : 'bg-transparent border-b-transparent font-normal',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Procedures Tab */}
      {activeTab === 'procedures' && (
        <div>
          <div className="flex gap-2 mb-4 items-center">
            <select
              value={outcomeFilter}
              onChange={e => setOutcomeFilter(e.target.value)}
              className="py-2 px-3 rounded-md border border-white/15 bg-white/5 text-inherit text-sm"
            >
              <option value="">Alle Outcomes</option>
              <option value="success">Erfolgreich</option>
              <option value="failure">Fehlgeschlagen</option>
              <option value="partial">Teilweise</option>
            </select>
            <span className="text-[0.8rem] opacity-50 self-center flex-1">
              {procedures.length} Prozeduren
            </span>
            <button
              onClick={() => setShowRecordForm(!showRecordForm)}
              className="py-[0.45rem] px-[0.9rem] rounded-lg border border-[rgba(20,74,86,0.3)] bg-[rgba(20,74,86,0.1)] text-[#2d8a9e] text-[0.8rem] font-medium cursor-pointer transition-all duration-200"
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
            <div className="text-center p-8 opacity-50">Laden...</div>
          ) : (
            <div className="flex gap-4">
              {/* Procedure list */}
              <div className="flex-1 max-h-[500px] overflow-y-auto">
                <ProcedureList
                  procedures={procedures}
                  selectedId={selectedProcedure?.id ?? null}
                  onSelect={loadProcedureDetail}
                  onDelete={deleteProcedure}
                />
              </div>

              {/* Procedure detail */}
              {selectedProcedure && (
                <div className="flex-1 p-4 rounded-lg border border-white/10 bg-white/[0.03] max-h-[500px] overflow-y-auto">
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
