import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './ProactiveDashboard.css';

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
        axios.get('/api/proactive/suggestions', { signal }),
        axios.get('/api/proactive/routines', { signal }),
        axios.get('/api/proactive/stats', { signal })
      ]);
      setSuggestions(suggestionsRes.data.suggestions || []);
      setRoutines(routinesRes.data.routines || []);
      setStats(statsRes.data);
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;

      console.error('Failed to load proactive data:', err);
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
  }, []);

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
      await axios.post(`/api/proactive/suggestions/${id}/accept`);
      setSuggestions(prev =>
        prev.map(s => s.id === id ? { ...s, status: 'accepted' } : s)
      );
      showToast('Vorschlag angenommen!', 'success');
    } catch (err) {
      console.error('Failed to accept suggestion:', err);
      showToast('Fehler beim Annehmen', 'error');
    }
  };

  const handleDismissSuggestion = async (id: string) => {
    try {
      await axios.post(`/api/proactive/suggestions/${id}/dismiss`);
      setSuggestions(prev =>
        prev.map(s => s.id === id ? { ...s, status: 'dismissed' } : s)
      );
      showToast('Vorschlag abgelehnt', 'info');
    } catch (err) {
      console.error('Failed to dismiss suggestion:', err);
      showToast('Fehler beim Ablehnen', 'error');
    }
  };

  const handleToggleRoutine = async (id: string, enabled: boolean) => {
    try {
      await axios.patch(`/api/proactive/routines/${id}`, { enabled });
      setRoutines(prev =>
        prev.map(r => r.id === id ? { ...r, enabled } : r)
      );
      showToast(enabled ? 'Routine aktiviert' : 'Routine deaktiviert', 'success');
    } catch (err) {
      console.error('Failed to toggle routine:', err);
      showToast('Fehler beim Aktualisieren', 'error');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await axios.put('/api/proactive/settings', settings);
      showToast('Einstellungen gespeichert!', 'success');
    } catch (err) {
      console.error('Failed to save settings:', err);
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
      <div className="proactive-dashboard">
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade AI-Vorschläge...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="proactive-dashboard">
      <div className="proactive-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h1>✨ Proaktive AI</h1>
        <span className={`context-indicator ${context}`}>
          {context === 'personal' ? '🏠 Privat' : '💼 Arbeit'}
        </span>
      </div>

      <div className="proactive-tabs">
        <button
          className={`tab-btn ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          💡 Vorschläge
          {pendingSuggestions.length > 0 && (
            <span className="badge">{pendingSuggestions.length}</span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === 'routines' ? 'active' : ''}`}
          onClick={() => setActiveTab('routines')}
        >
          🔄 Routinen
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Einstellungen
        </button>
      </div>

      {activeTab === 'suggestions' && (
        <div className="suggestions-content">
          {stats && (
            <div className="stats-bar">
              <div className="stat-item">
                <span className="stat-label">Gesamt</span>
                <span className="stat-value">{stats.total_suggestions}</span>
              </div>
              <div className="stat-item accepted">
                <span className="stat-label">Angenommen</span>
                <span className="stat-value">{stats.accepted}</span>
              </div>
              <div className="stat-item dismissed">
                <span className="stat-label">Abgelehnt</span>
                <span className="stat-value">{stats.dismissed}</span>
              </div>
              <div className="stat-item rate">
                <span className="stat-label">Akzeptanzrate</span>
                <span className="stat-value">{Math.round(stats.acceptance_rate * 100)}%</span>
              </div>
            </div>
          )}

          {pendingSuggestions.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✨</span>
              <h3>Keine neuen Vorschläge</h3>
              <p>Die AI analysiert deine Aktivitäten und schlägt relevante Aktionen vor.</p>
            </div>
          ) : (
            <div className="suggestions-list">
              {pendingSuggestions.map(suggestion => (
                <div key={suggestion.id} className="suggestion-card">
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
                      className="action-btn accept"
                      onClick={() => handleAcceptSuggestion(suggestion.id)}
                    >
                      ✓ Annehmen
                    </button>
                    <button
                      className="action-btn dismiss"
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

      {activeTab === 'routines' && (
        <div className="routines-content">
          {routines.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🔄</span>
              <h3>Keine Routinen erkannt</h3>
              <p>Die AI erkennt automatisch wiederkehrende Muster in deinem Verhalten.</p>
            </div>
          ) : (
            <div className="routines-list">
              {routines.map(routine => (
                <div key={routine.id} className={`routine-card ${routine.enabled ? '' : 'disabled'}`}>
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
        <div className="settings-content">
          <div className="settings-section">
            <h3>Allgemein</h3>
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">Proaktive Vorschläge</span>
                <span className="setting-desc">AI analysiert und schlägt Aktionen vor</span>
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
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">Benachrichtigungen</span>
                <span className="setting-desc">Push-Benachrichtigungen für neue Vorschläge</span>
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
            <div className="setting-item">
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

          <div className="settings-section">
            <h3>Vorschlags-Häufigkeit</h3>
            <div className="frequency-options">
              {[
                { id: 'low', label: 'Wenig', desc: 'Nur wichtige Vorschläge' },
                { id: 'medium', label: 'Mittel', desc: 'Ausgewogene Menge' },
                { id: 'high', label: 'Viel', desc: 'Alle möglichen Vorschläge' },
              ].map(option => (
                <button
                  key={option.id}
                  className={`frequency-option ${settings.suggestion_frequency === option.id ? 'active' : ''}`}
                  onClick={() => setSettings(prev => ({ ...prev, suggestion_frequency: option.id }))}
                >
                  <span className="frequency-label">{option.label}</span>
                  <span className="frequency-desc">{option.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="save-btn" onClick={handleSaveSettings}>
            💾 Einstellungen speichern
          </button>
        </div>
      )}
    </div>
  );
}
