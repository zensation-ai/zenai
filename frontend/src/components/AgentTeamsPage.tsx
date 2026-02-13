/**
 * AgentTeamsPage Component
 *
 * Frontend for the Multi-Agent Task Orchestration system.
 * Allows users to submit tasks, select strategies, and view per-agent results.
 *
 * Phase 33 Sprint 3 - Agent Teams & Multi-Agent Intelligence
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import { logError } from '../utils/errors';
import '../neurodesign.css';
import './AgentTeamsPage.css';

interface AgentResult {
  role: string;
  success: boolean;
  toolsUsed: string[];
  executionTimeMs: number;
  error?: string;
}

interface TeamResult {
  teamId: string;
  finalOutput: string;
  strategy: string;
  agents: AgentResult[];
  stats: {
    executionTimeMs: number;
    totalTokens: number;
    sharedMemoryEntries: number;
  };
}

interface HistoryEntry {
  id: string;
  teamId: string;
  task: string;
  strategy: string;
  finalOutput: string;
  agents: AgentResult[];
  executionTimeMs: number;
  tokens: number;
  success: boolean;
  savedAsIdeaId?: string;
  createdAt: string;
}

type Strategy = 'research_write_review' | 'research_only' | 'write_only' | 'custom';

const STRATEGIES: { id: Strategy; label: string; icon: string; desc: string }[] = [
  { id: 'research_write_review', label: 'Komplett', icon: '🔬', desc: 'Recherche, Schreiben, Review' },
  { id: 'research_only', label: 'Recherche', icon: '🔍', desc: 'Nur Informationen sammeln' },
  { id: 'write_only', label: 'Schreiben', icon: '✍️', desc: 'Nur Content erstellen' },
  { id: 'custom', label: 'Angepasst', icon: '🛠️', desc: 'Eigene Pipeline' },
];

const ROLE_CONFIG: Record<string, { icon: string; label: string }> = {
  researcher: { icon: '🔍', label: 'Researcher' },
  writer: { icon: '✍️', label: 'Writer' },
  reviewer: { icon: '📋', label: 'Reviewer' },
};

interface AgentTeamsPageProps {
  context: string;
  onBack?: () => void;
  embedded?: boolean;
}

export function AgentTeamsPage({ context, onBack, embedded }: AgentTeamsPageProps) {
  const greeting = getTimeBasedGreeting();
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

  const abortControllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await axios.get('/api/agents/history', {
        params: { context, limit: 10 },
      });
      if (res.data.success) {
        setHistory(res.data.executions);
      }
    } catch (err) {
      logError('AgentTeamsPage:loadHistory', err);
    }
  }, [context]);

  // Load history on mount and context change
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Escape key to cancel running execution
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && loading) {
      abortControllerRef.current?.abort();
      setLoading(false);
      showToast('Ausführung abgebrochen', 'info');
    }
  }, [loading]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
      logError('AgentTeamsPage:classify', err);
      showToast('Strategie-Klassifikation fehlgeschlagen', 'error');
    } finally {
      setClassifying(false);
    }
  };

  const handleExecute = async () => {
    if (!task.trim()) {
      showToast('Bitte beschreibe die Aufgabe', 'error');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const res = await axios.post(
        '/api/agents/execute',
        {
          task,
          aiContext: context,
          strategy,
          skipReview: strategy === 'write_only' ? skipReview : undefined,
        },
        { signal: abortControllerRef.current.signal, timeout: 120000 }
      );

      if (res.data.success) {
        setResult(res.data);
        loadHistory(); // Refresh history
        // Scroll to results
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } else {
        setError(res.data.error || 'Ausführung fehlgeschlagen');
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      logError('AgentTeamsPage:execute', err);
      setError('Aufgabe konnte nicht ausgeführt werden. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
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
      logError('AgentTeamsPage:saveAsIdea', err);
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      setSavingIdeaId(null);
    }
  };

  return (
    <div className="agent-teams-page neuro-page-enter">
      {!embedded && (
        <div className="agent-teams-header liquid-glass-nav">
          <button className="back-button neuro-hover-lift" onClick={onBack} type="button">
            ← Zurück
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Agent Teams</h1>
            <span className="greeting-subtext neuro-subtext-emotional">
              Multi-Agent Aufgaben orchestrieren
            </span>
          </div>
        </div>
      )}

      {/* Task Input */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <h3>Aufgabe beschreiben</h3>
        <textarea
          className="agent-task-input liquid-glass-input"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Beschreibe die Aufgabe, die das Agent-Team bearbeiten soll..."
          rows={4}
          disabled={loading}
          aria-label="Aufgabenbeschreibung für Agent-Team"
        />
        <div className="task-actions">
          <button
            type="button"
            className="classify-btn neuro-hover-lift neuro-focus-ring"
            onClick={handleClassify}
            disabled={!task.trim() || classifying || loading}
          >
            {classifying ? 'Analysiere...' : '🔎 Strategie erkennen'}
          </button>
          {classifiedStrategy && (
            <span className="classified-badge neuro-stagger-item">
              Empfohlen: {STRATEGIES.find(s => s.id === classifiedStrategy)?.label || classifiedStrategy}
            </span>
          )}
        </div>
      </div>

      {/* Strategy Selection */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <h3>Strategie wählen</h3>
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
        {strategy === 'write_only' && (
          <label className="skip-review-toggle neuro-stagger-item">
            <input
              type="checkbox"
              checked={skipReview}
              onChange={(e) => setSkipReview(e.target.checked)}
              disabled={loading}
            />
            <span>Review überspringen</span>
          </label>
        )}
      </div>

      {/* Execute Button */}
      <button
        type="button"
        className="execute-btn neuro-button neuro-stagger-item"
        onClick={handleExecute}
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
      {loading && (
        <p className="loading-hint neuro-stagger-item">
          Dies kann 30-60 Sekunden dauern. Drücke Escape zum Abbrechen.
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="agent-error liquid-glass neuro-stagger-item">
          <span className="error-icon">⚠️</span>
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
              <span className="stat-value">{result.stats.totalTokens.toLocaleString('de-DE')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Shared Memory</span>
              <span className="stat-value">{result.stats.sharedMemoryEntries} Einträge</span>
            </div>
          </div>

          {/* Per-Agent Results */}
          <div className="agent-cards">
            {result.agents.map((agent, index) => {
              const config = ROLE_CONFIG[agent.role] || { icon: '🤖', label: agent.role };
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
                      {agent.success ? '✓ Erfolgreich' : '✗ Fehler'}
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
              setError(null);
            }}
          >
            + Neue Aufgabe
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
                  <span className={`history-status ${entry.success ? 'success' : 'failed'}`}>
                    {entry.success ? '✓' : '✗'}
                  </span>
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
                    <div className="history-output">{entry.finalOutput}</div>
                    <div className="history-actions">
                      {!entry.savedAsIdeaId && (
                        <button
                          type="button"
                          className="save-idea-btn neuro-hover-lift"
                          onClick={() => handleSaveAsIdea(entry.id)}
                          disabled={savingIdeaId === entry.id}
                        >
                          {savingIdeaId === entry.id ? 'Speichere...' : '💡 Als Gedanke speichern'}
                        </button>
                      )}
                      {entry.savedAsIdeaId && (
                        <span className="saved-badge">💡 Gespeichert</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
