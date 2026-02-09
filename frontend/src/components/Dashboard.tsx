/**
 * Dashboard - Zentrale Startseite
 *
 * Zeigt Übersicht:
 * - Welcome Banner mit AI-Greeting
 * - Quick Stats (4 Metriken)
 * - Letzte Gedanken + KI-Aktivität
 */

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import axios from 'axios';
import type { Page } from '../types';
import type { AIContext } from './ContextSwitcher';
import { AIBrain } from './AIBrain';
import { SkeletonLoader } from './SkeletonLoader';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import { logError } from '../utils/errors';
import '../neurodesign.css';
import './Dashboard.css';

interface DashboardProps {
  context: AIContext;
  onNavigate: (page: Page) => void;
  isAIActive: boolean;
  ideasCount: number;
}

interface DashboardStats {
  total: number;
  highPriority: number;
  thisWeek: number;
}

interface RecentIdea {
  id: string;
  title: string;
  type: string;
  priority: string;
  created_at: string;
}

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

const TYPE_EMOJIS: Record<string, string> = {
  task: '📋', idea: '💡', note: '📝', question: '❓',
  insight: '🔍', problem: '⚠️', reminder: '⏰', goal: '🎯',
};

const ACTIVITY_ICONS: Record<string, string> = {
  idea_created: '✨', idea_structured: '🧠', search_performed: '🔍',
  draft_generated: '📝', pattern_detected: '💡', suggestion_made: '💬',
};

