import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
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

interface ProactiveStats {
  total_suggestions: number;
  accepted: number;
  dismissed: number;
  acceptance_rate: number;
}

interface ProactiveDashboardProps {
  onBack: () => void;
  context: string;
}

export function ProactiveDashboard({ onBack, context }: ProactiveDashboardProps) {
  const greeting = getTimeBasedGreeting();
  const [activeTab, setActiveTab] = useState<'suggestions' | 'routines' | 'settings'>('suggestions');
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [stats, setStats] = useState<ProactiveStats | null>(null);
  const [settings, setSettings] = useState({
    enabled: true,
    suggestion_frequency: 'medium',
    notification_enabled: true,
    auto_detect_routines: true
  });

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const [suggestionsRes, routinesRes, statsRes] = await Promise.all([
        axios.get(`/api/suggestions?context=${context}`, { signal }),
        axios.get(`/api/routines?context=${context}`, { signal }),
        axios.get(`/api/stats?context=${context}`, { signal })
      ]);
      setSuggestions(suggestionsRes.data.suggestions || []);
      setRoutines(routinesRes.data.routines || []);
      setStats(statsRes.data);
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;

      logError('ProactiveDashboard:loadData', err);
      // Set defaults
      setSuggestions([]);
      setRoutines([]);
      setStats({
        total_suggestions: 0,
        accepted: 0,
        dismissed: 0,
        acceptance_rate: 0
      });
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
  }, [loadData, context]);

  const handleAcceptSuggestion = async (id: string) => {
    try {
      await axios.post(`/api/suggestions/${id}/accept?context=${context}`);
      setSuggestions(prev =>
        prev.map(s => s.id === id ? { ...s, status: 'accepted' } : s)
      );
      showToast('Vorschlag angenommen!', 'success');
    } catch (err) {
      logError('ProactiveDashboard:acceptSuggestion', err);
      showToast('Fehler beim Annehmen', 'error');
    }
  };

  const handleDismissSuggestion = async (id: string) => {
    try {
      await axios.post(`/api/suggestions/${id}/dismiss?context=${context}`);
      setSuggestions(prev =>
        prev.map(s => s.id === id ? { ...s, status: 'dismissed' } : s)
      );
      showToast('Vorschlag abgelehnt', 'info');
    } catch (err) {
      logError('ProactiveDashboard:dismissSuggestion', err);
      showToast('Fehler beim Ablehnen', 'error');
    }
  };

  const handleToggleRoutine = async (id: string, enabled: boolean) => {
    try {
      await axios.patch(`/api/routines/${id}?context=${context}`, { enabled });
      setRoutines(prev =>
        prev.map(r => r.id === id ? { ...r, enabled } : r)
      );
      showToast(enabled ? 'Routine aktiviert' : 'Routine deaktiviert', 'success');
    } catch (err) {
      logError('ProactiveDashboard:toggleRoutine', err);
      showToast('Fehler beim Aktualisieren', 'error');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await axios.put(`/api/settings?context=${context}`, settings);
      showToast('Einstellungen gespeichert!', 'success');
    } catch (err) {
      logError('ProactiveDashboard:saveSettings', err);
      showToast('Fehler beim Speichern', 'error');
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
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

  if (loading) {
    return (
      <div className="proactive-dashboard neuro-page-enter">
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade AI-Vorschlage...</p>
          <p className="neuro-loading-submessage">Muster werden analysiert</p>
        </div>
      </div>
    );
  }

  return (
    <div className="proactive-dashboard neuro-page-enter">
      <div className="proactive-header liquid-glass-nav">
        <button className="back-button neuro-hover-lift" onClick={onBack}>
          ← Zurück
        </button>
        <div className="header-greeting">
          <h1>{greeting.emoji} Proaktive AI</h1>
          <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
        </div>
        <span className={`context-indicator ${context}`}>
          {context === 'personal' ? 'Persönlich' : 'Arbeit'}
        </span>
      </div>

      <div className="proactive-tabs liquid-glass">
        <button
          className={`tab-btn neuro-hover-lift ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          Vorschlage
          {pendingSuggestions.length > 0 && (
            <span className="badge">{pendingSuggestions.length}</span>
          )}
        </button>
        <button
          className={`tab-btn neuro-hover-lift ${activeTab === 'routines' ? 'active' : ''}`}
          onClick={() => setActiveTab('routines')}
        >
          Routinen
        </button>
        <button
          className={`tab-btn neuro-hover-lift ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Einstellungen
        </button>
      </div>

      {activeTab === 'suggestions' && (
        <div className="suggestions-content neuro-stagger-item">
          {stats && (
            <div className="stats-bar liquid-glass neuro-stagger-item">
              <div className="stat-item neuro-hover-lift">
                <span className="stat-label">Gesamt</span>
                <span className="stat-value">{stats.total_suggestions}</span>
              </div>
              <div className="stat-item accepted neuro-hover-lift">
                <span className="stat-label">Angenommen</span>
                <span className="stat-value">{stats.accepted}</span>
              </div>
              <div className="stat-item dismissed neuro-hover-lift">
                <span className="stat-label">Abgelehnt</span>
                <span className="stat-value">{stats.dismissed}</span>
              </div>
              <div className="stat-item rate neuro-hover-lift">
                <span className="stat-label">Akzeptanzrate</span>
                <span className="stat-value">{Math.round(stats.acceptance_rate * 100)}%</span>
              </div>
            </div>
          )}

          {pendingSuggestions.length === 0 ? (
            <div className="empty-state neuro-empty-state neuro-stagger-item">
              <span className="empty-icon neuro-empty-icon neuro-breathing">✨</span>
              <h3 className="neuro-empty-title">Keine neuen Vorschlage</h3>
              <p className="neuro-empty-description">Die AI analysiert deine Aktivitaten und schlagt relevante Aktionen vor.</p>
              <p className="neuro-empty-encouragement">Neue Vorschlage kommen bald!</p>
            </div>
          ) : (
            <div className="suggestions-list neuro-flow-list">
              {pendingSuggestions.slice(0, 7).map((suggestion, index) => (
                <div key={suggestion.id} className="suggestion-card liquid-glass neuro-stagger-item neuro-hover-lift" style={{ animationDelay: `${index * 50}ms` }}>
                  <div className="suggestion-header">
                    <span className="suggestion-icon">{getSuggestionIcon(suggestion.type)}</span>
                    <div className="suggestion-meta">
                      <span className="suggestion-type">{suggestion.type}</span>
                      <span className="suggestion-time">{formatDate(suggestion.created_at)}</span>
                    </div>
                    <div className="confidence-badge">
                      {Math.round(suggestion.confidence * 100)}% sicher
                    </div>
                  </div>
                  <h3 className="suggestion-title">{suggestion.title}</h3>
                  <p className="suggestion-description">{suggestion.description}</p>
                  <div className="suggestion-actions">
                    <button
                      className="action-btn accept neuro-button neuro-success-burst"
                      onClick={() => handleAcceptSuggestion(suggestion.id)}
                    >
                      Annehmen
                    </button>
                    <button
                      className="action-btn dismiss neuro-button"
                      onClick={() => handleDismissSuggestion(suggestion.id)}
                    >
                      Ablehnen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'routines' && (
        <div className="routines-content neuro-stagger-item">
          {routines.length === 0 ? (
            <div className="empty-state neuro-empty-state neuro-stagger-item">
              <span className="empty-icon neuro-empty-icon neuro-breathing">🔄</span>
              <h3 className="neuro-empty-title">Keine Routinen erkannt</h3>
              <p className="neuro-empty-description">Die AI erkennt automatisch wiederkehrende Muster in deinem Verhalten.</p>
              <p className="neuro-empty-encouragement">Weiter so - Muster werden bald erkannt!</p>
            </div>
          ) : (
            <div className="routines-list neuro-flow-list">
              {routines.slice(0, 7).map((routine, index) => (
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
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="settings-content neuro-stagger-item">
          <div className="settings-section liquid-glass neuro-stagger-item">
            <h3>Allgemein</h3>
            <div className="setting-item neuro-hover-lift">
              <div className="setting-info">
                <span className="setting-label">Proaktive Vorschlage</span>
                <span className="setting-desc">AI analysiert und schlagt Aktionen vor</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-item neuro-hover-lift">
              <div className="setting-info">
                <span className="setting-label">Benachrichtigungen</span>
                <span className="setting-desc">Push-Benachrichtigungen fur neue Vorschlage</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.notification_enabled}
                  onChange={(e) => setSettings(prev => ({ ...prev, notification_enabled: e.target.checked }))}
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
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div className="settings-section liquid-glass neuro-stagger-item">
            <h3>Vorschlags-Haufigkeit</h3>
            <div className="frequency-options neuro-flow-list">
              {[
                { id: 'low', label: 'Wenig', desc: 'Nur wichtige Vorschlage' },
                { id: 'medium', label: 'Mittel', desc: 'Ausgewogene Menge' },
                { id: 'high', label: 'Viel', desc: 'Alle moglichen Vorschlage' },
              ].map(option => (
                <button
                  key={option.id}
                  className={`frequency-option neuro-hover-lift ${settings.suggestion_frequency === option.id ? 'active' : ''}`}
                  onClick={() => setSettings(prev => ({ ...prev, suggestion_frequency: option.id }))}
                >
                  <span className="frequency-label">{option.label}</span>
                  <span className="frequency-desc">{option.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="save-btn neuro-button neuro-success-burst" onClick={handleSaveSettings}>
            Einstellungen speichern
          </button>
        </div>
      )}
    </div>
  );
}
