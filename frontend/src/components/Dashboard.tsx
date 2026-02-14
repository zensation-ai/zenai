/**
 * Dashboard - Zentrale Startseite
 *
 * Zeigt Übersicht:
 * - Welcome Banner mit AI-Greeting + Kontext-Badge
 * - Quick Stats (5 Metriken inkl. Streak)
 * - 7-Tage Sparkline Trend
 * - Letzte Gedanken + KI-Aktivität
 * - Quick Start Grid
 */

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import axios from 'axios';
import type { Page, ApiStatus } from '../types';
import type { AIContext } from './ContextSwitcher';
import { AIBrain } from './AIBrain';
import { RisingBubbles } from './RisingBubbles';
import { SkeletonLoader } from './SkeletonLoader';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import { logError } from '../utils/errors';
import { ProactiveDigest } from './ProactiveDigest';
import '../neurodesign.css';
import './Dashboard.css';

interface DashboardProps {
  context: AIContext;
  onNavigate: (page: Page) => void;
  isAIActive: boolean;
  ideasCount: number;
  apiStatus: ApiStatus | null;
}

interface DashboardStats {
  total: number;
  highPriority: number;
  thisWeek: number;
  todayCount: number;
}

interface TrendPoint {
  date: string;
  count: number;
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
  activityType: string;
  message: string;
  ideaId: string | null;
  isRead: boolean;
  createdAt: string;
}

const CONTEXT_LABELS: Record<AIContext, { icon: string; label: string }> = {
  personal: { icon: '🏠', label: 'Privat' },
  work: { icon: '💼', label: 'Arbeit' },
  learning: { icon: '📚', label: 'Lernen' },
  creative: { icon: '🎨', label: 'Kreativ' },
};

const TYPE_EMOJIS: Record<string, string> = {
  task: '📋', idea: '💡', note: '📝', question: '❓',
  insight: '🔍', problem: '⚠️', reminder: '⏰', goal: '🎯',
};

const ACTIVITY_ICONS: Record<string, string> = {
  idea_created: '✨', idea_structured: '🧠', search_performed: '🔍',
  draft_generated: '📝', pattern_detected: '💡', suggestion_made: '💬',
  idea_evolved: '🌱', routine_detected: '🔄', context_switch: '🔀',
};

interface QuickStartItem {
  icon: string;
  label: string;
  description: string;
  page: Page;
  colorClass: string;
}

const QUICK_START_ITEMS: QuickStartItem[] = [
  { icon: '💡', label: 'Neuer Gedanke', description: 'Idee erfassen', page: 'ideas', colorClass: 'qs-ideas' },
  { icon: '💬', label: 'Chat starten', description: 'KI-Konversation', page: 'chat', colorClass: 'qs-chat' },
  { icon: '\uD83D\uDCC5', label: 'Kalender', description: 'Termine verwalten', page: 'calendar', colorClass: 'qs-calendar' },
  { icon: '📚', label: 'Wissensbasis', description: 'Dokumente durchsuchen', page: 'documents', colorClass: 'qs-documents' },
  { icon: '📊', label: 'Insights', description: 'Trends entdecken', page: 'insights', colorClass: 'qs-insights' },
  { icon: '🧪', label: 'Werkstatt', description: 'KI-Vorschläge', page: 'workshop', colorClass: 'qs-workshop' },
];

interface UpcomingEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  location?: string;
  ai_generated: boolean;
}

const EVENT_ICONS: Record<string, string> = {
  appointment: '\uD83D\uDCC5',
  reminder: '\u23F0',
  deadline: '\u26A0\uFE0F',
  travel_block: '\uD83D\uDE97',
  focus_time: '\uD83C\uDFAF',
};

