import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { getTimeBasedGreeting, EMPTY_STATE_MESSAGES } from '../utils/aiPersonality';
import '../neurodesign.css';
import './DigestDashboard.css';

interface DigestEntry {
  id: string;
  type: 'daily' | 'weekly';
  period_start: string;
  period_end: string;
  summary: string;
  highlights: string[];
  stats: {
    ideas_created: number;
    tasks_completed: number;
    meetings_held: number;
    top_categories: [string, number][];
    productivity_score: number;
  };
  recommendations: string[];
  created_at: string;
}

interface ProductivityGoals {
  daily_ideas_target: number;
  weekly_ideas_target: number;
  daily_tasks_target: number;
  weekly_tasks_target: number;
  focus_categories: string[];
  reminder_time: string | null;
}

interface DigestDashboardProps {
  onBack: () => void;
  context: string;
}

const categoryLabels: Record<string, string> = {
  business: 'Business',
  technical: 'Technik',
  personal: 'Persönlich',
  learning: 'Lernen',
};

export function DigestDashboard({ onBack, context }: DigestDashboardProps) {
  const greeting = getTimeBasedGreeting();
  const [latestDigest, setLatestDigest] = useState<DigestEntry | null>(null);
  const [digestHistory, setDigestHistory] = useState<DigestEntry[]>([]);
  const [goals, setGoals] = useState<ProductivityGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<'daily' | 'weekly' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'latest' | 'history' | 'goals'>('latest');
  const [savingGoals, setSavingGoals] = useState(false);
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalForm, setGoalForm] = useState({
    daily_ideas_target: 3,
    weekly_ideas_target: 15,
    daily_tasks_target: 5,
    weekly_tasks_target: 20,
    focus_categories: [] as string[],
    reminder_time: '',
  });

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const [latestRes, historyRes, goalsRes] = await Promise.all([
        axios.get(`/api/${context}/digest/latest`, { signal }).catch(() => ({ data: { digest: null } })),
        axios.get(`/api/${context}/digest/history?limit=10`, { signal }).catch(() => ({ data: { digests: [] } })),
        axios.get(`/api/${context}/digest/goals`, { signal }).catch(() => ({ data: { goals: null } })),
      ]);

      setLatestDigest(latestRes.data.digest);
      setDigestHistory(historyRes.data.digests || []);

      const goalsData = goalsRes.data.goals;
      if (goalsData) {
        setGoals(goalsData);
        setGoalForm({
          daily_ideas_target: goalsData.daily_ideas_target || 3,
          weekly_ideas_target: goalsData.weekly_ideas_target || 15,
          daily_tasks_target: goalsData.daily_tasks_target || 5,
          weekly_tasks_target: goalsData.weekly_tasks_target || 20,
          focus_categories: goalsData.focus_categories || [],
          reminder_time: goalsData.reminder_time || '',
        });
      }

      setError(null);
    } catch (err) {
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

  const handleGenerateDigest = async (type: 'daily' | 'weekly') => {
    try {
      setGenerating(type);
      const res = await axios.post(`/api/${context}/digest/generate/${type}`);
      setLatestDigest(res.data.digest);
      setDigestHistory(prev => [res.data.digest, ...prev]);
      showToast(`${type === 'daily' ? 'Tages' : 'Wochen'}zusammenfassung erstellt!`, 'success');
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Generierung fehlgeschlagen'
        : 'Generierung fehlgeschlagen';
      showToast(message, 'error');
    } finally {
      setGenerating(null);
    }
  };

  const handleSaveGoals = async () => {
    try {
      setSavingGoals(true);
      await axios.put(`/api/${context}/digest/goals`, goalForm);
      setGoals(goalForm as ProductivityGoals);
      setEditingGoals(false);
      showToast('Ziele gespeichert!', 'success');
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Speichern fehlgeschlagen'
        : 'Speichern fehlgeschlagen';
      showToast(message, 'error');
    } finally {
      setSavingGoals(false);
    }
  };

  const toggleFocusCategory = (category: string) => {
    setGoalForm(prev => ({
      ...prev,
      focus_categories: prev.focus_categories.includes(category)
        ? prev.focus_categories.filter(c => c !== category)
        : [...prev.focus_categories, category],
    }));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  const getProductivityColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  if (loading) {
    return (
      <div className="digest-dashboard neuro-page-enter">
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Zusammenfassungen...</p>
          <p className="neuro-loading-submessage">Deine Produktivitat wird analysiert</p>
        </div>
      </div>
    );
  }

  return (
    <div className="digest-dashboard neuro-page-enter">
      <div className="digest-header liquid-glass-nav">
        <button type="button" className="back-button neuro-hover-lift" onClick={onBack} aria-label="Zuruck zur vorherigen Seite">
          ← Zuruck
        </button>
        <div className="header-greeting">
          <h1>{greeting.emoji} Zusammenfassungen</h1>
          <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
        </div>
        <span className={`context-indicator ${context}`}>
          {context === 'personal' ? '🏠 Privat' : '💼 Arbeit'}
        </span>
        <div className="generate-buttons">
          <button
            type="button"
            className="generate-btn daily neuro-button"
            onClick={() => handleGenerateDigest('daily')}
            disabled={generating !== null}
            aria-label="Tagesdigest generieren"
          >
            {generating === 'daily' ? '...' : '📅 Tagesdigest'}
          </button>
          <button
            type="button"
            className="generate-btn weekly neuro-button"
            onClick={() => handleGenerateDigest('weekly')}
            disabled={generating !== null}
            aria-label="Wochendigest generieren"
          >
            {generating === 'weekly' ? '...' : '📆 Wochendigest'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fehlermeldung schliessen">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="digest-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'latest' ? 'active' : ''}`}
          onClick={() => setActiveTab('latest')}
          aria-label="Aktuelle Zusammenfassung anzeigen"
          aria-current={activeTab === 'latest' ? 'page' : undefined}
        >
          📋 Aktuell
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          aria-label="Verlauf anzeigen"
          aria-current={activeTab === 'history' ? 'page' : undefined}
        >
          📜 Verlauf
          {digestHistory.length > 0 && <span className="badge">{digestHistory.length}</span>}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'goals' ? 'active' : ''}`}
          onClick={() => setActiveTab('goals')}
          aria-label="Ziele anzeigen"
          aria-current={activeTab === 'goals' ? 'page' : undefined}
        >
          🎯 Ziele
        </button>
      </div>

      {/* Latest Tab */}
      {activeTab === 'latest' && (
        <div className="tab-content">
          {latestDigest ? (
            <div className="digest-card featured liquid-glass neuro-stagger-item">
              <div className="digest-card-header">
                <span className={`digest-type ${latestDigest.type}`}>
                  {latestDigest.type === 'daily' ? '📅 Tagesdigest' : '📆 Wochendigest'}
                </span>
                <span className="digest-date">
                  {latestDigest.type === 'daily'
                    ? formatDate(latestDigest.period_start)
                    : formatDateRange(latestDigest.period_start, latestDigest.period_end)}
                </span>
              </div>

              {/* Productivity Score */}
              <div className="productivity-score-section">
                <div className="score-circle neuro-breathing" style={{ borderColor: getProductivityColor(latestDigest.stats.productivity_score) }}>
                  <span className="score-value" style={{ color: getProductivityColor(latestDigest.stats.productivity_score) }}>
                    {latestDigest.stats.productivity_score}
                  </span>
                  <span className="score-label">Produktivitat</span>
                </div>
              </div>

              {/* Summary */}
              <div className="digest-summary">
                <p>{latestDigest.summary}</p>
              </div>

              {/* Stats */}
              <div className="digest-stats neuro-flow-list">
                <div className="digest-stat neuro-hover-lift">
                  <span className="digest-stat-icon">💡</span>
                  <span className="digest-stat-value">{latestDigest.stats.ideas_created}</span>
                  <span className="digest-stat-label">Ideen</span>
                </div>
                <div className="digest-stat neuro-hover-lift">
                  <span className="digest-stat-icon">✅</span>
                  <span className="digest-stat-value">{latestDigest.stats.tasks_completed}</span>
                  <span className="digest-stat-label">Aufgaben</span>
                </div>
                <div className="digest-stat neuro-hover-lift">
                  <span className="digest-stat-icon">📅</span>
                  <span className="digest-stat-value">{latestDigest.stats.meetings_held}</span>
                  <span className="digest-stat-label">Meetings</span>
                </div>
              </div>

              {/* Highlights */}
              {latestDigest.highlights.length > 0 && (
                <div className="digest-section neuro-stagger-item">
                  <h3>✨ Highlights</h3>
                  <ul className="highlights-list neuro-flow-list">
                    {latestDigest.highlights.slice(0, 7).map((highlight, i) => (
                      <li key={i} className="neuro-stagger-item">{highlight}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Top Categories */}
              {latestDigest.stats.top_categories.length > 0 && (
                <div className="digest-section">
                  <h3>📂 Top Kategorien</h3>
                  <div className="categories-bars">
                    {latestDigest.stats.top_categories.map(([cat, count]) => (
                      <div key={cat} className="category-bar-row">
                        <span className="category-name">{categoryLabels[cat] || cat}</span>
                        <div className="category-bar-container">
                          <div
                            className="category-bar-fill"
                            style={{
                              width: `${(count / Math.max(...latestDigest.stats.top_categories.map(([,c]) => c))) * 100}%`
                            }}
                          />
                        </div>
                        <span className="category-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {latestDigest.recommendations.length > 0 && (
                <div className="digest-section">
                  <h3>💡 Empfehlungen</h3>
                  <div className="recommendations-list">
                    {latestDigest.recommendations.map((rec, i) => (
                      <div key={i} className="recommendation-item">
                        {rec}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state neuro-empty-state">
              <span className="neuro-empty-icon">📊</span>
              <h3 className="neuro-empty-title">Noch keine Zusammenfassung</h3>
              <p className="neuro-empty-description">Erstelle deine erste Tages- oder Wochenzusammenfassung.</p>
              <p className="neuro-empty-encouragement">{EMPTY_STATE_MESSAGES.ideas.encouragement}</p>
              <div className="empty-actions">
                <button
                  type="button"
                  className="generate-btn daily neuro-button"
                  onClick={() => handleGenerateDigest('daily')}
                  disabled={generating !== null}
                  aria-label="Ersten Tagesdigest erstellen"
                >
                  📅 Tagesdigest erstellen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="tab-content">
          {digestHistory.length === 0 ? (
            <div className="empty-state neuro-empty-state">
              <span className="neuro-empty-icon">📜</span>
              <h3 className="neuro-empty-title">Noch keine Zusammenfassungen</h3>
              <p className="neuro-empty-description">Deine Zusammenfassungen erscheinen hier.</p>
            </div>
          ) : (
            <div className="digest-history-list neuro-flow-list">
              {digestHistory.slice(0, 7).map((digest, index) => (
                <div key={digest.id} className="digest-card compact liquid-glass neuro-hover-lift neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                  <div className="digest-card-header">
                    <span className={`digest-type ${digest.type}`}>
                      {digest.type === 'daily' ? '📅' : '📆'}
                    </span>
                    <span className="digest-date">
                      {digest.type === 'daily'
                        ? formatDate(digest.period_start)
                        : formatDateRange(digest.period_start, digest.period_end)}
                    </span>
                    <div
                      className="mini-score"
                      style={{ background: getProductivityColor(digest.stats.productivity_score) }}
                    >
                      {digest.stats.productivity_score}
                    </div>
                  </div>
                  <p className="digest-summary-preview">{digest.summary}</p>
                  <div className="digest-mini-stats">
                    <span>💡 {digest.stats.ideas_created}</span>
                    <span>✅ {digest.stats.tasks_completed}</span>
                    <span>📅 {digest.stats.meetings_held}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Goals Tab */}
      {activeTab === 'goals' && (
        <div className="tab-content">
          <div className="goals-section liquid-glass neuro-stagger-item">
            <div className="section-header-row">
              <h2>🎯 Produktivitatsziele</h2>
              <button
                type="button"
                className={`edit-btn neuro-hover-lift ${editingGoals ? 'active' : ''}`}
                onClick={() => setEditingGoals(!editingGoals)}
                aria-label={editingGoals ? 'Bearbeitung abbrechen' : 'Ziele bearbeiten'}
              >
                {editingGoals ? '✕ Abbrechen' : '✏️ Bearbeiten'}
              </button>
            </div>

            {editingGoals ? (
              <div className="goals-form">
                <div className="goals-grid">
                  <div className="goal-input-group">
                    <label>Ideen pro Tag</label>
                    <input
                      type="number"
                      min="0"
                      value={goalForm.daily_ideas_target}
                      onChange={(e) => setGoalForm({ ...goalForm, daily_ideas_target: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="goal-input-group">
                    <label>Ideen pro Woche</label>
                    <input
                      type="number"
                      min="0"
                      value={goalForm.weekly_ideas_target}
                      onChange={(e) => setGoalForm({ ...goalForm, weekly_ideas_target: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="goal-input-group">
                    <label>Aufgaben pro Tag</label>
                    <input
                      type="number"
                      min="0"
                      value={goalForm.daily_tasks_target}
                      onChange={(e) => setGoalForm({ ...goalForm, daily_tasks_target: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="goal-input-group">
                    <label>Aufgaben pro Woche</label>
                    <input
                      type="number"
                      min="0"
                      value={goalForm.weekly_tasks_target}
                      onChange={(e) => setGoalForm({ ...goalForm, weekly_tasks_target: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="focus-categories-section">
                  <label>Fokus-Kategorien</label>
                  <div className="category-toggles">
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <button
                        type="button"
                        key={key}
                        className={`category-toggle neuro-hover-lift ${goalForm.focus_categories.includes(key) ? 'active' : ''}`}
                        onClick={() => toggleFocusCategory(key)}
                        aria-label={`Kategorie ${label} ${goalForm.focus_categories.includes(key) ? 'entfernen' : 'hinzufugen'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="goal-input-group">
                  <label>Erinnerungszeit (optional)</label>
                  <input
                    type="time"
                    value={goalForm.reminder_time}
                    onChange={(e) => setGoalForm({ ...goalForm, reminder_time: e.target.value })}
                  />
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="save-btn neuro-button"
                    onClick={handleSaveGoals}
                    disabled={savingGoals}
                    aria-label="Ziele speichern"
                  >
                    {savingGoals ? 'Speichern...' : '💾 Speichern'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="goals-display">
                <div className="goals-cards">
                  <div className="goal-card">
                    <span className="goal-icon">📅</span>
                    <div className="goal-content">
                      <span className="goal-title">Täglich</span>
                      <div className="goal-targets">
                        <span>💡 {goals?.daily_ideas_target || 3} Ideen</span>
                        <span>✅ {goals?.daily_tasks_target || 5} Aufgaben</span>
                      </div>
                    </div>
                  </div>
                  <div className="goal-card">
                    <span className="goal-icon">📆</span>
                    <div className="goal-content">
                      <span className="goal-title">Wöchentlich</span>
                      <div className="goal-targets">
                        <span>💡 {goals?.weekly_ideas_target || 15} Ideen</span>
                        <span>✅ {goals?.weekly_tasks_target || 20} Aufgaben</span>
                      </div>
                    </div>
                  </div>
                </div>

                {goals?.focus_categories && goals.focus_categories.length > 0 && (
                  <div className="focus-display">
                    <h3>🎯 Fokus-Kategorien</h3>
                    <div className="focus-tags">
                      {goals.focus_categories.map(cat => (
                        <span key={cat} className="focus-tag">
                          {categoryLabels[cat] || cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {goals?.reminder_time && (
                  <div className="reminder-display">
                    <span className="reminder-icon">⏰</span>
                    <span>Tägliche Erinnerung um {goals.reminder_time} Uhr</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
