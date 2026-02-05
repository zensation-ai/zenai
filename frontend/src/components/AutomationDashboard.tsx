import { useState, useEffect, useCallback, useRef } from 'react';
import { AIContext } from './ContextSwitcher';
import axios from 'axios';
import { showToast } from './Toast';
import { getTimeBasedGreeting, EMPTY_STATE_MESSAGES } from '../utils/aiPersonality';
import '../neurodesign.css';
import './AutomationDashboard.css';

interface AutomationDashboardProps {
  context: AIContext;
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
  const greeting = getTimeBasedGreeting();
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
      <div className="automation-dashboard neuro-page-enter">
        <header className="automation-header liquid-glass-nav">
          <button type="button" className="back-btn neuro-hover-lift" onClick={onBack} aria-label="Zurück zur vorherigen Seite">← Zurück</button>
          <h1>Automationen</h1>
        </header>
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Automationen...</p>
          <p className="neuro-loading-submessage">Workflows werden analysiert</p>
        </div>
      </div>
    );
  }

  return (
    <div className="automation-dashboard neuro-page-enter">
      <header className="automation-header liquid-glass-nav">
        <button type="button" className="back-btn neuro-hover-lift" onClick={onBack} aria-label="Zurück zur vorherigen Seite">← Zurück</button>
        <div className="header-greeting">
          <h1>{greeting.emoji} Automationen</h1>
          <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
        </div>
        <span className="context-badge">{context === 'work' ? '💼 Work' : '🏠 Personal'}</span>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" onClick={handleReload} aria-label="Erneut versuchen">Erneut versuchen</button>
        </div>
      )}

      {/* Quick Stats */}
      {stats && (
        <div className="quick-stats neuro-flow-list">
          <div className="stat-item liquid-glass neuro-hover-lift">
            <span className="stat-value">{stats.active_automations}</span>
            <span className="stat-label">Aktiv</span>
          </div>
          <div className="stat-item liquid-glass neuro-hover-lift">
            <span className="stat-value">{stats.total_executions}</span>
            <span className="stat-label">Ausfuhrungen</span>
          </div>
          <div className="stat-item liquid-glass neuro-hover-lift">
            <span className="stat-value">{Math.round(stats.success_rate * 100)}%</span>
            <span className="stat-label">Erfolgsrate</span>
          </div>
          <div className="stat-item highlight liquid-glass neuro-hover-lift neuro-pulse-interactive">
            <span className="stat-value">{stats.pending_suggestions}</span>
            <span className="stat-label">Vorschlage</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'automations' ? 'active' : ''}`}
          onClick={() => setActiveTab('automations')}
          aria-label="Automationen anzeigen"
          aria-current={activeTab === 'automations' ? 'page' : undefined}
        >
          Automationen ({automations.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
          aria-label="Vorschlage anzeigen"
          aria-current={activeTab === 'suggestions' ? 'page' : undefined}
        >
          Vorschläge ({suggestions.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
          aria-label="Statistiken anzeigen"
          aria-current={activeTab === 'stats' ? 'page' : undefined}
        >
          Statistiken
        </button>
      </div>

      {/* Content */}
      <div className="tab-content">
        {activeTab === 'automations' && (
          <div className="automations-list neuro-flow-list">
            {automations.length === 0 ? (
              <div className="empty-state neuro-empty-state">
                <span className="neuro-empty-icon">🤖</span>
                <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.personalization.title}</h3>
                <p className="neuro-empty-description">Schau dir die Vorschlage an - das System erkennt Muster in deiner Nutzung.</p>
                <p className="neuro-empty-encouragement">{EMPTY_STATE_MESSAGES.personalization.encouragement}</p>
              </div>
            ) : (
              automations.slice(0, 7).map((automation, index) => (
                <div
                  key={automation.id}
                  className={`automation-card liquid-glass neuro-hover-lift neuro-stagger-item ${!automation.is_active ? 'inactive' : ''} ${selectedAutomation?.id === automation.id ? 'selected' : ''}`}
                  style={{ animationDelay: `${index * 50}ms` }}
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
                          className="action-btn toggle neuro-hover-lift"
                          onClick={(e) => { e.stopPropagation(); handleToggleAutomation(automation.id); }}
                          aria-label={automation.is_active ? 'Automation deaktivieren' : 'Automation aktivieren'}
                        >
                          {automation.is_active ? '⏸ Deaktivieren' : '▶ Aktivieren'}
                        </button>
                        <button
                          type="button"
                          className="action-btn execute neuro-hover-lift"
                          onClick={(e) => { e.stopPropagation(); handleExecuteAutomation(automation.id); }}
                          aria-label="Automation jetzt ausfuhren"
                        >
                          ▶ Jetzt ausführen
                        </button>
                        {!automation.is_system && (
                          <button
                            type="button"
                            className="action-btn delete neuro-hover-lift"
                            onClick={(e) => { e.stopPropagation(); handleDeleteAutomation(automation.id); }}
                            aria-label="Automation loschen"
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
            <div className="suggestions-header liquid-glass">
              <p className="suggestions-intro">
                Basierend auf deinen Nutzungsmustern schlagt die KI folgende Automationen vor:
              </p>
              <button
                type="button"
                className="generate-btn neuro-button"
                onClick={handleGenerateSuggestions}
                disabled={generating}
                aria-label="Neue Automations-Vorschlage generieren"
              >
                {generating ? 'Analysiere...' : '🔄 Neue Vorschlage generieren'}
              </button>
            </div>

            {suggestions.length === 0 ? (
              <div className="empty-state neuro-empty-state">
                <span className="neuro-empty-icon">✨</span>
                <h3 className="neuro-empty-title">Keine offenen Vorschlage</h3>
                <p className="neuro-empty-description">Das System analysiert kontinuierlich deine Nutzung und schlagt passende Automationen vor.</p>
              </div>
            ) : (
              <div className="suggestions-list neuro-flow-list">
                {suggestions.slice(0, 7).map((suggestion, index) => (
                  <div key={suggestion.id} className="suggestion-card liquid-glass neuro-hover-lift neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
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
                        className="accept-btn neuro-button"
                        onClick={() => handleAcceptSuggestion(suggestion.id)}
                        aria-label="Vorschlag akzeptieren"
                      >
                        ✓ Akzeptieren
                      </button>
                      <button
                        type="button"
                        className="dismiss-btn neuro-hover-lift"
                        onClick={() => handleDismissSuggestion(suggestion.id)}
                        aria-label="Vorschlag ablehnen"
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
            <div className="stats-grid neuro-flow-list">
              <div className="stat-card liquid-glass neuro-stagger-item">
                <h4>Ubersicht</h4>
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
                    <span>Gesamt Ausfuhrungen</span>
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

              <div className="stat-card liquid-glass neuro-stagger-item">
                <h4>Nach Trigger-Typ</h4>
                <div className="stat-rows">
                  {Object.entries(stats.automations_by_trigger)
                    .filter(([, count]) => count > 0)
                    .slice(0, 7)
                    .map(([type, count]) => (
                      <div key={type} className="stat-row neuro-stagger-item">
                        <span>{TRIGGER_LABELS[type]?.icon} {TRIGGER_LABELS[type]?.label || type}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                </div>
              </div>

              {stats.top_automations.length > 0 && (
                <div className="stat-card wide liquid-glass neuro-stagger-item">
                  <h4>Top Automationen</h4>
                  <div className="top-list neuro-flow-list">
                    {stats.top_automations.slice(0, 5).map((auto, i) => (
                      <div key={auto.id} className="top-item neuro-hover-lift neuro-stagger-item">
                        <span className="rank">#{i + 1}</span>
                        <span className="name">{auto.name}</span>
                        <span className="runs">{auto.run_count} Ausfuhrungen</span>
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
