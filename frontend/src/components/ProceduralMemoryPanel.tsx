/**
 * ProceduralMemoryPanel - Procedural Memory & Hybrid Search
 *
 * Phase 59: Memory Excellence (Letta-Paradigm)
 * - List procedures with name, trigger, outcome, success_rate
 * - Recall test (find matching procedures by trigger)
 * - Hybrid search (BM25 + semantic via RRF)
 * - Feedback buttons (thumbs up/down)
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface Procedure {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
  tools_used: string[];
  outcome: 'success' | 'failure' | 'partial';
  success_rate: number;
  execution_count: number;
  feedback_score: number | null;
  created_at: string;
  updated_at: string;
}

interface SearchResult {
  id: string;
  content: string;
  score: number;
  source: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

interface RecallResult {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
  tools_used: string[];
  outcome: string;
  success_rate: number;
  similarity: number;
}

interface ProceduralMemoryPanelProps {
  context: string;
}

const OUTCOME_STYLES: Record<string, { color: string; label: string }> = {
  success: { color: '#22c55e', label: 'Erfolgreich' },
  failure: { color: '#ef4444', label: 'Fehlgeschlagen' },
  partial: { color: '#f59e0b', label: 'Teilweise' },
};

export function ProceduralMemoryPanel({ context }: ProceduralMemoryPanelProps) {
  const [activeTab, setActiveTab] = useState<'procedures' | 'recall' | 'search'>('procedures');

  // Procedures state
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [proceduresLoading, setProceduresLoading] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState<string>('');
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [procedureDetailLoading, setProcedureDetailLoading] = useState(false);

  // Recall state
  const [recallTrigger, setRecallTrigger] = useState('');
  const [recallResults, setRecallResults] = useState<RecallResult[]>([]);
  const [recallLoading, setRecallLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'hybrid' | 'bm25'>('hybrid');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Feedback state
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());

  // Record form state
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordForm, setRecordForm] = useState({
    trigger: '',
    steps: [''],
    tools_used: [''],
    outcome: 'success' as 'success' | 'failure' | 'partial',
    context_tags: [''],
  });
  const [recording, setRecording] = useState(false);

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

  const runRecall = useCallback(async () => {
    if (!recallTrigger.trim()) return;
    setRecallLoading(true);
    setError(null);
    try {
      const res = await axios.post(`/api/${context}/memory/procedures/recall`, {
        trigger: recallTrigger,
        limit: 10,
      });
      setRecallResults(res.data.data || res.data.procedures || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Recall');
    } finally {
      setRecallLoading(false);
    }
  }, [context, recallTrigger]);

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setError(null);
    try {
      const endpoint = searchMode === 'hybrid'
        ? `/api/${context}/memory/hybrid-search`
        : `/api/${context}/memory/bm25`;
      const res = await axios.get(endpoint, {
        params: { q: searchQuery, limit: 10 },
      });
      setSearchResults(res.data.data || res.data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler bei der Suche');
    } finally {
      setSearchLoading(false);
    }
  }, [context, searchQuery, searchMode]);

  const handleRecordProcedure = useCallback(async () => {
    if (!recordForm.trigger.trim()) return;
    setRecording(true);
    setError(null);
    try {
      const payload = {
        trigger: recordForm.trigger.trim(),
        steps: recordForm.steps.filter(s => s.trim()),
        tools_used: recordForm.tools_used.filter(t => t.trim()),
        outcome: recordForm.outcome,
        context_tags: recordForm.context_tags.filter(t => t.trim()),
      };
      if (payload.steps.length === 0) {
        setError('Mindestens ein Schritt ist erforderlich');
        setRecording(false);
        return;
      }
      await axios.post(`/api/${context}/memory/procedures`, payload);
      setRecordForm({ trigger: '', steps: [''], tools_used: [''], outcome: 'success', context_tags: [''] });
      setShowRecordForm(false);
      await loadProcedures();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern der Prozedur');
    } finally {
      setRecording(false);
    }
  }, [context, recordForm, loadProcedures]);

  const addListItem = (field: 'steps' | 'tools_used' | 'context_tags') => {
    setRecordForm(prev => ({ ...prev, [field]: [...prev[field], ''] }));
  };

  const removeListItem = (field: 'steps' | 'tools_used' | 'context_tags', index: number) => {
    setRecordForm(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const updateListItem = (field: 'steps' | 'tools_used' | 'context_tags', index: number, value: string) => {
    setRecordForm(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === index ? value : item)),
    }));
  };

  useEffect(() => {
    if (activeTab === 'procedures') loadProcedures();
  }, [activeTab, context, outcomeFilter]);

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
            <div style={{
              padding: '1.25rem',
              marginBottom: '1rem',
              borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(16px)',
            }}>
              <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600 }}>
                Neue Prozedur erfassen
              </h4>

              {/* Trigger */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Trigger
                </label>
                <input
                  type="text"
                  value={recordForm.trigger}
                  onChange={e => setRecordForm(f => ({ ...f, trigger: e.target.value }))}
                  placeholder="Wann wird diese Prozedur ausgeloest?"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'inherit',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Steps */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Schritte
                </label>
                {recordForm.steps.map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
                    <span style={{ opacity: 0.4, fontSize: '0.8rem', padding: '0.5rem 0', minWidth: '1.5rem' }}>{idx + 1}.</span>
                    <input
                      type="text"
                      value={step}
                      onChange={e => updateListItem('steps', idx, e.target.value)}
                      placeholder={`Schritt ${idx + 1}`}
                      style={{
                        flex: 1,
                        padding: '0.45rem 0.65rem',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.04)',
                        color: 'inherit',
                        fontSize: '0.82rem',
                        outline: 'none',
                      }}
                    />
                    {recordForm.steps.length > 1 && (
                      <button
                        onClick={() => removeListItem('steps', idx)}
                        style={{
                          padding: '0.3rem 0.5rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(239,68,68,0.2)',
                          background: 'transparent',
                          color: '#f87171',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addListItem('steps')}
                  style={{
                    padding: '0.3rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  + Schritt
                </button>
              </div>

              {/* Tools Used */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Verwendete Tools
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {recordForm.tools_used.map((tool, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.25rem' }}>
                      <input
                        type="text"
                        value={tool}
                        onChange={e => updateListItem('tools_used', idx, e.target.value)}
                        placeholder="Tool-Name"
                        style={{
                          width: '120px',
                          padding: '0.35rem 0.55rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(139,92,246,0.2)',
                          background: 'rgba(139,92,246,0.05)',
                          color: '#a78bfa',
                          fontSize: '0.78rem',
                          outline: 'none',
                        }}
                      />
                      {recordForm.tools_used.length > 1 && (
                        <button
                          onClick={() => removeListItem('tools_used', idx)}
                          style={{
                            padding: '0.2rem 0.4rem',
                            borderRadius: '4px',
                            border: 'none',
                            background: 'transparent',
                            color: '#f87171',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                          }}
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addListItem('tools_used')}
                    style={{
                      padding: '0.3rem 0.5rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.5)',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                    }}
                  >
                    + Tool
                  </button>
                </div>
              </div>

              {/* Outcome */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Ergebnis
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['success', 'partial', 'failure'] as const).map(outcome => {
                    const style = OUTCOME_STYLES[outcome];
                    const isSelected = recordForm.outcome === outcome;
                    return (
                      <button
                        key={outcome}
                        onClick={() => setRecordForm(f => ({ ...f, outcome }))}
                        style={{
                          padding: '0.4rem 0.75rem',
                          borderRadius: '8px',
                          border: `1px solid ${isSelected ? style.color : 'rgba(255,255,255,0.1)'}`,
                          background: isSelected ? `${style.color}22` : 'transparent',
                          color: isSelected ? style.color : 'rgba(255,255,255,0.5)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: isSelected ? 600 : 400,
                          transition: 'all 0.15s',
                        }}
                      >
                        {style.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Context Tags */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Kontext-Tags
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {recordForm.context_tags.map((tag, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.25rem' }}>
                      <input
                        type="text"
                        value={tag}
                        onChange={e => updateListItem('context_tags', idx, e.target.value)}
                        placeholder="Tag"
                        style={{
                          width: '100px',
                          padding: '0.35rem 0.55rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.04)',
                          color: 'inherit',
                          fontSize: '0.78rem',
                          outline: 'none',
                        }}
                      />
                      {recordForm.context_tags.length > 1 && (
                        <button
                          onClick={() => removeListItem('context_tags', idx)}
                          style={{
                            padding: '0.2rem 0.4rem',
                            borderRadius: '4px',
                            border: 'none',
                            background: 'transparent',
                            color: '#f87171',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                          }}
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addListItem('context_tags')}
                    style={{
                      padding: '0.3rem 0.5rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.5)',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                    }}
                  >
                    + Tag
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleRecordProcedure}
                  disabled={!recordForm.trigger.trim() || recording}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    color: '#fff',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: recording ? 'not-allowed' : 'pointer',
                    opacity: !recordForm.trigger.trim() || recording ? 0.4 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {recording ? 'Speichere...' : 'Prozedur speichern'}
                </button>
                <button
                  onClick={() => {
                    setShowRecordForm(false);
                    setRecordForm({ trigger: '', steps: [''], tools_used: [''], outcome: 'success', context_tags: [''] });
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {proceduresLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>Laden...</div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem' }}>
              {/* Procedure list */}
              <div style={{ flex: 1, maxHeight: '500px', overflowY: 'auto' }}>
                {procedures.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                    Keine Prozeduren gefunden
                  </div>
                ) : (
                  procedures.map(proc => {
                    const outcomeStyle = OUTCOME_STYLES[proc.outcome] || OUTCOME_STYLES.partial;
                    return (
                      <div
                        key={proc.id}
                        onClick={() => loadProcedureDetail(proc.id)}
                        style={{
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          borderRadius: '8px',
                          border: selectedProcedure?.id === proc.id
                            ? '1px solid #3b82f6'
                            : '1px solid rgba(255,255,255,0.08)',
                          background: selectedProcedure?.id === proc.id
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
                            onClick={(e) => { e.stopPropagation(); deleteProcedure(proc.id); }}
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
                  })
                )}
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
                  {procedureDetailLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>Laden...</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedProcedure.name}</h3>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          {!feedbackSent.has(selectedProcedure.id) ? (
                            <>
                              <button
                                onClick={() => sendFeedback(selectedProcedure.id, true)}
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
                                onClick={() => sendFeedback(selectedProcedure.id, false)}
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
                            onClick={() => deleteProcedure(selectedProcedure.id)}
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
                          {selectedProcedure.trigger}
                        </div>
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.25rem' }}>
                          Schritte ({selectedProcedure.steps?.length || 0})
                        </div>
                        {selectedProcedure.steps?.map((step, idx) => (
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

                      {selectedProcedure.tools_used?.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.25rem' }}>Tools</div>
                          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                            {selectedProcedure.tools_used.map(tool => (
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
                          <span style={{ fontWeight: 500 }}>{(selectedProcedure.success_rate * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                          <span style={{ opacity: 0.5 }}>Ausfuehrungen: </span>
                          <span style={{ fontWeight: 500 }}>{selectedProcedure.execution_count}</span>
                        </div>
                        <div>
                          <span style={{ opacity: 0.5 }}>Feedback: </span>
                          <span style={{ fontWeight: 500 }}>
                            {selectedProcedure.feedback_score !== null
                              ? selectedProcedure.feedback_score.toFixed(2)
                              : 'Keins'}
                          </span>
                        </div>
                        <div>
                          <span style={{ opacity: 0.5 }}>Outcome: </span>
                          <span style={{
                            fontWeight: 500,
                            color: (OUTCOME_STYLES[selectedProcedure.outcome] || OUTCOME_STYLES.partial).color,
                          }}>
                            {(OUTCOME_STYLES[selectedProcedure.outcome] || OUTCOME_STYLES.partial).label}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recall Tab */}
      {activeTab === 'recall' && (
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
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div>
          <p style={{ fontSize: '0.85rem', opacity: 0.6, margin: '0 0 1rem' }}>
            Hybrid Search kombiniert BM25 Full-Text mit semantischer Suche (Reciprocal Rank Fusion).
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Suchbegriff eingeben..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
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
            <select
              value={searchMode}
              onChange={e => setSearchMode(e.target.value as 'hybrid' | 'bm25')}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: 'inherit',
                fontSize: '0.875rem',
              }}
            >
              <option value="hybrid">Hybrid (BM25 + Semantic)</option>
              <option value="bm25">BM25 Only</option>
            </select>
            <button
              onClick={runSearch}
              disabled={searchLoading || !searchQuery.trim()}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: '#3b82f6',
                color: '#fff',
                cursor: searchLoading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                opacity: searchLoading || !searchQuery.trim() ? 0.5 : 1,
              }}
            >
              {searchLoading ? 'Suche...' : 'Suchen'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '0.75rem' }}>
                {searchResults.length} Ergebnis{searchResults.length !== 1 ? 'se' : ''}
                ({searchMode === 'hybrid' ? 'Hybrid RRF' : 'BM25'})
              </div>
              {searchResults.map((result, idx) => (
                <div
                  key={result.id || idx}
                  style={{
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase' }}>
                      {result.source || result.type || 'memory'}
                    </span>
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      background: 'rgba(34,197,94,0.15)',
                      color: '#22c55e',
                    }}>
                      Score: {result.score?.toFixed(3) || 'N/A'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
                    {result.content?.slice(0, 300)}
                    {(result.content?.length || 0) > 300 ? '...' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!searchLoading && searchResults.length === 0 && searchQuery && (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.4, fontSize: '0.875rem' }}>
              Enter druecken oder Suchen klicken
            </div>
          )}
        </div>
      )}
    </div>
  );
}
