import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './AutomationDashboard.css';

interface AutomationDashboardProps {
  context: 'personal' | 'work';
  onBack: () => void;
}

interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: {
    type: 'webhook' | 'schedule' | 'event' | 'manual' | 'pattern';
    config: Record<string, unknown>;
  };
  actions: Array<{
    type: string;
    config: Record<string, unknown>;
    order: number;
  }>;
  is_active: boolean;
  is_system: boolean;
  run_count: number;
  success_count: number;
  failure_count: number;
  last_run_at: string | null;
  created_at: string;
}

interface AutomationSuggestion {
  id: string;
  name: string;
  description: string;
  reasoning: string;
  confidence: number;
  sample_matches: number;
  trigger: {
    type: string;
    config: Record<string, unknown>;
  };
  actions: Array<{
    type: string;
    config: Record<string, unknown>;
    order: number;
  }>;
}

interface AutomationStats {
  total_automations: number;
  active_automations: number;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  success_rate: number;
  pending_suggestions: number;
  automations_by_trigger: Record<string, number>;
  top_automations: Array<{
    id: string;
    name: string;
    run_count: number;
    success_rate: number;
  }>;
}

const TRIGGER_LABELS: Record<string, { label: string; icon: string }> = {
  webhook: { label: 'Webhook', icon: '🔗' },
  schedule: { label: 'Zeitplan', icon: '⏰' },
  event: { label: 'Event', icon: '📡' },
  manual: { label: 'Manuell', icon: '👆' },
  pattern: { label: 'Muster', icon: '🎯' },
};

const ACTION_LABELS: Record<string, string> = {
  webhook_call: 'Webhook aufrufen',
  notification: 'Benachrichtigung',
  tag_idea: 'Idee taggen',
  set_priority: 'Priorität setzen',
  create_task: 'Aufgabe erstellen',
  slack_message: 'Slack-Nachricht',
  email: 'E-Mail senden',
  custom: 'Benutzerdefiniert',
};