/** SVG Sparkline for 7-day trend */
const Sparkline: React.FC<{ data: TrendPoint[] }> = memo(({ data }) => {
  if (data.length === 0) return null;

  // Fill missing days in last 7 days
  const now = new Date();
  const days: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const point = data.find(p => p.date === dateStr);
    days.push(point?.count || 0);
  }

  const max = Math.max(...days, 1);
  const width = 200;
  const height = 32;
  const padding = 2;

  const points = days.map((val, i) => {
    const x = padding + (i / 6) * (width - padding * 2);
    const y = height - padding - (val / max) * (height - padding * 2);
    return `${x},${y}`;
  });

  const total = days.reduce((s, v) => s + v, 0);

  return (
    <div className="dash-sparkline" aria-label={`${total} Gedanken in den letzten 7 Tagen`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="dash-sparkline-svg">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--primary, #ff6b35)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {days.map((val, i) => {
          const x = padding + (i / 6) * (width - padding * 2);
          const y = height - padding - (val / max) * (height - padding * 2);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={val > 0 ? 2.5 : 0}
              fill="var(--primary, #ff6b35)"
            />
          );
        })}
      </svg>
      <span className="dash-sparkline-label">7-Tage-Trend</span>
    </div>
  );
});
Sparkline.displayName = 'Sparkline';

