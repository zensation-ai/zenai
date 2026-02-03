import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { getTimeBasedGreeting, EMPTY_STATE_MESSAGES } from '../utils/aiPersonality';
import '../neurodesign.css';
import './LearningDashboard.css';

interface LearningDashboardProps {
  context: string;
  onBack: () => void;
}

// Types
interface DomainFocus {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  learning_goals: string[];
  is_active: boolean;
  priority: number;
  ideas_count: number;
  last_activity_at: string | null;
}

interface FocusStats {
  total_focus_areas: number;
  active_focus_areas: number;
  total_ideas_linked: number;
}

interface FeedbackStats {
  total_feedback: number;
  average_rating: number;
  corrections_count: number;
  applied_count: number;
}

interface FeedbackInsight {
  pattern: string;
  frequency: number;
  suggested_improvement: string;
}

interface ProactiveResearch {
  id: string;
  research_query: string;
  teaser_title: string | null;
  teaser_text: string | null;
  status: string;
  created_at: string;
}

interface AISuggestion {
  id: string;
  suggestion_type: string;
  title: string;
  description: string | null;
  reasoning: string | null;
  priority: number;
  status: string;
  created_at: string;
}

interface LearningLog {
  id: string;
  learning_date: string;
  ideas_analyzed: number;
  patterns_found: number;
  suggestions_generated: number;
  status: string;
}

interface ProfileStats {
  profile_completeness: number;
  topics_tracked: number;
  top_topics: Array<{ topic: string; count: number }>;
  tech_stack_count: number;
  insights_count: number;
  last_updated: string | null;
}

interface DashboardData {
  focus: {
    active_areas: DomainFocus[];
    stats: FocusStats;
  };
  feedback: {
    stats: FeedbackStats;
    insights: FeedbackInsight[];
  };
  research: {
    pending: ProactiveResearch[];
  };
  suggestions: {
    active: AISuggestion[];
  };
  learning: {
    recent_logs: LearningLog[];
  };
  profile?: {
    stats: ProfileStats;
  };
}

// Profile data interface for editing
interface ProfileData {
  company_name?: string;
  industry?: string;
  role?: string;
  tech_stack?: string[];
  pain_points?: string[];
  goals?: string[];
}

