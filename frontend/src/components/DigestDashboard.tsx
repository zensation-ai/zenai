import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
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
      <div className="digest-dashboard">
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Zusammenfassungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="digest-dashboard">
      <div className="digest-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h1>📊 Zusammenfassungen</h1>
        <span className={`context-indicator ${context}`}>
          {context === 'personal' ? '🏠 Privat' : '💼 Arbeit'}
        </span>
        <div className="generate-buttons">
          <button
            className="generate-btn daily"
            onClick={() => handleGenerateDigest('daily')}
            disabled={generating !== null}
          >
            {generating === 'daily' ? '...' : '📅 Tagesdigest'}
          </button>
          <button
            className="generate-btn weekly"
            onClick={() => handleGenerateDigest('weekly')}
            disabled={generating !== null}
          >
            {generating === 'weekly' ? '...' : '📆 Wochendigest'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="digest-tabs">
        <button
          className={`tab-btn ${activeTab === 'latest' ? 'active' : ''}`}
          onClick={() => setActiveTab('latest')}
        >
          📋 Aktuell
        </button>
        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📜 Verlauf
          {digestHistory.length > 0 && <span className="badge">{digestHistory.length}</span>}
        </button>
        <button
          className={`tab-btn ${activeTab === 'goals' ? 'active' : ''}`}
          onClick={() => setActiveTab('goals')}
        >
          🎯 Ziele
        </button>
      </div>

      {/* Latest Tab */}
      {activeTab === 'latest' && (
        <div className="tab-content">
          {latestDigest ? (
            <div className="digest-card featured">
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
                <div className="score-circle" style={{ borderColor: getProductivityColor(latestDigest.stats.productivity_score) }}>
                  <span className="score-value" style={{ color: getProductivityColor(latestDigest.stats.productivity_score) }}>
                    {latestDigest.stats.productivity_score}
                  </span>
                  <span className="score-label">Produktivität</span>
                </div>
              </div>

              {/* Summary */}
              <div className="digest-summary">
                <p>{latestDigest.summary}</p>
              </div>

              {/* Stats */}
              <div className="digest-stats">
                <div className="digest-stat">
                  <span className="digest-stat-icon">💡</span>
                  <span className="digest-stat-value">{latestDigest.stats.ideas_created}</span>
                  <span className="digest-stat-label">Ideen</span>
                </div>
                <div className="digest-stat">
                  <span className="digest-stat-icon">✅</span>
                  <span className="digest-stat-value">{latestDigest.stats.tasks_completed}</span>
                  <span className="digest-stat-label">Aufgaben</span>
                </div>
                <div className="digest-stat">
                  <span className="digest-stat-icon">📅</span>
                  <span className="digest-stat-value">{latestDigest.stats.meetings_held}</span>
                  <span className="digest-stat-label">Meetings</span>
                </div>
              </div>

              {/* Highlights */}
              {latestDigest.highlights.length > 0 && (
                <div className="digest-section">
                  <h3>✨ Highlights</h3>
                  <ul className="highlights-list">
                    {latestDigest.highlights.map((highlight, i) => (
                      <li key={i}>{highlight}</li>
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
            <div className="empty-state">
              <span className="empty-icon">📊</span>
              <h3>Noch keine Zusammenfassung</h3>
              <p>Erstelle deine erste Tages- oder Wochenzusammenfassung.</p>
              <div className="empty-actions">
                <button
                  className="generate-btn daily"
                  onClick={() => handleGenerateDigest('daily')}
                  disabled={generating !== null}
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
            <div className="empty-state">
              <span className="empty-icon">📜</span>
              <h3>Noch keine Zusammenfassungen</h3>
              <p>Deine Zusammenfassungen erscheinen hier.</p>
            </div>
          ) : (
            <div className="digest-history-list">
              {digestHistory.map(digest => (
                <div key={digest.id} className="digest-card compact">
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
          <div className="goals-section">
            <div className="section-header-row">
              <h2>🎯 Produktivitätsziele</h2>
              <button
                className={`edit-btn ${editingGoals ? 'active' : ''}`}
                onClick={() => setEditingGoals(!editingGoals)}
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
                        key={key}
                        className={`category-toggle ${goalForm.focus_categories.includes(key) ? 'active' : ''}`}
                        onClick={() => toggleFocusCategory(key)}
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
                    className="save-btn"
                    onClick={handleSaveGoals}
                    disabled={savingGoals}
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
