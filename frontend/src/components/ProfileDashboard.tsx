import { useState, useEffect } from 'react';
import axios from 'axios';
import './ProfileDashboard.css';

interface UserProfile {
  total_ideas: number;
  total_meetings: number;
  avg_ideas_per_day: number;
  top_categories: [string, number][];
  top_types: [string, number][];
  top_topics: [string, number][];
  auto_priority_enabled: boolean;
}

interface Recommendations {
  suggested_topics: string[];
  optimal_hours: number[];
  focus_categories: string[];
  insights: string[];
}

interface ProfileDashboardProps {
  onBack: () => void;
}

const categoryLabels: Record<string, string> = {
  business: 'Business',
  technical: 'Technik',
  personal: 'Persönlich',
  learning: 'Lernen',
};

const typeLabels: Record<string, { label: string; icon: string }> = {
  idea: { label: 'Ideen', icon: '💡' },
  task: { label: 'Aufgaben', icon: '✅' },
  insight: { label: 'Erkenntnisse', icon: '🔍' },
  problem: { label: 'Probleme', icon: '⚠️' },
  question: { label: 'Fragen', icon: '❓' },
};

export function ProfileDashboard({ onBack }: ProfileDashboardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const [statsRes, recsRes] = await Promise.all([
        axios.get('/api/profile/stats'),
        axios.get('/api/profile/recommendations'),
      ]);
      setProfile(statsRes.data);
      setRecommendations(recsRes.data.recommendations);
      setError(null);
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Laden fehlgeschlagen'
        : 'Laden fehlgeschlagen';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      await axios.post('/api/profile/recalculate');
      await loadProfile();
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Neuberechnung fehlgeschlagen'
        : 'Neuberechnung fehlgeschlagen';
      setError(message);
    } finally {
      setRecalculating(false);
    }
  };

  const handleToggleAutoPriority = async () => {
    if (!profile) return;

    try {
      await axios.put('/api/profile/auto-priority', {
        enabled: !profile.auto_priority_enabled,
      });
      setProfile({
        ...profile,
        auto_priority_enabled: !profile.auto_priority_enabled,
      });
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Einstellung fehlgeschlagen'
        : 'Einstellung fehlgeschlagen';
      setError(message);
    }
  };

  if (loading) {
    return (
      <div className="profile-dashboard">
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Profil...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-dashboard">
        <div className="error-state">
          <p>{error || 'Profil konnte nicht geladen werden'}</p>
          <button onClick={loadProfile}>Erneut versuchen</button>
        </div>
      </div>
    );
  }

  const maxCategoryCount = Math.max(...profile.top_categories.map(([, count]) => count), 1);
  const maxTypeCount = Math.max(...profile.top_types.map(([, count]) => count), 1);
  const maxTopicCount = Math.max(...profile.top_topics.map(([, count]) => count), 1);

  return (
    <div className="profile-dashboard">
      <div className="profile-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h1>Dein Profil</h1>
        <button
          className="recalculate-btn"
          onClick={handleRecalculate}
          disabled={recalculating}
        >
          {recalculating ? '...' : '🔄 Aktualisieren'}
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Stats Overview */}
      <div className="stats-overview">
        <div className="stat-card">
          <span className="stat-icon">💡</span>
          <div className="stat-content">
            <span className="stat-value">{profile.total_ideas}</span>
            <span className="stat-label">Ideen gesamt</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📅</span>
          <div className="stat-content">
            <span className="stat-value">{profile.total_meetings}</span>
            <span className="stat-label">Meetings</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📈</span>
          <div className="stat-content">
            <span className="stat-value">{profile.avg_ideas_per_day.toFixed(1)}</span>
            <span className="stat-label">Ideen pro Tag</span>
          </div>
        </div>
      </div>

      {/* Insights */}
      {recommendations && recommendations.insights.length > 0 && (
        <div className="insights-section">
          <h2>🎯 Erkenntnisse</h2>
          <div className="insights-list">
            {recommendations.insights.map((insight, i) => (
              <div key={i} className="insight-item">
                {insight}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="charts-grid">
        {/* Categories Distribution */}
        {profile.top_categories.length > 0 && (
          <div className="chart-card">
            <h3>Kategorien</h3>
            <div className="bar-chart">
              {profile.top_categories.map(([cat, count]) => (
                <div key={cat} className="bar-row">
                  <span className="bar-label">{categoryLabels[cat] || cat}</span>
                  <div className="bar-container">
                    <div
                      className="bar category-bar"
                      style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                  <span className="bar-value">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Types Distribution */}
        {profile.top_types.length > 0 && (
          <div className="chart-card">
            <h3>Typen</h3>
            <div className="bar-chart">
              {profile.top_types.map(([type, count]) => (
                <div key={type} className="bar-row">
                  <span className="bar-label">
                    {typeLabels[type]?.icon} {typeLabels[type]?.label || type}
                  </span>
                  <div className="bar-container">
                    <div
                      className="bar type-bar"
                      style={{ width: `${(count / maxTypeCount) * 100}%` }}
                    />
                  </div>
                  <span className="bar-value">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top Topics */}
      {profile.top_topics.length > 0 && (
        <div className="topics-section">
          <h2>🏷️ Top Themen</h2>
          <div className="topics-cloud">
            {profile.top_topics.map(([topic, count]) => (
              <span
                key={topic}
                className="topic-tag"
                style={{
                  fontSize: `${Math.max(0.75, Math.min(1.5, count / maxTopicCount + 0.5))}rem`,
                  opacity: Math.max(0.5, count / maxTopicCount),
                }}
              >
                {topic}
                <span className="topic-count">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Optimal Hours */}
      {recommendations && recommendations.optimal_hours.length > 0 && (
        <div className="hours-section">
          <h2>⏰ Produktive Stunden</h2>
          <div className="hours-display">
            {recommendations.optimal_hours.map((hour) => (
              <span key={hour} className="hour-badge">
                {hour}:00 - {hour + 1}:00
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="settings-section">
        <h2>⚙️ Einstellungen</h2>
        <div className="setting-item">
          <div className="setting-info">
            <strong>Auto-Priorität</strong>
            <p>Automatische Prioritätsvorschläge basierend auf gelernten Mustern</p>
          </div>
          <button
            className={`toggle-btn ${profile.auto_priority_enabled ? 'active' : ''}`}
            onClick={handleToggleAutoPriority}
          >
            {profile.auto_priority_enabled ? 'AN' : 'AUS'}
          </button>
        </div>
      </div>

      {/* Suggested Topics */}
      {recommendations && recommendations.suggested_topics.length > 0 && (
        <div className="suggestions-section">
          <h2>💡 Vorgeschlagene Themen</h2>
          <p className="suggestions-hint">
            Basierend auf deinen Interessen könnten diese Themen interessant sein:
          </p>
          <div className="suggestions-list">
            {recommendations.suggested_topics.map((topic, i) => (
              <span key={i} className="suggestion-tag">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