export function LearningDashboard({ context, onBack }: LearningDashboardProps) {
  const greeting = getTimeBasedGreeting();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'focus' | 'feedback' | 'research' | 'suggestions' | 'profile'>('overview');
  const [newFocus, setNewFocus] = useState({ name: '', description: '', keywords: '' });
  const [showAddFocus, setShowAddFocus] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const confirm = useConfirm();

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/${context}/learning/dashboard`, { signal });
      setData(response.data.dashboard);
    } catch (error) {
      // Don't update state if request was aborted
      if (axios.isCancel(error)) return;
      console.error('Failed to load learning dashboard:', error);
      showToast('Dashboard konnte nicht geladen werden', 'error');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    // Abort any previous request
    abortControllerRef.current?.abort();

    // Create new AbortController
    abortControllerRef.current = new AbortController();
    loadDashboard(abortControllerRef.current.signal);

    // Cleanup: abort on unmount or context change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadDashboard]);

  // Manual reload handler (for after actions)
  const handleReload = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadDashboard(abortControllerRef.current.signal);
  }, [loadDashboard]);

  const handleToggleFocus = async (id: string, isActive: boolean) => {
    try {
      await axios.put(`/api/${context}/focus/${id}/toggle`, { is_active: !isActive });
      showToast(isActive ? 'Fokus deaktiviert' : 'Fokus aktiviert', 'success');
      handleReload();
    } catch (error) {
      showToast('Fehler beim Umschalten', 'error');
    }
  };

  const handleDeleteFocus = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Fokus-Thema löschen',
      message: `Möchtest du "${name}" wirklich löschen?`,
      confirmText: 'Löschen',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await axios.delete(`/api/${context}/focus/${id}`);
      showToast('Fokus gelöscht', 'success');
      handleReload();
    } catch (error) {
      showToast('Löschen fehlgeschlagen', 'error');
    }
  };

  const handleAddFocus = async () => {
    if (!newFocus.name.trim()) {
      showToast('Name ist erforderlich', 'error');
      return;
    }

    try {
      await axios.post(`/api/${context}/focus`, {
        name: newFocus.name.trim(),
        description: newFocus.description.trim() || undefined,
        keywords: newFocus.keywords.split(',').map(k => k.trim()).filter(k => k),
      });
      showToast('Fokus-Thema erstellt', 'success');
      setNewFocus({ name: '', description: '', keywords: '' });
      setShowAddFocus(false);
      handleReload();
    } catch (error) {
      showToast('Erstellen fehlgeschlagen', 'error');
    }
  };

  const handleRespondToSuggestion = async (id: string, response: 'accepted' | 'dismissed') => {
    try {
      await axios.put(`/api/${context}/suggestions/${id}/respond`, { response });
      showToast(response === 'accepted' ? 'Vorschlag angenommen' : 'Vorschlag abgelehnt', 'success');
      handleReload();
    } catch (error) {
      showToast('Fehler beim Antworten', 'error');
    }
  };

  const handleViewResearch = async (id: string) => {
    try {
      await axios.put(`/api/${context}/research/${id}/viewed`);
      handleReload();
    } catch (error) {
      console.error('Failed to mark as viewed:', error);
      showToast('Aktion fehlgeschlagen', 'error');
    }
  };

  const handleTriggerLearning = async () => {
    try {
      showToast('Lernprozess gestartet...', 'info');
      await axios.post(`/api/${context}/learning/run`);
      showToast('Lernprozess abgeschlossen', 'success');
      handleReload();
    } catch (error) {
      showToast('Lernprozess fehlgeschlagen', 'error');
    }
  };

  const handleCreatePresets = async () => {
    try {
      await axios.post(`/api/${context}/focus/presets`);
      showToast('Preset-Fokus-Themen erstellt', 'success');
      handleReload();
    } catch (error) {
      showToast('Erstellen fehlgeschlagen', 'error');
    }
  };

  const handleAnalyzeProfile = async () => {
    try {
      showToast('Profil-Analyse gestartet...', 'info');
      await axios.post(`/api/${context}/profile/analyze`, { days_back: 30 });
      showToast('Profil-Analyse abgeschlossen', 'success');
      handleReload();
    } catch (error) {
      showToast('Analyse fehlgeschlagen', 'error');
    }
  };

  const handleOpenEditProfile = async () => {
    try {
      const response = await axios.get(`/api/${context}/profile`);
      const profile = response.data.profile;
      setProfileData({
        company_name: profile?.company_name || '',
        industry: profile?.industry || '',
        role: profile?.role || '',
        tech_stack: profile?.tech_stack || [],
        pain_points: profile?.pain_points || [],
        goals: profile?.goals || [],
      });
      setShowEditProfile(true);
    } catch (error) {
      showToast('Profil konnte nicht geladen werden', 'error');
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await axios.put(`/api/${context}/profile`, profileData);
      showToast('Profil gespeichert', 'success');
      setShowEditProfile(false);
      handleReload();
    } catch (error) {
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="learning-dashboard neuro-page-enter">
        <div className="learning-header liquid-glass-nav">
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack} aria-label="Zurück zur vorherigen Seite">← Zurück</button>
          <h1>KI-Lernzentrum</h1>
        </div>
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Dashboard...</p>
          <p className="neuro-loading-submessage">{EMPTY_STATE_MESSAGES.learning.description}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="learning-dashboard">
        <div className="learning-header">
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack} aria-label="Zurück zur vorherigen Seite">← Zurück</button>
          <h1>KI-Lernzentrum</h1>
        </div>
        <div className="error-state neuro-error-friendly">Dashboard konnte nicht geladen werden</div>
      </div>
    );
  }

  return (
    <div className="learning-dashboard neuro-page-enter">
      <div className="learning-header liquid-glass-nav">
        <button type="button" className="back-button neuro-hover-lift" onClick={onBack} aria-label="Zurück zur vorherigen Seite">← Zurück</button>
        <div className="header-greeting">
          <h1>{greeting.emoji} KI-Lernzentrum</h1>
          <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
        </div>
        <button type="button" className="trigger-learning-button neuro-button" onClick={handleTriggerLearning} aria-label="KI-Lernprozess starten">
          Lernen starten
        </button>
      </div>

      <div className="tab-navigation">
        <button
          type="button"
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          aria-label="Ubersicht anzeigen"
          aria-current={activeTab === 'overview' ? 'page' : undefined}
        >
          Übersicht
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'focus' ? 'active' : ''}`}
          onClick={() => setActiveTab('focus')}
          aria-label="Fokus-Themen anzeigen"
          aria-current={activeTab === 'focus' ? 'page' : undefined}
        >
          Fokus-Themen ({data.focus.stats.active_focus_areas})
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
          aria-label="Vorschlage anzeigen"
          aria-current={activeTab === 'suggestions' ? 'page' : undefined}
        >
          Vorschläge ({data.suggestions.active.length})
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'research' ? 'active' : ''}`}
          onClick={() => setActiveTab('research')}
          aria-label="Recherchen anzeigen"
          aria-current={activeTab === 'research' ? 'page' : undefined}
        >
          Recherchen ({data.research.pending.length})
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'feedback' ? 'active' : ''}`}
          onClick={() => setActiveTab('feedback')}
          aria-label="Feedback anzeigen"
          aria-current={activeTab === 'feedback' ? 'page' : undefined}
        >
          Feedback
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
          aria-label="Profil anzeigen"
          aria-current={activeTab === 'profile' ? 'page' : undefined}
        >
          Profil
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="stats-grid neuro-flow-list">
              <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
                <div className="stat-icon">🎯</div>
                <div className="stat-value">{data.focus.stats.active_focus_areas}</div>
                <div className="stat-label">Aktive Fokus-Themen</div>
              </div>
              <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
                <div className="stat-icon">💡</div>
                <div className="stat-value">{data.suggestions.active.length}</div>
                <div className="stat-label">Offene Vorschlage</div>
              </div>
              <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
                <div className="stat-icon">🔍</div>
                <div className="stat-value">{data.research.pending.length}</div>
                <div className="stat-label">Vorbereitete Recherchen</div>
              </div>
              <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
                <div className="stat-icon">⭐</div>
                <div className="stat-value">{data.feedback.stats.average_rating.toFixed(1)}</div>
                <div className="stat-label">Durchschnittliche Bewertung</div>
              </div>
            </div>

            {/* Learning Progress Chart */}
            {data.learning.recent_logs.length > 0 && (
              <div className="section learning-progress-section">
                <h2>Lernfortschritt (letzte 7 Tage)</h2>
                <div className="learning-progress-chart">
                  {data.learning.recent_logs.slice(0, 7).reverse().map((log) => {
                    const maxIdeas = Math.max(...data.learning.recent_logs.map(l => l.ideas_analyzed), 1);
                    const heightPercent = (log.ideas_analyzed / maxIdeas) * 100;
                    return (
                      <div key={log.id} className="chart-bar-container">
                        <div
                          className={`chart-bar ${log.status === 'completed' ? 'completed' : 'partial'}`}
                          style={{ '--bar-height': `${Math.max(heightPercent, 5)}%` } as React.CSSProperties}
                          title={`${log.ideas_analyzed} Ideen analysiert, ${log.patterns_found} Muster, ${log.suggestions_generated} Vorschläge`}
                        >
                          <span className="bar-value">{log.ideas_analyzed}</span>
                        </div>
                        <span className="chart-label">
                          {new Date(log.learning_date).toLocaleDateString('de-DE', { weekday: 'short' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="chart-legend">
                  <span className="legend-item">
                    <span className="legend-color completed"></span>
                    Ideen analysiert
                  </span>
                </div>
              </div>
            )}

            {data.suggestions.active.length > 0 && (
              <div className="section">
                <h2>Aktuelle Vorschläge</h2>
                <div className="suggestions-preview">
                  {data.suggestions.active.slice(0, 3).map((suggestion) => (
                    <div key={suggestion.id} className="suggestion-card-mini">
                      <span className="suggestion-type">{getSuggestionIcon(suggestion.suggestion_type)}</span>
                      <span className="suggestion-title">{suggestion.title}</span>
                      <div className="suggestion-actions">
                        <button
                          type="button"
                          className="accept-btn neuro-hover-lift"
                          onClick={() => handleRespondToSuggestion(suggestion.id, 'accepted')}
                          aria-label="Vorschlag annehmen"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="dismiss-btn neuro-hover-lift"
                          onClick={() => handleRespondToSuggestion(suggestion.id, 'dismissed')}
                          aria-label="Vorschlag ablehnen"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.research.pending.length > 0 && (
              <div className="section">
                <h2>Vorbereitete Recherchen</h2>
                <div className="research-preview">
                  {data.research.pending.slice(0, 2).map((research) => (
                    <div
                      key={research.id}
                      className="research-card-mini"
                      onClick={() => handleViewResearch(research.id)}
                    >
                      <div className="research-query">{research.teaser_title || research.research_query}</div>
                      {research.teaser_text && (
                        <div className="research-teaser">{research.teaser_text}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.learning.recent_logs.length > 0 && (
              <div className="section">
                <h2>Letzte Lernaktivitäten</h2>
                <div className="learning-logs">
                  {data.learning.recent_logs.slice(0, 5).map((log) => (
                    <div key={log.id} className="learning-log">
                      <span className="log-date">{formatDate(log.learning_date)}</span>
                      <span className="log-stats">
                        {log.ideas_analyzed} Ideen • {log.patterns_found} Muster • {log.suggestions_generated} Vorschläge
                      </span>
                      <span className={`log-status status-${log.status}`}>{log.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'focus' && (
          <div className="focus-tab">
            <div className="focus-actions">
              <button type="button" className="add-focus-button neuro-button" onClick={() => setShowAddFocus(true)} aria-label="Neues Fokus-Thema erstellen">
                + Neues Fokus-Thema
              </button>
              {data.focus.active_areas.length === 0 && (
                <button type="button" className="preset-button neuro-hover-lift" onClick={handleCreatePresets} aria-label="Vordefinierte Fokus-Themen laden">
                  Preset-Themen laden
                </button>
              )}
            </div>

            {showAddFocus && (
              <div className="add-focus-form liquid-glass neuro-stagger-item">
                <input
                  type="text"
                  placeholder="Name des Fokus-Themas"
                  value={newFocus.name}
                  onChange={(e) => setNewFocus({ ...newFocus, name: e.target.value })}
                />
                <textarea
                  placeholder="Beschreibung (optional)"
                  value={newFocus.description}
                  onChange={(e) => setNewFocus({ ...newFocus, description: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Keywords (kommagetrennt)"
                  value={newFocus.keywords}
                  onChange={(e) => setNewFocus({ ...newFocus, keywords: e.target.value })}
                />
                <div className="form-actions">
                  <button type="button" className="cancel-btn neuro-hover-lift" onClick={() => setShowAddFocus(false)} aria-label="Abbrechen">
                    Abbrechen
                  </button>
                  <button type="button" className="save-btn neuro-button" onClick={handleAddFocus} aria-label="Fokus-Thema erstellen">
                    Erstellen
                  </button>
                </div>
              </div>
            )}

            <div className="focus-list neuro-flow-list">
              {data.focus.active_areas.length === 0 ? (
                <div className="empty-state neuro-empty-state">
                  <span className="neuro-empty-icon">🎯</span>
                  <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.learning.title}</h3>
                  <p className="neuro-empty-description">Fuge Themen hinzu, auf die sich die KI konzentrieren soll.</p>
                </div>
              ) : (
                data.focus.active_areas.slice(0, 7).map((focus, index) => (
                  <div key={focus.id} className={`focus-card liquid-glass neuro-hover-lift neuro-stagger-item ${!focus.is_active ? 'inactive' : ''}`} style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="focus-header">
                      <h3>{focus.name}</h3>
                      <div className="focus-priority">Priorität: {focus.priority}</div>
                    </div>
                    {focus.description && <p className="focus-description">{focus.description}</p>}
                    {focus.keywords.length > 0 && (
                      <div className="focus-keywords">
                        {focus.keywords.map((kw, i) => (
                          <span key={i} className="keyword">{kw}</span>
                        ))}
                      </div>
                    )}
                    {focus.learning_goals.length > 0 && (
                      <div className="focus-goals">
                        <strong>Lernziele:</strong>
                        <ul>
                          {focus.learning_goals.map((goal, i) => (
                            <li key={i}>{goal}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="focus-footer">
                      <span className="focus-ideas">{focus.ideas_count} verknüpfte Ideen</span>
                      <div className="focus-actions">
                        <button
                          type="button"
                          className={`toggle-btn neuro-hover-lift ${focus.is_active ? 'active' : ''}`}
                          onClick={() => handleToggleFocus(focus.id, focus.is_active)}
                          aria-label={focus.is_active ? 'Fokus deaktivieren' : 'Fokus aktivieren'}
                        >
                          {focus.is_active ? 'Deaktivieren' : 'Aktivieren'}
                        </button>
                        <button
                          type="button"
                          className="delete-btn neuro-hover-lift"
                          onClick={() => handleDeleteFocus(focus.id, focus.name)}
                          aria-label={`Fokus ${focus.name} loschen`}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'suggestions' && (
          <div className="suggestions-tab">
            {data.suggestions.active.length === 0 ? (
              <div className="empty-state neuro-empty-state">
                <span className="neuro-empty-icon">💡</span>
                <h3 className="neuro-empty-title">Keine aktiven Vorschlage</h3>
                <p className="neuro-empty-description">Die KI analysiert deine Aktivitaten und macht bald Vorschlage.</p>
              </div>
            ) : (
              <div className="suggestions-list neuro-flow-list">
                {data.suggestions.active.slice(0, 7).map((suggestion, index) => (
                  <div key={suggestion.id} className="suggestion-card liquid-glass neuro-hover-lift neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="suggestion-header">
                      <span className="suggestion-type-badge">
                        {getSuggestionIcon(suggestion.suggestion_type)}
                        {getSuggestionLabel(suggestion.suggestion_type)}
                      </span>
                      <span className={`suggestion-priority priority-${suggestion.priority > 7 ? 'high' : suggestion.priority > 4 ? 'medium' : 'low'}`}>
                        Priorität {suggestion.priority}
                      </span>
                    </div>
                    <h3 className="suggestion-title">{suggestion.title}</h3>
                    {suggestion.description && (
                      <p className="suggestion-description">{suggestion.description}</p>
                    )}
                    {suggestion.reasoning && (
                      <div className="suggestion-reasoning">
                        <strong>Begründung:</strong> {suggestion.reasoning}
                      </div>
                    )}
                    <div className="suggestion-footer">
                      <span className="suggestion-date">{formatDate(suggestion.created_at)}</span>
                      <div className="suggestion-actions">
                        <button
                          type="button"
                          className="accept-btn neuro-button"
                          onClick={() => handleRespondToSuggestion(suggestion.id, 'accepted')}
                          aria-label="Vorschlag annehmen"
                        >
                          Annehmen
                        </button>
                        <button
                          type="button"
                          className="dismiss-btn neuro-hover-lift"
                          onClick={() => handleRespondToSuggestion(suggestion.id, 'dismissed')}
                          aria-label="Vorschlag ablehnen"
                        >
                          Ablehnen
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'research' && (
          <div className="research-tab">
            {data.research.pending.length === 0 ? (
              <div className="empty-state neuro-empty-state">
                <span className="neuro-empty-icon">🔍</span>
                <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.search.title}</h3>
                <p className="neuro-empty-description">Erstelle Aufgaben mit Recherche-Hinweisen, und die KI bereitet automatisch Informationen vor.</p>
              </div>
            ) : (
              <div className="research-list neuro-flow-list">
                {data.research.pending.slice(0, 7).map((research, index) => (
                  <div
                    key={research.id}
                    className="research-card liquid-glass neuro-hover-lift neuro-stagger-item"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => handleViewResearch(research.id)}
                  >
                    <div className="research-status-badge">
                      {research.status === 'completed' ? '✓ Bereit' : '⏳ In Arbeit'}
                    </div>
                    <h3 className="research-title">{research.teaser_title || research.research_query}</h3>
                    <div className="research-query-text">Suchanfrage: {research.research_query}</div>
                    {research.teaser_text && (
                      <div className="research-teaser-full">{research.teaser_text}</div>
                    )}
                    <div className="research-footer">
                      <span className="research-date">{formatDate(research.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="feedback-tab">
            <div className="feedback-stats neuro-flow-list">
              <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
                <div className="stat-value">{data.feedback.stats.total_feedback}</div>
                <div className="stat-label">Gesamt-Feedback</div>
              </div>
              <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
                <div className="stat-value">{data.feedback.stats.average_rating.toFixed(1)}</div>
                <div className="stat-label">Durchschnitt</div>
              </div>
              <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
                <div className="stat-value">{data.feedback.stats.corrections_count}</div>
                <div className="stat-label">Korrekturen</div>
              </div>
              <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
                <div className="stat-value">{data.feedback.stats.applied_count}</div>
                <div className="stat-label">Angewendet</div>
              </div>
            </div>

            {data.feedback.insights.length > 0 && (
              <div className="section">
                <h2>Verbesserungs-Erkenntnisse</h2>
                <div className="insights-list">
                  {data.feedback.insights.map((insight, i) => (
                    <div key={i} className="insight-card">
                      <div className="insight-pattern">{insight.pattern}</div>
                      <div className="insight-frequency">Häufigkeit: {insight.frequency}</div>
                      <div className="insight-improvement">{insight.suggested_improvement}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="feedback-info">
              <p>
                Bewerte KI-Antworten direkt in der App, um die KI zu verbessern.
                Korrekturen werden automatisch in den Lernprozess aufgenommen.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="profile-tab">
            <div className="profile-header">
              <h2>Dein Profil</h2>
              <div className="profile-actions">
                <button type="button" className="edit-profile-button neuro-hover-lift" onClick={handleOpenEditProfile} aria-label="Profil bearbeiten">
                  Bearbeiten
                </button>
                <button type="button" className="analyze-button neuro-button" onClick={handleAnalyzeProfile} aria-label="Profil analysieren">
                  Analysieren
                </button>
              </div>
            </div>

            {showEditProfile && (
              <div className="edit-profile-modal">
                <div className="edit-profile-content">
                  <h3>Profil bearbeiten</h3>
                  <div className="form-group">
                    <label htmlFor="company_name">Unternehmen / Kontext</label>
                    <input
                      id="company_name"
                      type="text"
                      value={profileData.company_name || ''}
                      onChange={(e) => setProfileData({ ...profileData, company_name: e.target.value })}
                      placeholder="z.B. Mein Startup, Freiberuflich, Privat"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="industry">Branche / Bereich</label>
                    <input
                      id="industry"
                      type="text"
                      value={profileData.industry || ''}
                      onChange={(e) => setProfileData({ ...profileData, industry: e.target.value })}
                      placeholder="z.B. Software, Marketing, Design"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="role">Rolle</label>
                    <input
                      id="role"
                      type="text"
                      value={profileData.role || ''}
                      onChange={(e) => setProfileData({ ...profileData, role: e.target.value })}
                      placeholder="z.B. Entwickler, Projektmanager, CEO"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="tech_stack">Technologien (kommagetrennt)</label>
                    <input
                      id="tech_stack"
                      type="text"
                      value={(profileData.tech_stack || []).join(', ')}
                      onChange={(e) => setProfileData({
                        ...profileData,
                        tech_stack: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      })}
                      placeholder="z.B. React, Node.js, Python"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="goals">Ziele (kommagetrennt)</label>
                    <input
                      id="goals"
                      type="text"
                      value={(profileData.goals || []).join(', ')}
                      onChange={(e) => setProfileData({
                        ...profileData,
                        goals: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      })}
                      placeholder="z.B. Produktivität steigern, Neues lernen"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="pain_points">Herausforderungen (kommagetrennt)</label>
                    <input
                      id="pain_points"
                      type="text"
                      value={(profileData.pain_points || []).join(', ')}
                      onChange={(e) => setProfileData({
                        ...profileData,
                        pain_points: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      })}
                      placeholder="z.B. Zeitmanagement, Fokus halten"
                    />
                  </div>
                  <div className="form-actions">
                    <button type="button" className="cancel-btn neuro-hover-lift" onClick={() => setShowEditProfile(false)} aria-label="Abbrechen">
                      Abbrechen
                    </button>
                    <button type="button" className="save-btn neuro-button" onClick={handleSaveProfile} disabled={savingProfile} aria-label="Profil speichern">
                      {savingProfile ? 'Speichere...' : 'Speichern'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {data.profile?.stats ? (
              <>
                <div className="profile-stats">
                  <div className="stat-card">
                    <div className="stat-value">{data.profile.stats.profile_completeness}%</div>
                    <div className="stat-label">Profil-Vollständigkeit</div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ '--progress-width': `${data.profile.stats.profile_completeness}%` } as React.CSSProperties}
                      />
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{data.profile.stats.topics_tracked}</div>
                    <div className="stat-label">Erfasste Themen</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{data.profile.stats.tech_stack_count}</div>
                    <div className="stat-label">Technologien</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{data.profile.stats.insights_count}</div>
                    <div className="stat-label">Erkenntnisse</div>
                  </div>
                </div>

                {data.profile.stats.top_topics.length > 0 && (
                  <div className="section">
                    <h3>Häufigste Themen</h3>
                    <div className="topics-cloud">
                      {data.profile.stats.top_topics.map((topic, i) => (
                        <span
                          key={i}
                          className={`topic-badge topic-size-${Math.min(Math.floor(topic.count / 2), 5)}`}
                        >
                          {topic.topic} ({topic.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="profile-info">
                  <p>
                    Die KI lernt automatisch aus deinen Ideen und Aufgaben.
                    Je mehr du die App nutzt, desto besser versteht die KI deinen Kontext.
                  </p>
                  {data.profile.stats.last_updated && (
                    <p className="last-updated">
                      Letzte Aktualisierung: {formatDate(data.profile.stats.last_updated)}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state neuro-empty-state">
                <span className="neuro-empty-icon">👤</span>
                <h3 className="neuro-empty-title">Noch kein Profil erstellt</h3>
                <p className="neuro-empty-description">Starte die Profil-Analyse, um die KI über dich lernen zu lassen.</p>
                <button type="button" className="primary-button neuro-button" onClick={handleAnalyzeProfile} aria-label="Profil jetzt analysieren">
                  Jetzt analysieren
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions
function getSuggestionIcon(type: string): string {
  const icons: Record<string, string> = {
    topic_to_explore: '🔬',
    action_reminder: '⏰',
    connection_insight: '🔗',
    learning_opportunity: '📚',
    pattern_detected: '📊',
    focus_suggestion: '🎯',
  };
  return icons[type] || '💡';
}

function getSuggestionLabel(type: string): string {
  const labels: Record<string, string> = {
    topic_to_explore: 'Zu erkunden',
    action_reminder: 'Erinnerung',
    connection_insight: 'Verbindung',
    learning_opportunity: 'Lernchance',
    pattern_detected: 'Muster erkannt',
    focus_suggestion: 'Fokus-Empfehlung',
  };
  return labels[type] || type;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default LearningDashboard;