const DashboardComponent: React.FC<DashboardProps> = ({
  context,
  onNavigate,
  isAIActive,
  ideasCount,
}) => {
  const [stats, setStats] = useState<DashboardStats>({ total: 0, highPriority: 0, thisWeek: 0 });
  const [recentIdeas, setRecentIdeas] = useState<RecentIdea[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const greeting = useMemo(() => getTimeBasedGreeting(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, ideasRes, activityRes] = await Promise.all([
        axios.get(`/api/${context}/ideas/stats/summary`).catch(e => { logError('Dashboard:stats', e); return { data: null }; }),
        axios.get(`/api/${context}/ideas?limit=6`).catch(e => { logError('Dashboard:ideas', e); return { data: null }; }),
        axios.get(`/api/${context}/ai-activity?limit=5`).catch(e => { logError('Dashboard:activity', e); return { data: null }; }),
      ]);

      if (statsRes.data) {
        setStats({
          total: statsRes.data.total || 0,
          highPriority: statsRes.data.byPriority?.high || 0,
          thisWeek: statsRes.data.thisWeek || statsRes.data.total || 0,
        });
      }

      if (ideasRes.data?.ideas) {
        setRecentIdeas(ideasRes.data.ideas.slice(0, 6));
      }

      if (activityRes.data?.activities) {
        setActivity(activityRes.data.activities.slice(0, 5));
      }
    } catch (err) {
      logError('Dashboard:fetchData', err);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatTime = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.floor(diff / 86400000);
    return `vor ${days} Tagen`;
  };

  return (
    <div className="dashboard" data-context={context}>
      {/* Welcome Banner */}
      <section className="dash-welcome">
        <div className="dash-welcome-brain">
          <AIBrain isActive={isAIActive} activityType="thinking" ideasCount={ideasCount} size="small" />
        </div>
        <div className="dash-welcome-text">
          <h2 className="dash-greeting">{greeting.emoji} {greeting.greeting}</h2>
          <p className="dash-subtext">
            {ideasCount > 0
              ? `${ideasCount} Gedanken in deinem digitalen Gehirn`
              : 'Bereit für deinen ersten Gedanken?'
            }
          </p>
        </div>
        <button
          type="button"
          className="dash-welcome-action neuro-focus-ring"
          onClick={() => onNavigate('ideas')}
        >
          <span aria-hidden="true">💭</span>
          Neuer Gedanke
        </button>
      </section>

      {/* Quick Stats */}
      <section className="dash-stats" aria-label="Statistiken">
        {loading ? (
          <SkeletonLoader type="card" count={4} />
        ) : (
          <>
            <div className="dash-stat-card" role="link" tabIndex={0} title="Alle Gedanken anzeigen" onClick={() => onNavigate('ideas')} onKeyDown={(e) => e.key === 'Enter' && onNavigate('ideas')}>
              <span className="dash-stat-icon" aria-hidden="true">💭</span>
              <div className="dash-stat-data">
                <span className="dash-stat-value">{stats.total}</span>
                <span className="dash-stat-label">Gesamt</span>
              </div>
            </div>
            <div className="dash-stat-card priority" role="link" tabIndex={0} title="Wichtige Gedanken anzeigen" onClick={() => onNavigate('ideas')} onKeyDown={(e) => e.key === 'Enter' && onNavigate('ideas')}>
              <span className="dash-stat-icon" aria-hidden="true">🔥</span>
              <div className="dash-stat-data">
                <span className="dash-stat-value">{stats.highPriority}</span>
                <span className="dash-stat-label">Hohe Prioritat</span>
              </div>
            </div>
            <div className="dash-stat-card" role="link" tabIndex={0} title="Triage starten" onClick={() => onNavigate('triage')} onKeyDown={(e) => e.key === 'Enter' && onNavigate('triage')}>
              <span className="dash-stat-icon" aria-hidden="true">📋</span>
              <div className="dash-stat-data">
                <span className="dash-stat-value">{stats.thisWeek}</span>
                <span className="dash-stat-label">Diese Woche</span>
              </div>
            </div>
            <div className="dash-stat-card ai" role="link" tabIndex={0} title="KI-Werkstatt öffnen" onClick={() => onNavigate('ai-workshop')} onKeyDown={(e) => e.key === 'Enter' && onNavigate('ai-workshop')}>
              <span className="dash-stat-icon" aria-hidden="true">🧠</span>
              <div className="dash-stat-data">
                <span className={`dash-stat-value ${isAIActive ? 'active' : ''}`}>
                  {isAIActive ? 'Aktiv' : 'Bereit'}
                </span>
                <span className="dash-stat-label">KI-Status</span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Two Column: Recent Ideas + Activity */}
      <section className="dash-columns">
        {/* Recent Ideas */}
        <div className="dash-column">
          <div className="dash-column-header">
            <h3>Letzte Gedanken</h3>
            <button type="button" className="dash-see-all neuro-focus-ring" onClick={() => onNavigate('ideas')}>
              Alle anzeigen →
            </button>
          </div>
          <div className="dash-ideas-list">
            {loading ? (
              <SkeletonLoader type="card" count={4} />
            ) : recentIdeas.length === 0 ? (
              <div className="dash-empty">
                <span>💭</span>
                <p>Noch keine Gedanken. Starte jetzt!</p>
              </div>
            ) : (
              recentIdeas.map((idea) => (
                <button
                  key={idea.id}
                  type="button"
                  className="dash-idea-card neuro-focus-ring"
                  onClick={() => onNavigate('ideas')}
                >
                  <span className="dash-idea-type" aria-hidden="true">
                    {TYPE_EMOJIS[idea.type] || '📝'}
                  </span>
                  <div className="dash-idea-content">
                    <span className="dash-idea-title">{idea.title}</span>
                    <span className="dash-idea-time">{formatTime(idea.created_at)}</span>
                  </div>
                  {idea.priority === 'high' && (
                    <span className="dash-idea-priority" aria-label="Hohe Priorität">🔥</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* AI Activity */}
        <div className="dash-column">
          <div className="dash-column-header">
            <h3>KI-Aktivität</h3>
            <button type="button" className="dash-see-all neuro-focus-ring" onClick={() => onNavigate('insights')}>
              Insights →
            </button>
          </div>
          <div className="dash-activity-list">
            {loading ? (
              <SkeletonLoader type="card" count={4} />
            ) : activity.length === 0 ? (
              <div className="dash-empty">
                <span>🧠</span>
                <p>Noch keine KI-Aktivität</p>
              </div>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="dash-activity-item">
                  <span className="dash-activity-icon" aria-hidden="true">
                    {ACTIVITY_ICONS[item.type] || '🔹'}
                  </span>
                  <div className="dash-activity-content">
                    <span className="dash-activity-message">{item.message}</span>
                    <span className="dash-activity-time">{formatTime(item.timestamp)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export const Dashboard = memo(DashboardComponent);
export default Dashboard;