const DashboardComponent: React.FC<DashboardProps> = ({
  context,
  onNavigate,
  isAIActive,
  ideasCount,
  apiStatus,
}) => {
  const [stats, setStats] = useState<DashboardStats>({ total: 0, highPriority: 0, thisWeek: 0, todayCount: 0 });
  const [streak, setStreak] = useState(0);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [recentIdeas, setRecentIdeas] = useState<RecentIdea[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const greeting = useMemo(() => getTimeBasedGreeting(), []);
  const contextInfo = CONTEXT_LABELS[context];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/${context}/analytics/dashboard-summary`).catch(e => {
        logError('Dashboard:summary', e);
        return { data: null };
      });

      if (res.data) {
        const d = res.data;
        setStats({
          total: d.stats?.total || 0,
          highPriority: d.stats?.highPriority || 0,
          thisWeek: d.stats?.thisWeek || 0,
          todayCount: d.stats?.todayCount || 0,
        });
        setStreak(d.streak || 0);
        setTrend(d.trend || []);
        setRecentIdeas((d.recentIdeas || []).slice(0, 6));
        setActivity((d.activities || []).slice(0, 5));
      }

      // Fetch AI activity with unread count
      axios.get(`/api/${context}/ai-activity`, { params: { limit: 10 } })
        .then(r => {
          if (r.data?.success) {
            setActivity((r.data.activities || []).slice(0, 5));
            setUnreadCount(r.data.unreadCount || 0);
          }
        })
        .catch(() => { /* Activity feed might not be available */ });

      // Fetch upcoming calendar events (next 48 hours)
      axios.get(`/api/${context}/calendar/upcoming`, { params: { hours: 48, limit: 5 } })
        .then(r => { if (r.data?.success) setUpcomingEvents(r.data.data || []); })
        .catch(() => { /* Calendar might not be set up yet */ });

      // If response came back null, retry once after a short delay
      if (!res.data && !hasFetched.current) {
        hasFetched.current = true;
        setTimeout(() => fetchData(), 1500);
        return;
      }
    } catch (err) {
      logError('Dashboard:fetchData', err);
    } finally {
      setLoading(false);
    }
  }, [context]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await axios.post(`/api/${context}/ai-activity/mark-read`);
      setUnreadCount(0);
      setActivity(prev => prev.map(a => ({ ...a, isRead: true })));
    } catch (err) {
      logError('Dashboard:markRead', err);
    }
  }, [context]);

  // Wait for API to be ready before fetching dashboard data
  useEffect(() => {
    if (apiStatus) {
      hasFetched.current = false;
      fetchData();
    }
  }, [apiStatus, fetchData]);

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

  const welcomeSubtext = useMemo(() => {
    if (ideasCount === 0) return 'Bereit für deinen ersten Gedanken?';
    if (streak > 3) return `${streak} Tage in Folge aktiv — weiter so!`;
    if (stats.todayCount > 0) return `Heute schon ${stats.todayCount} neue Gedanken`;
    return `${ideasCount} Gedanken in deinem digitalen Gehirn`;
  }, [ideasCount, streak, stats.todayCount]);

  return (
    <div className={`dashboard${isAIActive ? ' ai-active' : ''}`} data-context={context}>
      <RisingBubbles variant="full" />

      {/* Welcome Banner */}
      <section className="dash-welcome">
        <div className="dash-welcome-brain">
          <AIBrain isActive={isAIActive} activityType="thinking" ideasCount={ideasCount} size="small" />
        </div>
        <div className="dash-welcome-text">
          <h2 className="dash-greeting">{greeting.emoji} {greeting.greeting}</h2>
          <p className="dash-subtext">{welcomeSubtext}</p>
        </div>
        <span className="dash-context-badge" aria-label={`Kontext: ${contextInfo.label}`}>
          <span aria-hidden="true">{contextInfo.icon}</span>
          {contextInfo.label}
        </span>
        <button
          type="button"
          className="dash-welcome-action neuro-focus-ring"
          onClick={() => onNavigate('ideas')}
        >
          <span aria-hidden="true">💡</span>
          Neuer Gedanke
        </button>
      </section>

      {/* Quick Start Grid */}
      <section className="dash-quickstart" aria-label="Schnellstart">
        <h3 className="dash-quickstart-title">Schnellstart</h3>
        <div className="dash-quickstart-grid">
          {QUICK_START_ITEMS.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`dash-qs-card ${item.colorClass} neuro-focus-ring`}
              onClick={() => onNavigate(item.page)}
            >
              <span className="dash-qs-icon" aria-hidden="true">{item.icon}</span>
              <div className="dash-qs-text">
                <span className="dash-qs-label">{item.label}</span>
                <span className="dash-qs-desc">{item.description}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* AI Digest */}
      <ProactiveDigest context={context} onNavigate={onNavigate} />

      {/* Quick Stats */}
      <section className="dash-stats" aria-label="Statistiken">
        {loading ? (
          <SkeletonLoader type="card" count={5} />
        ) : (
          <>
            <button type="button" className="dash-stat-card" title="Alle Gedanken anzeigen" onClick={() => onNavigate('ideas')}>
              <span className="dash-stat-icon" aria-hidden="true">💡</span>
              <div className="dash-stat-data">
                <span className="dash-stat-value">{stats.total}</span>
                <span className="dash-stat-label">Gesamt</span>
              </div>
            </button>
            <button type="button" className="dash-stat-card" title="Gedanken diese Woche" onClick={() => onNavigate('ideas')}>
              <span className="dash-stat-icon" aria-hidden="true">📅</span>
              <div className="dash-stat-data">
                <span className="dash-stat-value">{stats.thisWeek}</span>
                <span className="dash-stat-label">Diese Woche</span>
              </div>
            </button>
            <button type="button" className="dash-stat-card priority" title="Wichtige Gedanken anzeigen" onClick={() => onNavigate('ideas')}>
              <span className="dash-stat-icon" aria-hidden="true">🔥</span>
              <div className="dash-stat-data">
                <span className="dash-stat-value">{stats.highPriority}</span>
                <span className="dash-stat-label">Hohe Priorität</span>
              </div>
            </button>
            <button type="button" className="dash-stat-card streak" title="Deine aktuelle Streak" onClick={() => onNavigate('insights')}>
              <span className="dash-stat-icon" aria-hidden="true">{streak > 0 ? '🔥' : '💤'}</span>
              <div className="dash-stat-data">
                <span className="dash-stat-value">{streak} {streak === 1 ? 'Tag' : 'Tage'}</span>
                <span className="dash-stat-label">Streak</span>
              </div>
            </button>
            <button type="button" className="dash-stat-card ai" title="Chat mit ZenAI" onClick={() => onNavigate('chat')}>
              <span className="dash-stat-icon" aria-hidden="true">🧠</span>
              <div className="dash-stat-data">
                <span className={`dash-stat-value ${isAIActive ? 'active' : ''}`}>
                  {isAIActive ? 'Aktiv' : 'Bereit'}
                </span>
                <span className="dash-stat-label">KI-Status</span>
              </div>
            </button>
          </>
        )}
      </section>

      {/* Sparkline Trend */}
      {!loading && <Sparkline data={trend} />}

      {/* Upcoming Events */}
      {!loading && upcomingEvents.length > 0 && (
        <section className="dash-upcoming" aria-label="Nächste Termine">
          <div className="dash-column-header">
            <h3>{'\uD83D\uDCC5'} Nächste Termine</h3>
            <button type="button" className="dash-see-all neuro-focus-ring" onClick={() => onNavigate('calendar')}>
              Kalender {'\u2192'}
            </button>
          </div>
          <div className="dash-upcoming-list">
            {upcomingEvents.map((evt) => {
              const startDate = new Date(evt.start_time);
              const timeStr = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
              const dayStr = startDate.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
              return (
                <button
                  key={evt.id}
                  type="button"
                  className="dash-upcoming-item neuro-focus-ring"
                  onClick={() => onNavigate('calendar')}
                >
                  <span className="dash-upcoming-icon" aria-hidden="true">
                    {EVENT_ICONS[evt.event_type] || '\uD83D\uDCC5'}
                  </span>
                  <div className="dash-upcoming-content">
                    <span className="dash-upcoming-title">{evt.title}</span>
                    <span className="dash-upcoming-time">{dayStr}, {timeStr}{evt.location ? ` \u2022 ${evt.location}` : ''}</span>
                  </div>
                  {evt.ai_generated && <span className="dash-upcoming-ai" title="KI-generiert">KI</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

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
                <span aria-hidden="true">💡</span>
                <p>Noch keine Gedanken im Bereich <strong>{contextInfo.label}</strong>.</p>
                <button
                  type="button"
                  className="dash-empty-cta neuro-focus-ring"
                  onClick={() => onNavigate('ideas')}
                >
                  Ersten Gedanken erfassen
                </button>
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
            <h3>
              KI-Aktivität
              {unreadCount > 0 && (
                <span className="dash-unread-badge" aria-label={`${unreadCount} ungelesen`}>
                  {unreadCount}
                </span>
              )}
            </h3>
            <div className="dash-column-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="dash-mark-read-btn neuro-focus-ring"
                  onClick={handleMarkAllRead}
                  aria-label="Alle als gelesen markieren"
                >
                  Alle gelesen
                </button>
              )}
              <button type="button" className="dash-see-all neuro-focus-ring" onClick={() => onNavigate('insights')}>
                Insights →
              </button>
            </div>
          </div>
          <div className="dash-activity-list">
            {loading ? (
              <SkeletonLoader type="card" count={4} />
            ) : activity.length === 0 ? (
              <div className="dash-empty">
                <span aria-hidden="true">🧠</span>
                <p>Noch keine KI-Aktivität. Starte einen Chat oder erfasse Gedanken, damit die KI für dich arbeiten kann.</p>
              </div>
            ) : (
              activity.map((item) => {
                const isClickable = !!item.ideaId;
                const Wrapper = isClickable ? 'button' : 'div';
                return (
                  <Wrapper
                    key={item.id}
                    className={`dash-activity-item ${!item.isRead ? 'unread' : ''} ${isClickable ? 'clickable' : ''}`}
                    {...(isClickable && {
                      type: 'button' as const,
                      onClick: () => onNavigate('ideas'),
                    })}
                  >
                    <span className="dash-activity-icon" aria-hidden="true">
                      {ACTIVITY_ICONS[item.activityType] || '🔹'}
                    </span>
                    <div className="dash-activity-content">
                      <span className="dash-activity-message">{item.message}</span>
                      <span className="dash-activity-time">{formatTime(item.createdAt)}</span>
                    </div>
                    {!item.isRead && <span className="dash-activity-dot" aria-hidden="true" />}
                  </Wrapper>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export const Dashboard = memo(DashboardComponent);
export default Dashboard;