export function AutomationDashboard({ context, onBack }: AutomationDashboardProps) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [suggestions, setSuggestions] = useState<AutomationSuggestion[]>([]);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'automations' | 'suggestions' | 'stats'>('automations');
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null);
  const [generating, setGenerating] = useState(false);

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const [autoRes, suggestRes, statsRes] = await Promise.all([
        axios.get(`/api/${context}/automations`, { signal }),
        axios.get(`/api/${context}/automations/suggestions`, { signal }),
        axios.get(`/api/${context}/automations/stats`, { signal }),
      ]);

      setAutomations(autoRes.data.automations || []);
      setSuggestions(suggestRes.data.suggestions || []);
      setStats(statsRes.data.stats || null);
      setError(null);
    } catch (err: unknown) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;

      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Laden fehlgeschlagen'
        : 'Laden fehlgeschlagen';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    // Abort any previous request
    abortControllerRef.current?.abort();

    // Create new AbortController
    abortControllerRef.current = new AbortController();
    loadData(abortControllerRef.current.signal);

    // Cleanup: abort on unmount or context change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadData]);

  // Manual reload handler (for retry button and after actions)
  const handleReload = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadData(abortControllerRef.current.signal);
  }, [loadData]);

  const handleToggleAutomation = async (id: string) => {
    try {
      await axios.post(`/api/${context}/automations/${id}/toggle`);
      showToast('Automation aktualisiert', 'success');
      handleReload();
    } catch (err) {
      showToast('Fehler beim Aktualisieren', 'error');
    }
  };

  const handleDeleteAutomation = async (id: string) => {
    if (!window.confirm('Automation wirklich löschen?')) return;

    try {
      await axios.delete(`/api/${context}/automations/${id}`);
      showToast('Automation gelöscht', 'success');
      setSelectedAutomation(null);
      handleReload();
    } catch (err) {
      showToast('Fehler beim Löschen', 'error');
    }
  };

  const handleExecuteAutomation = async (id: string) => {
    try {
      await axios.post(`/api/${context}/automations/${id}/execute`, {
        trigger_data: { manual: true, timestamp: new Date().toISOString() },
      });
      showToast('Automation ausgeführt', 'success');
      handleReload();
    } catch (err) {
      showToast('Ausführung fehlgeschlagen', 'error');
    }
  };

  const handleAcceptSuggestion = async (id: string) => {
    try {
      await axios.post(`/api/${context}/automations/suggestions/${id}/accept`);
      showToast('Vorschlag akzeptiert, Automation erstellt', 'success');
      handleReload();
    } catch (err) {
      showToast('Fehler beim Akzeptieren', 'error');
    }
  };

  const handleDismissSuggestion = async (id: string) => {
    try {
      await axios.post(`/api/${context}/automations/suggestions/${id}/dismiss`);
      showToast('Vorschlag abgelehnt', 'info');
      handleReload();
    } catch (err) {
      showToast('Fehler beim Ablehnen', 'error');
    }
  };

  const handleGenerateSuggestions = async () => {
    try {
      setGenerating(true);
      const res = await axios.post(`/api/${context}/automations/suggestions/generate`);
      showToast(`${res.data.count} neue Vorschläge generiert`, 'success');
      handleReload();
    } catch (err) {
      showToast('Fehler beim Generieren', 'error');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="automation-dashboard">
        <header className="automation-header">
          <button type="button" className="back-btn" onClick={onBack}>← Zurück</button>
          <h1>Automationen</h1>
        </header>
        <div className="loading-state">Lade Automationen...</div>
      </div>
    );
  }

  return (
    <div className="automation-dashboard">
      <header className="automation-header">
        <button type="button" className="back-btn" onClick={onBack}>← Zurück</button>
        <h1>Automationen</h1>
        <span className="context-badge">{context === 'work' ? '💼 Work' : '🏠 Personal'}</span>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" onClick={handleReload}>Erneut versuchen</button>
        </div>
      )}

      {/* Quick Stats */}
      {stats && (
        <div className="quick-stats">
          <div className="stat-item">
            <span className="stat-value">{stats.active_automations}</span>
            <span className="stat-label">Aktiv</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.total_executions}</span>
            <span className="stat-label">Ausführungen</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{Math.round(stats.success_rate * 100)}%</span>
            <span className="stat-label">Erfolgsrate</span>
          </div>
          <div className="stat-item highlight">
            <span className="stat-value">{stats.pending_suggestions}</span>
            <span className="stat-label">Vorschläge</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'automations' ? 'active' : ''}`}
          onClick={() => setActiveTab('automations')}
        >
          Automationen ({automations.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          Vorschläge ({suggestions.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Statistiken
        </button>
      </div>

      {/* Content */}
      <div className="tab-content">
        {activeTab === 'automations' && (
          <div className="automations-list">
            {automations.length === 0 ? (
              <div className="empty-state">
                <p>Noch keine Automationen erstellt.</p>
                <p className="hint">Schau dir die Vorschläge an - das System erkennt Muster in deiner Nutzung.</p>
              </div>
            ) : (
              automations.map((automation) => (
                <div
                  key={automation.id}
                  className={`automation-card ${!automation.is_active ? 'inactive' : ''} ${selectedAutomation?.id === automation.id ? 'selected' : ''}`}
                  onClick={() => setSelectedAutomation(selectedAutomation?.id === automation.id ? null : automation)}
                >
                  <div className="automation-header-row">
                    <span className="trigger-icon">
                      {TRIGGER_LABELS[automation.trigger.type]?.icon || '⚡'}
                    </span>
                    <h3>{automation.name}</h3>
                    <span className={`status-badge ${automation.is_active ? 'active' : 'inactive'}`}>
                      {automation.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </div>

                  <p className="automation-description">{automation.description}</p>

                  <div className="automation-meta">
                    <span className="trigger-type">
                      {TRIGGER_LABELS[automation.trigger.type]?.label || automation.trigger.type}
                    </span>
                    <span className="run-stats">
                      {automation.run_count} Ausführungen
                      {automation.run_count > 0 && (
                        <span className="success-rate">
                          ({Math.round((automation.success_count / automation.run_count) * 100)}% erfolgreich)
                        </span>
                      )}
                    </span>
                  </div>

                  {selectedAutomation?.id === automation.id && (
                    <div className="automation-details">
                      <div className="detail-section">
                        <h4>Aktionen</h4>
                        <ul className="actions-list">
                          {automation.actions.map((action, i) => (
                            <li key={i}>
                              {ACTION_LABELS[action.type] || action.type}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="automation-actions">
                        <button
                          type="button"
                          className="action-btn toggle"
                          onClick={(e) => { e.stopPropagation(); handleToggleAutomation(automation.id); }}
                        >
                          {automation.is_active ? '⏸ Deaktivieren' : '▶ Aktivieren'}
                        </button>
                        <button
                          type="button"
                          className="action-btn execute"
                          onClick={(e) => { e.stopPropagation(); handleExecuteAutomation(automation.id); }}
                        >
                          ▶ Jetzt ausführen
                        </button>
                        {!automation.is_system && (
                          <button
                            type="button"
                            className="action-btn delete"
                            onClick={(e) => { e.stopPropagation(); handleDeleteAutomation(automation.id); }}
                          >
                            🗑 Löschen
                          </button>
                        )}
                      </div>

                      {automation.last_run_at && (
                        <p className="last-run">
                          Letzte Ausführung: {new Date(automation.last_run_at).toLocaleString('de-DE')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'suggestions' && (
          <div className="suggestions-section">
            <div className="suggestions-header">
              <p className="suggestions-intro">
                Basierend auf deinen Nutzungsmustern schlägt die KI folgende Automationen vor:
              </p>
              <button
                type="button"
                className="generate-btn"
                onClick={handleGenerateSuggestions}
                disabled={generating}
              >
                {generating ? 'Analysiere...' : '🔄 Neue Vorschläge generieren'}
              </button>
            </div>

            {suggestions.length === 0 ? (
              <div className="empty-state">
                <p>Keine offenen Vorschläge.</p>
                <p className="hint">Das System analysiert kontinuierlich deine Nutzung und schlägt passende Automationen vor.</p>
              </div>
            ) : (
              <div className="suggestions-list">
                {suggestions.map((suggestion) => (
                  <div key={suggestion.id} className="suggestion-card">
                    <div className="suggestion-header">
                      <h3>{suggestion.name}</h3>
                      <span className="confidence-badge">
                        {Math.round(suggestion.confidence * 100)}% Konfidenz
                      </span>
                    </div>

                    <p className="suggestion-description">{suggestion.description}</p>

                    <div className="suggestion-reasoning">
                      <strong>Begründung:</strong> {suggestion.reasoning}
                    </div>

                    <p className="sample-matches">
                      Basiert auf {suggestion.sample_matches} übereinstimmenden Einträgen
                    </p>

                    <div className="suggestion-actions">
                      <button
                        type="button"
                        className="accept-btn"
                        onClick={() => handleAcceptSuggestion(suggestion.id)}
                      >
                        ✓ Akzeptieren
                      </button>
                      <button
                        type="button"
                        className="dismiss-btn"
                        onClick={() => handleDismissSuggestion(suggestion.id)}
                      >
                        ✕ Ablehnen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && stats && (
          <div className="stats-section">
            <div className="stats-grid">
              <div className="stat-card">
                <h4>Übersicht</h4>
                <div className="stat-rows">
                  <div className="stat-row">
                    <span>Gesamt Automationen</span>
                    <span>{stats.total_automations}</span>
                  </div>
                  <div className="stat-row">
                    <span>Davon aktiv</span>
                    <span>{stats.active_automations}</span>
                  </div>
                  <div className="stat-row">
                    <span>Gesamt Ausführungen</span>
                    <span>{stats.total_executions}</span>
                  </div>
                  <div className="stat-row">
                    <span>Erfolgreich</span>
                    <span className="success">{stats.successful_executions}</span>
                  </div>
                  <div className="stat-row">
                    <span>Fehlgeschlagen</span>
                    <span className="failure">{stats.failed_executions}</span>
                  </div>
                </div>
              </div>

              <div className="stat-card">
                <h4>Nach Trigger-Typ</h4>
                <div className="stat-rows">
                  {Object.entries(stats.automations_by_trigger)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => (
                      <div key={type} className="stat-row">
                        <span>{TRIGGER_LABELS[type]?.icon} {TRIGGER_LABELS[type]?.label || type}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                </div>
              </div>

              {stats.top_automations.length > 0 && (
                <div className="stat-card wide">
                  <h4>Top Automationen</h4>
                  <div className="top-list">
                    {stats.top_automations.map((auto, i) => (
                      <div key={auto.id} className="top-item">
                        <span className="rank">#{i + 1}</span>
                        <span className="name">{auto.name}</span>
                        <span className="runs">{auto.run_count} Ausführungen</span>
                        <span className="rate">{Math.round(auto.success_rate * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
