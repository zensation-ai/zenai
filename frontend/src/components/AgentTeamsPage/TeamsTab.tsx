/**
 * TeamsTab — Main teams execution tab with strategy selection, streaming, results, and history.
 *
 * Extracted from AgentTeamsPage.tsx (Phase 121).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot } from 'lucide-react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';
import { showToast } from '../Toast';
import { logError } from '../../utils/errors';
import { getApiBaseUrl, getApiFetchHeaders } from '../../utils/apiConfig';
import type { TeamResult, HistoryEntry, AgentTemplate, StreamEvent, Strategy } from './types';
import { STRATEGIES, ROLE_CONFIG, EXECUTION_STATUS_LABELS, formatDuration, formatTokens } from './types';

interface TeamsTabProps {
  context: AIContext;
  showAnalytics: boolean;
  analytics: {
    totals: { executions: number; successful: number; failed: number; tokens: number; successRate: number };
    byStrategy: Array<{ strategy: string; count: number; successful: number; avgExecutionTime: number; avgTokens: number }>;
    dailyTrend: Array<{ date: string; executions: number; successful: number; avgTime: number }>;
  } | null;
}

export function TeamsTab({ context, showAnalytics, analytics }: TeamsTabProps) {
  const [task, setTask] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('research_write_review');
  const [skipReview, setSkipReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifiedStrategy, setClassifiedStrategy] = useState<string | null>(null);
  const [result, setResult] = useState<TeamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [savingIdeaId, setSavingIdeaId] = useState<string | null>(null);

  // Streaming state
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<{ role: string; index: number; total: number; subTask: string } | null>(null);

  // Templates state
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<{ abort: () => void } | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await axios.get('/api/agents/history', {
        params: { context, limit: 10 },
      });
      if (res.data.success) {
        setHistory(res.data.executions);
      }
    } catch (err) {
      logError('TeamsTab:loadHistory', err);
    }
  }, [context]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await axios.get('/api/agents/templates');
      if (res.data.success) {
        setTemplates(res.data.templates);
      }
    } catch (err) {
      logError('TeamsTab:loadTemplates', err);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadTemplates();
  }, [loadHistory, loadTemplates]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      eventSourceRef.current?.abort();
    };
  }, []);

  // Escape key to cancel
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && loading) {
      abortControllerRef.current?.abort();
      eventSourceRef.current?.abort();
      setLoading(false);
      setCurrentAgent(null);
      showToast('Ausfuehrung abgebrochen', 'info');
    }
  }, [loading]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Durable execution controls
  const handlePauseExecution = async (executionId: string) => {
    try {
      await axios.post(`/api/agents/executions/${executionId}/pause`, { context });
      showToast('Ausfuehrung pausiert', 'success');
      await loadHistory();
    } catch (err) {
      logError('TeamsTab:pause', err);
      showToast('Fehler beim Pausieren', 'error');
    }
  };

  const handleCancelExecution = async (executionId: string) => {
    try {
      await axios.post(`/api/agents/executions/${executionId}/cancel`, { context });
      showToast('Ausfuehrung abgebrochen', 'success');
      await loadHistory();
    } catch (err) {
      logError('TeamsTab:cancel', err);
      showToast('Fehler beim Abbrechen', 'error');
    }
  };

  const handleClassify = async () => {
    if (!task.trim()) return;
    setClassifying(true);
    setClassifiedStrategy(null);
    try {
      const res = await axios.post('/api/agents/classify', { task });
      if (res.data.success) {
        setClassifiedStrategy(res.data.strategy);
        setStrategy(res.data.strategy);
      }
    } catch (err) {
      logError('TeamsTab:classify', err);
      showToast('Strategie-Klassifikation fehlgeschlagen', 'error');
    } finally {
      setClassifying(false);
    }
  };

  const handleExecuteStreaming = async () => {
    if (!task.trim()) {
      showToast('Bitte beschreibe die Aufgabe', 'error');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setStreamEvents([]);
    setCurrentAgent(null);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/agents/execute/stream`, {
        method: 'POST',
        headers: getApiFetchHeaders('application/json'),
        body: JSON.stringify({
          task,
          aiContext: context,
          strategy,
          skipReview: strategy === 'write_only' || strategy === 'code_solve' ? skipReview : undefined,
          templateId: selectedTemplate,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      eventSourceRef.current = {
        abort: () => reader.cancel(),
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();

          if (data === '[DONE]') continue;

          try {
            const event: StreamEvent = JSON.parse(data);
            setStreamEvents(prev => [...prev, event]);

            // Update UI based on event type
            if (event.type === 'agent_start' && event.agentRole) {
              setCurrentAgent({
                role: event.agentRole,
                index: event.agentIndex ?? 0,
                total: event.totalAgents ?? 1,
                subTask: event.subTask ?? '',
              });
            } else if (event.type === 'agent_complete' || event.type === 'agent_error') {
              // Agent finished, clear current
            } else if (event.type === 'result') {
              // Final result
              setResult({
                teamId: event.teamId ?? '',
                finalOutput: event.finalOutput ?? '',
                strategy: event.strategy ?? strategy,
                agents: event.agents ?? [],
                stats: event.stats ?? { executionTimeMs: 0, totalTokens: 0, sharedMemoryEntries: 0 },
              });
              setCurrentAgent(null);
              loadHistory();
              setTimeout(() => {
                resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            } else if (event.type === 'error') {
              setError(event.error || 'Unbekannter Fehler');
              setCurrentAgent(null);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logError('TeamsTab:executeStreaming', err);
      // Fallback to non-streaming
      await handleExecuteFallback();
      return;
    } finally {
      setLoading(false);
      setCurrentAgent(null);
      eventSourceRef.current = null;
    }
  };

  // Fallback to regular execution if streaming fails
  const handleExecuteFallback = async () => {
    try {
      const res = await axios.post(
        '/api/agents/execute',
        {
          task,
          aiContext: context,
          strategy,
          skipReview: strategy === 'write_only' || strategy === 'code_solve' ? skipReview : undefined,
        },
        { timeout: 120000 }
      );

      if (res.data.success) {
        setResult(res.data);
        loadHistory();
      } else {
        setError(res.data.error || 'Ausfuehrung fehlgeschlagen');
      }
    } catch (err) {
      logError('TeamsTab:executeFallback', err);
      setError('Aufgabe konnte nicht ausgefuehrt werden. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsIdea = async (executionId: string) => {
    setSavingIdeaId(executionId);
    try {
      const res = await axios.post(`/api/agents/history/${executionId}/save-as-idea`, { context });
      if (res.data.success) {
        showToast('Als Gedanke gespeichert', 'success');
        loadHistory();
      }
    } catch (err) {
      logError('TeamsTab:saveAsIdea', err);
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      setSavingIdeaId(null);
    }
  };

  const applyTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template.id);
    setStrategy(template.strategy as Strategy);
    if (template.skipReview !== undefined) setSkipReview(template.skipReview);
    setShowTemplates(false);
    showToast(`Template "${template.name}" angewendet`, 'success');
  };

  return (
    <>
      {/* Analytics Panel */}
      {showAnalytics && analytics && (
        <div className="agent-analytics liquid-glass neuro-stagger-item">
          <h3>Agent Analytics (letzte 30 Tage)</h3>
          <div className="analytics-totals">
            <div className="analytics-stat">
              <span className="analytics-stat-value">{analytics.totals.executions}</span>
              <span className="analytics-stat-label">Ausfuehrungen</span>
            </div>
            <div className="analytics-stat">
              <span className="analytics-stat-value analytics-success">{analytics.totals.successRate}%</span>
              <span className="analytics-stat-label">Erfolgsrate</span>
            </div>
            <div className="analytics-stat">
              <span className="analytics-stat-value">{analytics.totals.tokens.toLocaleString('de-DE')}</span>
              <span className="analytics-stat-label">Tokens gesamt</span>
            </div>
          </div>
          {analytics.byStrategy.length > 0 && (
            <div className="analytics-strategies">
              {analytics.byStrategy.map(s => (
                <div key={s.strategy} className="analytics-strategy-row">
                  <span className="strategy-name">
                    {STRATEGIES.find(st => st.id === s.strategy)?.icon || '🤖'}{' '}
                    {STRATEGIES.find(st => st.id === s.strategy)?.label || s.strategy}
                  </span>
                  <span className="strategy-stats">
                    {s.count}x | {formatDuration(s.avgExecutionTime)} avg | ~{s.avgTokens.toLocaleString('de-DE')} Tokens
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Templates Section */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <div className="section-header-row">
          <h3>Aufgabe beschreiben</h3>
          <button
            type="button"
            className="templates-toggle neuro-hover-lift"
            onClick={() => setShowTemplates(!showTemplates)}
          >
            {showTemplates ? '\u2715 Schliessen' : '\uD83D\uDCCB Templates'}
          </button>
        </div>

        {showTemplates && templates.length > 0 && (
          <div className="templates-grid neuro-stagger-item">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`template-card neuro-hover-lift ${selectedTemplate === t.id ? 'active' : ''}`}
                onClick={() => applyTemplate(t)}
              >
                <span className="template-icon">{t.icon}</span>
                <span className="template-name">{t.name}</span>
                <span className="template-desc">{t.description}</span>
              </button>
            ))}
          </div>
        )}

        <textarea
          className="agent-task-input liquid-glass-input"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Beschreibe die Aufgabe, die das Agent-Team bearbeiten soll..."
          rows={4}
          disabled={loading}
          aria-label="Aufgabenbeschreibung fuer Agent-Team"
        />
        <div className="task-actions">
          <button
            type="button"
            className="classify-btn neuro-hover-lift neuro-focus-ring"
            onClick={handleClassify}
            disabled={!task.trim() || classifying || loading}
          >
            {classifying ? 'Analysiere...' : '\uD83D\uDD0E Strategie erkennen'}
          </button>
          {classifiedStrategy && (
            <span className="classified-badge neuro-stagger-item">
              Empfohlen: {STRATEGIES.find(s => s.id === classifiedStrategy)?.label || classifiedStrategy}
            </span>
          )}
          {selectedTemplate && (
            <span className="template-badge neuro-stagger-item">
              \uD83D\uDCCB {templates.find(t => t.id === selectedTemplate)?.name}
              <button
                type="button"
                className="clear-template"
                onClick={() => setSelectedTemplate(null)}
              >
                \u2715
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Strategy Selection */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <h3>Strategie waehlen</h3>
        <div className="strategy-grid">
          {STRATEGIES.map((s, index) => (
            <button
              key={s.id}
              type="button"
              className={`strategy-card neuro-hover-lift neuro-stagger-item ${strategy === s.id ? 'active' : ''}`}
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => setStrategy(s.id)}
              disabled={loading}
            >
              <span className="strategy-icon">{s.icon}</span>
              <span className="strategy-label">{s.label}</span>
              <span className="strategy-desc">{s.desc}</span>
            </button>
          ))}
        </div>
        {(strategy === 'write_only' || strategy === 'code_solve') && (
          <label className="skip-review-toggle neuro-stagger-item">
            <input
              type="checkbox"
              checked={skipReview}
              onChange={(e) => setSkipReview(e.target.checked)}
              disabled={loading}
            />
            <span>Review ueberspringen</span>
          </label>
        )}
      </div>

      {/* Execute Button */}
      <button
        type="button"
        className="execute-btn neuro-button neuro-stagger-item"
        onClick={handleExecuteStreaming}
        disabled={loading || !task.trim()}
      >
        {loading ? (
          <>
            <span className="loading-spinner" />
            Agents arbeiten...
          </>
        ) : (
          <>🚀 Aufgabe starten</>
        )}
      </button>

      {/* Streaming Progress */}
      {loading && (
        <div className="streaming-progress liquid-glass neuro-stagger-item">
          {currentAgent ? (
            <div className="current-agent-progress">
              <div className="progress-header">
                <span className="progress-agent-icon">
                  {ROLE_CONFIG[currentAgent.role]?.icon || '🤖'}
                </span>
                <span className="progress-agent-label">
                  {ROLE_CONFIG[currentAgent.role]?.label || currentAgent.role}
                </span>
                <span className="progress-step">
                  Schritt {currentAgent.index + 1} / {currentAgent.total}
                </span>
              </div>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${((currentAgent.index + 0.5) / currentAgent.total) * 100}%` }}
                />
              </div>
              {currentAgent.subTask && (
                <p className="progress-subtask">{currentAgent.subTask}</p>
              )}
            </div>
          ) : (
            <div className="progress-init">
              <span className="loading-spinner" />
              <span>Aufgabe wird zerlegt und Pipeline vorbereitet...</span>
            </div>
          )}

          {/* Completed agents during streaming */}
          {streamEvents
            .filter(e => e.type === 'agent_complete' || e.type === 'agent_error')
            .map((e, i) => {
              const config = ROLE_CONFIG[e.agentRole || ''] || { icon: '🤖', label: e.agentRole || 'Agent', color: '#888' };
              return (
                <div key={`${e.agentRole || 'agent'}-${i}`} className={`stream-agent-done ${e.type === 'agent_complete' ? 'success' : 'failed'}`}>
                  <span>{config.icon} {config.label}</span>
                  <span className={e.type === 'agent_complete' ? 'done-success' : 'done-failed'}>
                    {e.type === 'agent_complete' ? '\u2713' : '\u2717'}
                  </span>
                  {e.result?.executionTimeMs && (
                    <span className="done-time">{formatDuration(e.result.executionTimeMs)}</span>
                  )}
                  {e.result?.toolsUsed && e.result.toolsUsed.length > 0 && (
                    <span className="done-tools">{e.result.toolsUsed.join(', ')}</span>
                  )}
                </div>
              );
            })}

          <p className="loading-hint">Druecke Escape zum Abbrechen</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="agent-error liquid-glass neuro-stagger-item">
          <span className="error-icon">\u26A0\uFE0F</span>
          <p>{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="agent-results" ref={resultRef}>
          {/* Execution Stats */}
          <div className="execution-stats liquid-glass neuro-stagger-item">
            <div className="stat-item">
              <span className="stat-label">Strategie</span>
              <span className="stat-value">
                {STRATEGIES.find(s => s.id === result.strategy)?.label || result.strategy}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Dauer</span>
              <span className="stat-value">{formatDuration(result.stats.executionTimeMs)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Tokens</span>
              <span className="stat-value">{formatTokens(result.stats.totalTokens)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Shared Memory</span>
              <span className="stat-value">{result.stats.sharedMemoryEntries} Eintraege</span>
            </div>
          </div>

          {/* Per-Agent Results */}
          <div className="agent-cards">
            {result.agents.map((agent, index) => {
              const config = ROLE_CONFIG[agent.role] || { icon: '🤖', label: agent.role, color: '#888' };
              return (
                <div
                  key={`${agent.role}-${index}`}
                  className={`agent-card liquid-glass neuro-hover-lift neuro-stagger-item ${agent.success ? 'success' : 'failed'}`}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="agent-card-header">
                    <span className="agent-role-icon">{config.icon}</span>
                    <span className="agent-role-label">{config.label}</span>
                    <span className={`agent-status-badge ${agent.success ? 'success' : 'failed'}`}>
                      {agent.success ? '\u2713 Erfolgreich' : '\u2717 Fehler'}
                    </span>
                  </div>
                  <div className="agent-card-meta">
                    <span className="agent-duration">{formatDuration(agent.executionTimeMs)}</span>
                    {agent.toolsUsed.length > 0 && (
                      <span className="agent-tools">
                        Tools: {agent.toolsUsed.join(', ')}
                      </span>
                    )}
                  </div>
                  {agent.error && (
                    <div className="agent-error-detail">{agent.error}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Final Output */}
          <div className="final-output liquid-glass neuro-stagger-item">
            <h3>Ergebnis</h3>
            <div className="final-output-content">
              {result.finalOutput}
            </div>
          </div>

          {/* New Task Button */}
          <button
            type="button"
            className="new-task-btn neuro-hover-lift neuro-focus-ring"
            onClick={() => {
              setResult(null);
              setTask('');
              setClassifiedStrategy(null);
              setSelectedTemplate(null);
              setError(null);
              setStreamEvents([]);
            }}
          >
            + Neue Aufgabe
          </button>
        </div>
      )}

      {/* Empty state when no history and no result */}
      {history.length === 0 && !result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Bot size={40} strokeWidth={1.5} style={{ marginBottom: '16px', opacity: 0.6 }} />
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--text-primary)' }}>Keine Ausfuehrungen</h3>
          <p style={{ margin: '0 0 16px', fontSize: '14px', maxWidth: '360px' }}>Starte dein erstes KI-Team um komplexe Aufgaben zu loesen.</p>
          <button className="ds-button ds-button--primary ds-button--sm" type="button" onClick={() => { setTask(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            Team starten
          </button>
        </div>
      )}

      {/* History Section */}
      {history.length > 0 && (
        <div className="agent-history-section neuro-stagger-item">
          <h3>Verlauf</h3>
          <div className="history-list">
            {history.map((entry) => (
              <div
                key={entry.id}
                className={`history-card liquid-glass neuro-hover-lift ${expandedHistoryId === entry.id ? 'expanded' : ''}`}
              >
                <button
                  type="button"
                  className="history-card-header"
                  onClick={() => setExpandedHistoryId(expandedHistoryId === entry.id ? null : entry.id)}
                >
                  {entry.status && entry.status !== 'completed' && entry.status !== 'failed' ? (
                    <span
                      className="history-status-badge"
                      style={{ background: `${EXECUTION_STATUS_LABELS[entry.status]?.color || '#888'}22`, color: EXECUTION_STATUS_LABELS[entry.status]?.color || '#888' }}
                    >
                      {EXECUTION_STATUS_LABELS[entry.status]?.label || entry.status}
                    </span>
                  ) : (
                    <span className={`history-status ${entry.success ? 'success' : 'failed'}`}>
                      {entry.success ? '\u2713' : '\u2717'}
                    </span>
                  )}
                  <span className="history-task">{entry.task.substring(0, 80)}{entry.task.length > 80 ? '...' : ''}</span>
                  <span className="history-meta">
                    {STRATEGIES.find(s => s.id === entry.strategy)?.icon || '🤖'}{' '}
                    {formatDuration(entry.executionTimeMs)}
                  </span>
                  <span className="history-date">
                    {new Date(entry.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
                {expandedHistoryId === entry.id && (
                  <div className="history-card-body">
                    {entry.pauseReason && (
                      <div className="history-pause-reason">
                        Pausiert: {entry.pauseReason}
                      </div>
                    )}
                    {entry.checkpointStep != null && entry.checkpointStep > 0 && (
                      <div className="history-checkpoint-info">
                        Checkpoint bei Schritt {entry.checkpointStep}
                      </div>
                    )}
                    <div className="history-output">{entry.finalOutput}</div>
                    <div className="history-actions">
                      {(entry.status === 'running') && (
                        <>
                          <button
                            type="button"
                            className="agent-control-btn pause-btn"
                            onClick={() => handlePauseExecution(entry.id)}
                          >
                            Pausieren
                          </button>
                          <button
                            type="button"
                            className="agent-control-btn cancel-btn"
                            onClick={() => handleCancelExecution(entry.id)}
                          >
                            Abbrechen
                          </button>
                        </>
                      )}
                      {(entry.status === 'paused' || entry.status === 'awaiting_approval') && (
                        <button
                          type="button"
                          className="agent-control-btn cancel-btn"
                          onClick={() => handleCancelExecution(entry.id)}
                        >
                          Abbrechen
                        </button>
                      )}
                      {entry.status === 'awaiting_approval' && (
                        <span className="governance-link-hint">
                          Genehmigung in Einstellungen &rarr; Governance
                        </span>
                      )}
                      {!entry.savedAsIdeaId && entry.finalOutput && (
                        <button
                          type="button"
                          className="save-idea-btn neuro-hover-lift"
                          onClick={() => handleSaveAsIdea(entry.id)}
                          disabled={savingIdeaId === entry.id}
                        >
                          {savingIdeaId === entry.id ? 'Speichere...' : '\uD83D\uDCA1 Als Gedanke speichern'}
                        </button>
                      )}
                      {entry.savedAsIdeaId && (
                        <span className="saved-badge">\uD83D\uDCA1 Gespeichert</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
