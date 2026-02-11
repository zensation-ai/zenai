import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { getErrorMessage } from '../utils/errors';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import '../neurodesign.css';
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

interface BusinessProfile {
  id: string;
  company_name: string | null;
  industry: string | null;
  company_size: string | null;
  role: string | null;
  tech_stack: string[];
  goals: string[];
  pain_points: string[];
  communication_style: string | null;
}

interface Recommendations {
  suggested_topics: string[];
  optimal_hours: number[];
  focus_categories: string[];
  insights: string[];
}

interface ProfileDashboardProps {
  onBack: () => void;
  context: string;
  embedded?: boolean;
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

export function ProfileDashboard({ onBack, context, embedded }: ProfileDashboardProps) {
  const greeting = getTimeBasedGreeting();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    company_name: '',
    industry: '',
    role: '',
    tech_stack: '',
    goals: '',
  });

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const [statsRes, recsRes, businessRes] = await Promise.all([
        axios.get(`/api/${context}/profile/stats`, { signal }),
        axios.get(`/api/${context}/profile/recommendations`, { signal }),
        axios.get(`/api/${context}/profile`, { signal }).catch(() => ({ data: { profile: null } })),
      ]);
      setProfile(statsRes.data);
      setRecommendations(recsRes.data.recommendations);

      const bp = businessRes.data.profile;
      if (bp) {
        setBusinessProfile(bp);
        setEditForm({
          company_name: bp.company_name || '',
          industry: bp.industry || '',
          role: bp.role || '',
          tech_stack: (bp.tech_stack || []).join(', '),
          goals: (bp.goals || []).join(', '),
        });
      }
      setError(null);
    } catch (err: unknown) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;

      setError(getErrorMessage(err, 'Dein Profil konnte gerade nicht geladen werden. Versuch es gleich noch mal.'));
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    // Abort any previous request
    abortControllerRef.current?.abort();

    // Create new AbortController
    abortControllerRef.current = new AbortController();
    loadProfile(abortControllerRef.current.signal);

    // Cleanup: abort on unmount or context change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadProfile]);

  // Manual reload handler (for retry button and after actions)
  const handleReload = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadProfile(abortControllerRef.current.signal);
  }, [loadProfile]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updates = {
        company_name: editForm.company_name || null,
        industry: editForm.industry || null,
        role: editForm.role || null,
        tech_stack: editForm.tech_stack.split(',').map(s => s.trim()).filter(Boolean),
        goals: editForm.goals.split(',').map(s => s.trim()).filter(Boolean),
      };

      await axios.put(`/api/${context}/profile`, updates);
      showToast('Profil gespeichert!', 'success');
      setIsEditing(false);
      handleReload();
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Das Profil konnte nicht gespeichert werden. Prüf deine Verbindung und versuch es noch mal.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      await axios.post(`/api/${context}/profile/recalculate`);
      handleReload();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Die Aktualisierung hat gerade nicht geklappt. Versuch es gleich noch mal.'));
    } finally {
      setRecalculating(false);
    }
  };

  const handleToggleAutoPriority = async () => {
    if (!profile) return;

    try {
      await axios.put(`/api/${context}/profile/auto-priority`, {
        enabled: !profile.auto_priority_enabled,
      });
      setProfile({
        ...profile,
        auto_priority_enabled: !profile.auto_priority_enabled,
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Die Einstellung konnte nicht geändert werden. Versuch es gleich noch mal.'));
    }
  };

  if (loading) {
    return (
      <div className="profile-dashboard neuro-page-enter">
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Profil...</p>
          <p className="neuro-loading-submessage">Deine Daten werden vorbereitet</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-dashboard neuro-page-enter">
        {!embedded && (
          <div className="profile-header liquid-glass-nav">
            <button type="button" className="back-button neuro-hover-lift" onClick={onBack}>
              ← Zurück
            </button>
            <h1>Profil</h1>
          </div>
        )}
        <div className="error-state neuro-empty-state">
          <p className="neuro-empty-description">{error || 'Profil konnte nicht geladen werden'}</p>
          <button type="button" className="neuro-button" onClick={handleReload}>Erneut versuchen</button>
        </div>
      </div>
    );
  }

  const maxCategoryCount = Math.max(...profile.top_categories.map(([, count]) => count), 1);
  const maxTypeCount = Math.max(...profile.top_types.map(([, count]) => count), 1);
  const maxTopicCount = Math.max(...profile.top_topics.map(([, count]) => count), 1);

  return (
    <div className="profile-dashboard neuro-page-enter">
      {!embedded && (
        <div className="profile-header liquid-glass-nav">
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack}>
            ← Zurück
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Dein Profil</h1>
            <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
          </div>
          <span className={`context-indicator ${context}`}>
            {{ personal: 'Persönlich', work: 'Arbeit', learning: 'Lernen', creative: 'Kreativ' }[context] || context}
          </span>
          <button
            type="button"
            className="recalculate-btn neuro-hover-lift"
            onClick={handleRecalculate}
            disabled={recalculating}
          >
            {recalculating ? '...' : 'Aktualisieren'}
          </button>
        </div>
      )}

      {error && (
        <div className="error-banner neuro-stagger-item">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>x</button>
        </div>
      )}

      {/* Stats Overview */}
      <div className="stats-overview neuro-flow-list">
        <div className="stat-card liquid-glass neuro-stagger-item neuro-hover-lift">
          <span className="stat-icon">💡</span>
          <div className="stat-content">
            <span className="stat-value">{profile.total_ideas}</span>
            <span className="stat-label">Ideen gesamt</span>
          </div>
        </div>
        <div className="stat-card liquid-glass neuro-stagger-item neuro-hover-lift">
          <span className="stat-icon">📅</span>
          <div className="stat-content">
            <span className="stat-value">{profile.total_meetings}</span>
            <span className="stat-label">Meetings</span>
          </div>
        </div>
        <div className="stat-card liquid-glass neuro-stagger-item neuro-hover-lift">
          <span className="stat-icon">📈</span>
          <div className="stat-content">
            <span className="stat-value">{profile.avg_ideas_per_day.toFixed(1)}</span>
            <span className="stat-label">Ideen pro Tag</span>
          </div>
        </div>
      </div>

      {/* Business Profile Edit */}
      <div className="business-profile-section liquid-glass neuro-stagger-item">
        <div className="section-header-row">
          <h2>Unternehmensprofil</h2>
          <button
            type="button"
            className={`edit-profile-btn neuro-hover-lift ${isEditing ? 'active' : ''}`}
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? 'Abbrechen' : 'Bearbeiten'}
          </button>
        </div>

        {isEditing ? (
          <div className="profile-edit-form">
            <div className="form-group">
              <label htmlFor="company_name">Unternehmen</label>
              <input
                id="company_name"
                type="text"
                value={editForm.company_name}
                onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                placeholder="z.B. Meine GmbH"
              />
            </div>
            <div className="form-group">
              <label htmlFor="industry">Branche</label>
              <input
                id="industry"
                type="text"
                value={editForm.industry}
                onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                placeholder="z.B. SaaS, E-Commerce, Beratung"
              />
            </div>
            <div className="form-group">
              <label htmlFor="role">Deine Rolle</label>
              <input
                id="role"
                type="text"
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                placeholder="z.B. CEO, Developer, Product Manager"
              />
            </div>
            <div className="form-group">
              <label htmlFor="tech_stack">Tech-Stack (kommagetrennt)</label>
              <input
                id="tech_stack"
                type="text"
                value={editForm.tech_stack}
                onChange={(e) => setEditForm({ ...editForm, tech_stack: e.target.value })}
                placeholder="z.B. React, TypeScript, Supabase"
              />
            </div>
            <div className="form-group">
              <label htmlFor="goals">Ziele (kommagetrennt)</label>
              <textarea
                id="goals"
                value={editForm.goals}
                onChange={(e) => setEditForm({ ...editForm, goals: e.target.value })}
                placeholder="z.B. App launchen, 100 Kunden gewinnen, Prozesse automatisieren"
                rows={2}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="save-btn"
                onClick={handleSaveProfile}
                disabled={saving}
              >
                {saving ? 'Speichern...' : '💾 Speichern'}
              </button>
            </div>
          </div>
        ) : (
          <div className="profile-display">
            {businessProfile?.company_name || businessProfile?.industry || businessProfile?.role ? (
              <>
                {businessProfile.company_name && (
                  <div className="profile-item">
                    <span className="profile-label">Unternehmen:</span>
                    <span className="profile-value">{businessProfile.company_name}</span>
                  </div>
                )}
                {businessProfile.industry && (
                  <div className="profile-item">
                    <span className="profile-label">Branche:</span>
                    <span className="profile-value">{businessProfile.industry}</span>
                  </div>
                )}
                {businessProfile.role && (
                  <div className="profile-item">
                    <span className="profile-label">Rolle:</span>
                    <span className="profile-value">{businessProfile.role}</span>
                  </div>
                )}
                {businessProfile.tech_stack && businessProfile.tech_stack.length > 0 && (
                  <div className="profile-item">
                    <span className="profile-label">Tech-Stack:</span>
                    <div className="tech-tags">
                      {businessProfile.tech_stack.map((tech, i) => (
                        <span key={i} className="tech-tag">{tech}</span>
                      ))}
                    </div>
                  </div>
                )}
                {businessProfile.goals && businessProfile.goals.length > 0 && (
                  <div className="profile-item">
                    <span className="profile-label">Ziele:</span>
                    <ul className="goals-list">
                      {businessProfile.goals.map((goal, i) => (
                        <li key={i}>{goal}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-profile">
                <p>Noch keine Unternehmensdaten hinterlegt.</p>
                <p className="hint">Klicke auf "Bearbeiten" um dein Profil anzulegen. Die KI nutzt diese Daten um bessere, personalisierte Antworten zu geben.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Insights */}
      {recommendations && recommendations.insights.length > 0 && (
        <div className="insights-section neuro-stagger-item">
          <h2>Erkenntnisse</h2>
          <div className="insights-list neuro-flow-list">
            {recommendations.insights.slice(0, 7).map((insight, i) => (
              <div key={i} className="insight-item neuro-stagger-item neuro-hover-lift" style={{ animationDelay: `${i * 50}ms` }}>
                {insight}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="charts-grid neuro-flow-list">
        {/* Categories Distribution */}
        {profile.top_categories.length > 0 && (
          <div className="chart-card liquid-glass neuro-stagger-item neuro-hover-lift">
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
          <div className="chart-card liquid-glass neuro-stagger-item neuro-hover-lift">
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
        <div className="topics-section neuro-stagger-item">
          <h2>Top Themen</h2>
          <div className="topics-cloud liquid-glass neuro-flow-list">
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
        <div className="hours-section neuro-stagger-item">
          <h2>Produktive Stunden</h2>
          <div className="hours-display neuro-flow-list">
            {recommendations.optimal_hours.slice(0, 7).map((hour, index) => (
              <span key={hour} className="hour-badge neuro-stagger-item neuro-hover-lift" style={{ animationDelay: `${index * 50}ms` }}>
                {hour}:00 - {hour + 1}:00
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="settings-section neuro-stagger-item">
        <h2>Einstellungen</h2>
        <div className="setting-item liquid-glass neuro-hover-lift">
          <div className="setting-info">
            <strong>Auto-Prioritat</strong>
            <p>Automatische Prioritatsvorschlage basierend auf gelernten Mustern</p>
          </div>
          <button
            type="button"
            className={`toggle-btn neuro-button ${profile.auto_priority_enabled ? 'active neuro-success-burst' : ''}`}
            onClick={handleToggleAutoPriority}
          >
            {profile.auto_priority_enabled ? 'AN' : 'AUS'}
          </button>
        </div>
      </div>

      {/* Suggested Topics */}
      {recommendations && recommendations.suggested_topics.length > 0 && (
        <div className="suggestions-section neuro-stagger-item">
          <h2>Vorgeschlagene Themen</h2>
          <p className="suggestions-hint">
            Basierend auf deinen Interessen konnten diese Themen interessant sein:
          </p>
          <div className="suggestions-list neuro-flow-list">
            {recommendations.suggested_topics.slice(0, 7).map((topic, i) => (
              <span key={i} className="suggestion-tag neuro-stagger-item neuro-hover-lift" style={{ animationDelay: `${i * 50}ms` }}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
