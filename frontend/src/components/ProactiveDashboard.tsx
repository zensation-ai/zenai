import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { AIContext } from './ContextSwitcher';
import { showToast } from './Toast';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import '../neurodesign.css';
import './ProactiveDashboard.css';
import { logError } from '../utils/errors';

interface Suggestion {
  id: string;
  type: 'idea' | 'routine' | 'reminder' | 'connection';
  title: string;
  description: string;
  confidence: number;
  created_at: string;
  status: 'pending' | 'accepted' | 'dismissed';
}

interface Routine {
  id: string;
  name: string;
  pattern: string;
  frequency: string;
  last_triggered: string;
  enabled: boolean;
}

interface ProactiveDashboardProps {
  onBack?: () => void;
  context: AIContext;
  embedded?: boolean;
}

const CONTEXT_LABELS: Record<AIContext, string> = {
  personal: 'Persönlich',
  work: 'Arbeit',
  learning: 'Lernen',
  creative: 'Kreativ',
};

const SUGGESTION_TYPE_LABELS: Record<string, string> = {
  idea: 'Idee',
  routine: 'Routine',
  reminder: 'Erinnerung',
  connection: 'Verbindung',
};

const INITIAL_DISPLAY_COUNT = 7;

export function ProactiveDashboard({ onBack, context, embedded }: ProactiveDashboardProps) {
  const greeting = getTimeBasedGreeting();
  const [activeTab, setActiveTab] = useState<'suggestions' | 'routines' | 'settings'>('suggestions');
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [settings, setSettings] = useState({
    enabled: true,
    suggestion_frequency: 'medium',
    notification_enabled: true,
    auto_detect_routines: true
  });
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [showAllRoutines, setShowAllRoutines] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const [suggestionsRes, routinesRes, settingsRes] = await Promise.all([
        axios.get(`/api/proactive/suggestions?context=${context}`, { signal }),
        axios.get(`/api/proactive/routines?context=${context}`, { signal }),
        axios.get(`/api/proactive/settings?context=${context}`, { signal }),
      ]);
      setSuggestions(suggestionsRes.data.suggestions || []);
      setRoutines(routinesRes.data.routines || []);
      if (settingsRes.data.settings) {
        const s = settingsRes.data.settings;
        setSettings({
          enabled: s.proactivityLevel !== 'off',
          suggestion_frequency: s.proactivityLevel === 'off' ? 'medium' : s.proactivityLevel === 'aggressive' ? 'high' : s.proactivityLevel === 'minimal' ? 'low' : 'medium',
          notification_enabled: true,
          auto_detect_routines: (s.enabledTypes || []).includes('routine'),
        });
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      logError('ProactiveDashboard:loadData', err);
      setSuggestions([]);
      setRoutines([]);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadData(abortControllerRef.current.signal);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadData, context]);

  const handleAcceptSuggestion = async (id: string) => {
    try {
      await axios.post(`/api/proactive/suggestions/${id}/accept`, { context });
      setSuggestions(prev =>
        prev.map(s => s.id === id ? { ...s, status: 'accepted' as const } : s)
      );
      showToast('Vorschlag angenommen!', 'success');
    } catch (err) {
      logError('ProactiveDashboard:acceptSuggestion', err);
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Fehler beim Annehmen'
        : 'Fehler beim Annehmen';
      showToast(message, 'error');
    }
  };

  const handleDismissSuggestion = async (id: string) => {
    try {
      await axios.post(`/api/proactive/suggestions/${id}/dismiss`, { context });
      setSuggestions(prev =>
        prev.map(s => s.id === id ? { ...s, status: 'dismissed' as const } : s)
      );
      showToast('Vorschlag abgelehnt', 'info');
    } catch (err) {
      logError('ProactiveDashboard:dismissSuggestion', err);
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Fehler beim Ablehnen'
        : 'Fehler beim Ablehnen';
      showToast(message, 'error');
    }
  };

  const handleToggleRoutine = async (id: string, enabled: boolean) => {
    try {
      await axios.patch(`/api/proactive/routines/${id}`, { context, enabled });
      setRoutines(prev =>
        prev.map(r => r.id === id ? { ...r, enabled } : r)
      );
      showToast(enabled ? 'Routine aktiviert' : 'Routine deaktiviert', 'success');
    } catch (err) {
      logError('ProactiveDashboard:toggleRoutine', err);
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Fehler beim Aktualisieren'
        : 'Fehler beim Aktualisieren';
      showToast(message, 'error');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await axios.put(`/api/proactive/settings`, { ...settings, context });
      showToast('Einstellungen gespeichert!', 'success');
    } catch (err) {
      logError('ProactiveDashboard:saveSettings', err);
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Fehler beim Speichern'
        : 'Fehler beim Speichern';
      showToast(message, 'error');
    }
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'idea': return '💡';
      case 'routine': return '🔄';
      case 'reminder': return '⏰';
      case 'connection': return '🔗';
      default: return '✨';
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);

    if (hours < 1) return 'Vor kurzem';
    if (hours < 24) return `Vor ${hours} Std.`;

    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit'
    });
  };

  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const acceptedCount = suggestions.filter(s => s.status === 'accepted').length;
  const dismissedCount = suggestions.filter(s => s.status === 'dismissed').length;
  const totalCount = suggestions.length;
  const acceptanceRate = totalCount > 0 ? acceptedCount / totalCount : 0;

  const displayedSuggestions = showAllSuggestions
    ? pendingSuggestions
    : pendingSuggestions.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMoreSuggestions = pendingSuggestions.length > INITIAL_DISPLAY_COUNT;

  const displayedRoutines = showAllRoutines
    ? routines
    : routines.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMoreRoutines = routines.length > INITIAL_DISPLAY_COUNT;

  if (loading) {
    return (
      <div className="proactive-dashboard neuro-page-enter">
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade AI-Vorschläge...</p>
          <p className="neuro-loading-submessage">Muster werden analysiert</p>
        </div>
      </div>
    );
  }

  return (
    <div className="proactive-dashboard neuro-page-enter">
      {!embedded && (
        <div className="proactive-header liquid-glass-nav">
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack} aria-label="Zurück zur vorherigen Seite">
            ← Zurück
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Proaktive AI</h1>
            <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
          </div>
          <span className={`context-indicator ${context}`}>
            {CONTEXT_LABELS[context]}
          </span>
        </div>
      )}

      <div className="proactive-tabs liquid-glass" role="tablist" aria-label="Proaktive AI Navigation">
        <button
          type="button"
          role="tab"
          id="proactive-tab-suggestions"
          aria-selected={activeTab === 'suggestions'}
          aria-controls="proactive-panel-suggestions"
          className={`tab-btn neuro-hover-lift ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          Vorschläge
          {pendingSuggestions.length > 0 && (
            <span className="badge" aria-label={`${pendingSuggestions.length} ausstehend`}>{pendingSuggestions.length}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          id="proactive-tab-routines"
          aria-selected={activeTab === 'routines'}
          aria-controls="proactive-panel-routines"
          className={`tab-btn neuro-hover-lift ${activeTab === 'routines' ? 'active' : ''}`}
          onClick={() => setActiveTab('routines')}
        >
          Routinen
        </button>
        <button
          type="button"
          role="tab"
          id="proactive-tab-settings"
          aria-selected={activeTab === 'settings'}
          aria-controls="proactive-panel-settings"
          className={`tab-btn neuro-hover-lift ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Einstellungen
        </button>
      </div>

      {activeTab === 'suggestions' && (
        <div
          className="suggestions-content neuro-stagger-item"
          id="proactive-panel-suggestions"
          role="tabpanel"
          aria-labelledby="proactive-tab-suggestions"
        >
          <div className="stats-bar liquid-glass neuro-stagger-item">
            <div className="stat-item neuro-hover-lift">
              <span className="stat-label">Gesamt</span>
              <span className="stat-value">{totalCount}</span>
            </div>
            <div className="stat-item accepted neuro-hover-lift">
              <span className="stat-label">Angenommen</span>
              <span className="stat-value">{acceptedCount}</span>
            </div>
            <div className="stat-item dismissed neuro-hover-lift">
              <span className="stat-label">Abgelehnt</span>
              <span className="stat-value">{dismissedCount}</span>
            </div>
            <div className="stat-item rate neuro-hover-lift">
              <span className="stat-label">Akzeptanzrate</span>
              <span className="stat-value">{Math.round(acceptanceRate * 100)}%</span>
            </div>
          </div>

          {pendingSuggestions.length === 0 ? (
            <div className="empty-state neuro-empty-state neuro-stagger-item">
              <span className="empty-icon neuro-empty-icon neuro-breathing">✨</span>
              <h3 className="neuro-empty-title">Keine neuen Vorschläge</h3>
              <p className="neuro-empty-description">Die AI analysiert deine Aktivitäten und schlägt relevante Aktionen vor.</p>
              <p className="neuro-empty-encouragement">Neue Vorschläge kommen bald!</p>
            </div>
          ) : (
            <div className="suggestions-list neuro-flow-list">
              {displayedSuggestions.map((suggestion, index) => (
                <div key={suggestion.id} className="suggestion-card liquid-glass neuro-stagger-item neuro-hover-lift" style={{ animationDelay: `${index * 50}ms` }}>
                  <div className="suggestion-header">
                    <span className="suggestion-icon" aria-hidden="true">{getSuggestionIcon(suggestion.type)}</span>
                    <div className="suggestion-meta">
                      <span className="suggestion-type">{SUGGESTION_TYPE_LABELS[suggestion.type] || suggestion.type}</span>
                      <span className="suggestion-time">{formatDate(suggestion.created_at)}</span>
                    </div>
                    <div className="confidence-badge" title="Konfidenz der KI-Empfehlung">
                      {Math.round(suggestion.confidence * 100)}% sicher
                    </div>
                  </div>
                  <h3 className="suggestion-title">{suggestion.title}</h3>
                  <p className="suggestion-description">{suggestion.description}</p>
                  <div className="suggestion-actions">
                    <button
                      type="button"
                      className="action-btn accept neuro-button neuro-success-burst"
                      onClick={() => handleAcceptSuggestion(suggestion.id)}
                      aria-label={`Vorschlag annehmen: ${suggestion.title}`}
                    >
                      Annehmen
                    </button>
                    <button
                      type="button"
                      className="action-btn dismiss neuro-button"
                      onClick={() => handleDismissSuggestion(suggestion.id)}
                      aria-label={`Vorschlag ablehnen: ${suggestion.title}`}
                    >
                      Ablehnen
                    </button>
                  </div>
                </div>
              ))}
              {hasMoreSuggestions && (
                <button
                  type="button"
                  className="show-more-btn neuro-hover-lift"
                  onClick={() => setShowAllSuggestions(!showAllSuggestions)}
                >
                  {showAllSuggestions
                    ? 'Weniger anzeigen'
                    : `Alle ${pendingSuggestions.length} Vorschläge anzeigen`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'routines' && (
        <div
          className="routines-content neuro-stagger-item"
          id="proactive-panel-routines"
          role="tabpanel"
          aria-labelledby="proactive-tab-routines"
        >
          {routines.length === 0 ? (
            <div className="empty-state neuro-empty-state neuro-stagger-item">
              <span className="empty-icon neuro-empty-icon neuro-breathing">🔄</span>
              <h3 className="neuro-empty-title">Keine Routinen erkannt</h3>
              <p className="neuro-empty-description">Die AI erkennt automatisch wiederkehrende Muster in deinem Verhalten.</p>
              <p className="neuro-empty-encouragement">Weiter so - Muster werden bald erkannt!</p>
            </div>
          ) : (
            <div className="routines-list neuro-flow-list">
              {displayedRoutines.map((routine, index) => (
                <div key={routine.id} className={`routine-card liquid-glass neuro-stagger-item neuro-hover-lift ${routine.enabled ? '' : 'disabled'}`} style={{ animationDelay: `${index * 50}ms` }}>
                  <div className="routine-info">
                    <h3 className="routine-name">{routine.name}</h3>
                    <p className="routine-pattern">{routine.pattern}</p>
                    <div className="routine-meta">
                      <span className="routine-frequency">{routine.frequency}</span>
                      <span className="routine-last">
                        Zuletzt: {formatDate(routine.last_triggered)}
                      </span>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={routine.enabled}
                      onChange={(e) => handleToggleRoutine(routine.id, e.target.checked)}
                      aria-label={`Routine "${routine.name}" ${routine.enabled ? 'deaktivieren' : 'aktivieren'}`}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              ))}
              {hasMoreRoutines && (
                <button
                  type="button"
                  className="show-more-btn neuro-hover-lift"
                  onClick={() => setShowAllRoutines(!showAllRoutines)}
                >
                  {showAllRoutines
                    ? 'Weniger anzeigen'
                    : `Alle ${routines.length} Routinen anzeigen`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div
          className="settings-content neuro-stagger-item"
          id="proactive-panel-settings"
          role="tabpanel"
          aria-labelledby="proactive-tab-settings"
        >
          <div className="settings-section liquid-glass neuro-stagger-item">
            <h3>Allgemein</h3>
            <div className="setting-item neuro-hover-lift">
              <div className="setting-info">
                <span className="setting-label">Proaktive Vorschläge</span>
                <span className="setting-desc">AI analysiert und schlägt Aktionen vor</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  aria-label="Proaktive Vorschläge aktivieren"
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-item neuro-hover-lift">
              <div className="setting-info">
                <span className="setting-label">Benachrichtigungen</span>
                <span className="setting-desc">Push-Benachrichtigungen für neue Vorschläge</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.notification_enabled}
                  onChange={(e) => setSettings(prev => ({ ...prev, notification_enabled: e.target.checked }))}
                  aria-label="Benachrichtigungen aktivieren"
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-item neuro-hover-lift">
              <div className="setting-info">
                <span className="setting-label">Routinen-Erkennung</span>
                <span className="setting-desc">Automatisch wiederkehrende Muster erkennen</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.auto_detect_routines}
                  onChange={(e) => setSettings(prev => ({ ...prev, auto_detect_routines: e.target.checked }))}
                  aria-label="Routinen-Erkennung aktivieren"
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div className="settings-section liquid-glass neuro-stagger-item">
            <h3>Vorschlags-Häufigkeit</h3>
            <div className="frequency-options neuro-flow-list" role="radiogroup" aria-label="Vorschlags-Häufigkeit">
              {[
                { id: 'low', label: 'Wenig', desc: 'Nur wichtige Vorschläge' },
                { id: 'medium', label: 'Mittel', desc: 'Ausgewogene Menge' },
                { id: 'high', label: 'Viel', desc: 'Alle möglichen Vorschläge' },
              ].map(option => (
                <button
                  type="button"
                  key={option.id}
                  role="radio"
                  aria-checked={settings.suggestion_frequency === option.id}
                  className={`frequency-option neuro-hover-lift ${settings.suggestion_frequency === option.id ? 'active' : ''}`}
                  onClick={() => setSettings(prev => ({ ...prev, suggestion_frequency: option.id }))}
                >
                  <span className="frequency-label">{option.label}</span>
                  <span className="frequency-desc">{option.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="save-btn neuro-button neuro-success-burst" onClick={handleSaveSettings}>
            Einstellungen speichern
          </button>
        </div>
      )}
    </div>
  );
}
