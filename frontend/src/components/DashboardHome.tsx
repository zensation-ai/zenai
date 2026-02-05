import React, { useState, useEffect, useCallback, memo } from 'react';
import { AIContext } from './ContextSwitcher';
import axios from 'axios';
import { AI_PERSONALITY, AI_AVATAR } from '../utils/aiPersonality';
import { PageHeader } from './PageHeader';
import '../neurodesign.css';
import './DashboardHome.css';
import { logError } from '../utils/errors';

interface DashboardStats {
  today: number;
  thisWeek: number;
  highPriority: number;
  pendingTriage: number;
}

interface AIActivityItem {
  id: string;
  type: string;
  message: string;
  ideaId: string | null;
  timestamp: string;
}

interface RecentIdea {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: string;
  summary: string;
  createdAt: string;
}

/** API response idea structure (snake_case from backend) */
interface ApiIdea {
  id: string;
  title: string;
  type?: string;
  category?: string;
  priority?: string;
  summary?: string;
  createdAt?: string;
  created_at?: string;
}

interface DashboardHomeProps {
  context: AIContext;
  apiBase: string;
  onNavigate: (page: string) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TYPE_EMOJIS: Record<string, string> = {
  task: '📋',
  idea: '💡',
  note: '📝',
  question: '❓',
  reminder: '⏰',
  decision: '⚖️',
  goal: '🎯',
};

const ACTIVITY_ICONS: Record<string, string> = {
  idea_created: '✨',
  idea_structured: '🧠',
  idea_triaged: '📥',
  search_performed: '🔍',
  draft_generated: '📝',
  pattern_detected: '💡',
  suggestion_made: '💬',
  triage_completed: '✅',
  learning_applied: '📚',
};

/**
 * DashboardHome - Overview page with stats, search, and activity feed
 */
const DashboardHomeComponent: React.FC<DashboardHomeProps> = ({
  context,
  apiBase,
  onNavigate,
  showToast,
}) => {
  const [stats, setStats] = useState<DashboardStats>({
    today: 0,
    thisWeek: 0,
    highPriority: 0,
    pendingTriage: 0,
  });
  const [aiActivity, setAiActivity] = useState<AIActivityItem[]>([]);
  const [recentIdeas, setRecentIdeas] = useState<RecentIdea[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch dashboard data using axios (global interceptor handles auth)
  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);

    try {
      // Fetch stats, activity, and recent ideas in parallel
      // Auth is handled by the global axios interceptor in main.tsx
      const [statsRes, activityRes, ideasRes] = await Promise.all([
        axios.get(`${apiBase}/${context}/ideas/stats/summary`).catch(() => ({ data: null })),
        axios.get(`${apiBase}/${context}/ai-activity?limit=5`).catch(() => ({ data: null })),
        axios.get(`${apiBase}/${context}/ideas?limit=6`).catch(() => ({ data: null })),
      ]);

      // Process stats
      if (statsRes.data) {
        const statsData = statsRes.data;
        setStats({
          today: 0, // Would need additional endpoint for time-based stats
          thisWeek: statsData.total || 0,
          highPriority: statsData.byPriority?.high || 0,
          pendingTriage: 0, // Would need triage count endpoint
        });
      }

      // Process activity (axios returns data in .data)
      if (activityRes.data?.success && activityRes.data?.activities) {
        setAiActivity(activityRes.data.activities);
      }

      // Process recent ideas (axios returns data in .data)
      if (ideasRes.data?.ideas) {
        setRecentIdeas(
          ideasRes.data.ideas.map((idea: ApiIdea) => ({
            id: idea.id,
            title: idea.title,
            type: idea.type || 'note',
            category: idea.category || 'general',
            priority: idea.priority || 'medium',
            summary: idea.summary || '',
            createdAt: idea.createdAt || idea.created_at,
          }))
        );
      }
    } catch (err) {
      logError('DashboardHome:fetchDashboardData', err);
      showToast('Hmm, ich konnte die Daten gerade nicht laden. Versuch es gleich noch mal.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, context]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tagen`;

    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Guten Morgen';
    if (hour < 18) return 'Guten Tag';
    return 'Guten Abend';
  };

  // Quick action items for navigation
  // 2026: Konsistente Benennung, nur sinnvolle externe Seiten (keine redundanten Tabs)
  const quickActions = [
    { label: 'Neuer Gedanke', icon: '✨', page: 'ideas', primary: true },
    { label: 'KI-Werkstatt', icon: '🧠', page: 'ai-workshop' },
    { label: 'Sortieren', icon: '📋', page: 'triage' },
    { label: 'Lernen', icon: '📚', page: 'learning' },
  ];

  return (
    <div className="dashboard-home" data-context={context}>
      <PageHeader
        title="Dashboard"
        icon="🏠"
        subtitle={`${getGreeting()} – ${AI_PERSONALITY.name} ist bereit`}
        onBack={() => onNavigate('ideas')}
        backLabel="Gedanken"
      />

      <div className="dashboard-content">
        {/* AI Greeting Card */}
        <div className="dashboard-greeting liquid-glass-nav">
          <div className="greeting-avatar">
            <span className="dashboard-ai-avatar neuro-breathing">{AI_AVATAR.emoji}</span>
          </div>
          <div className="greeting-content">
            <h2>{getGreeting()}!</h2>
            <p>{AI_PERSONALITY.name} ist bereit, deine Gedanken zu strukturieren.</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-quick-actions">
          {quickActions.map((action) => (
            <button
              key={action.page}
              type="button"
              className={`quick-action-btn liquid-glass-nav neuro-hover-lift ${action.primary ? 'primary' : ''}`}
              onClick={() => onNavigate(action.page)}
              aria-label={action.label}
            >
              <span className="quick-action-icon">{action.icon}</span>
              <span className="quick-action-label">{action.label}</span>
            </button>
          ))}
        </div>

      {/* Stats Grid */}
      <div className="dashboard-stats">
        <button
          type="button"
          className="stat-card liquid-glass-nav neuro-hover-lift"
          onClick={() => onNavigate('ideas')}
          aria-label={`${isLoading ? 'Laden' : stats.thisWeek} Gedanken anzeigen`}
        >
          <span className="stat-card-icon" aria-hidden="true">📝</span>
          <span className="stat-card-value">
            {isLoading ? '-' : stats.thisWeek}
          </span>
          <span className="stat-card-label">Gedanken</span>
        </button>

        <button
          type="button"
          className="stat-card liquid-glass-nav highlight neuro-hover-lift"
          onClick={() => onNavigate('ideas')}
          aria-label={`${isLoading ? 'Laden' : stats.highPriority} Gedanken mit hoher Priorität anzeigen`}
        >
          <span className="stat-card-icon" aria-hidden="true">🔥</span>
          <span className="stat-card-value">
            {isLoading ? '-' : stats.highPriority}
          </span>
          <span className="stat-card-label">Priorität</span>
        </button>

        <button
          type="button"
          className="stat-card liquid-glass-nav neuro-hover-lift"
          onClick={() => onNavigate('triage')}
          aria-label={`${isLoading ? 'Laden' : stats.pendingTriage || 'Unbekannte Anzahl'} Gedanken zu sortieren`}
        >
          <span className="stat-card-icon" aria-hidden="true">📥</span>
          <span className="stat-card-value">
            {isLoading ? '-' : stats.pendingTriage || '?'}
          </span>
          <span className="stat-card-label">Zu sortieren</span>
        </button>

        <button
          type="button"
          className="stat-card liquid-glass-nav neuro-hover-lift"
          onClick={() => onNavigate('archive')}
          aria-label="Archiv anzeigen"
        >
          <span className="stat-card-icon" aria-hidden="true">📦</span>
          <span className="stat-card-value">-</span>
          <span className="stat-card-label">Archiv</span>
        </button>
      </div>

      {/* AI Activity Feed */}
      {aiActivity.length > 0 && (
        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">
              🧠 {AI_PERSONALITY.name}-Aktivität
            </h2>
          </div>
          <div className="ai-activity-feed liquid-glass-nav">
            {aiActivity.map((activity) => (
              <div key={activity.id} className="ai-activity-item">
                <div className="ai-activity-icon neuro-breathing">
                  {ACTIVITY_ICONS[activity.type] || '🧠'}
                </div>
                <div className="ai-activity-content">
                  <span className="ai-activity-message">{activity.message}</span>
                  <span className="ai-activity-time">
                    {formatRelativeTime(activity.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Ideas */}
      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <h2 className="dashboard-section-title">Neueste Gedanken</h2>
          <button
            type="button"
            className="dashboard-section-link neuro-hover-lift neuro-color-transition"
            onClick={() => onNavigate('ideas')}
            aria-label="Alle Gedanken anzeigen"
          >
            Alle anzeigen →
          </button>
        </div>

        {isLoading ? (
          <div className="dashboard-loading">
            <div className="loading-spinner neuro-loading-spinner" />
          </div>
        ) : recentIdeas.length > 0 ? (
          <div className="recent-ideas-grid">
            {recentIdeas.map((idea) => (
              <button
                type="button"
                key={idea.id}
                className="idea-card-mini liquid-glass-nav neuro-hover-lift"
                onClick={() => {
                  // Could navigate to idea detail
                  onNavigate('ideas');
                }}
                aria-label={`Gedanke: ${idea.title}`}
              >
                <div className="idea-card-mini-header">
                  <span className="idea-card-mini-type">
                    {TYPE_EMOJIS[idea.type] || '📝'}
                  </span>
                  <span className={`idea-card-mini-priority ${idea.priority}`}>
                    {idea.priority === 'high' ? '🔥' : ''}
                  </span>
                </div>
                <h3 className="idea-card-mini-title">{idea.title}</h3>
                <p className="idea-card-mini-summary">
                  {idea.summary.length > 80
                    ? idea.summary.substring(0, 80) + '...'
                    : idea.summary}
                </p>
                <div className="idea-card-mini-footer">
                  <span className="idea-card-mini-category">{idea.category}</span>
                  <span className="idea-card-mini-date">
                    {formatRelativeTime(idea.createdAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <span className="dashboard-empty-icon">💭</span>
            <p>Noch keine Gedanken erfasst.</p>
            <button
              type="button"
              className="dashboard-empty-btn neuro-button neuro-hover-lift"
              onClick={() => onNavigate('ideas')}
              aria-label="Zur Gedanken-Seite navigieren"
            >
              Zu Gedanken
            </button>
          </div>
        )}
      </section>
      </div>
    </div>
  );
};

export const DashboardHome = memo(DashboardHomeComponent);
export default DashboardHome;
