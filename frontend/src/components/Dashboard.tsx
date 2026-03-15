/**
 * Dashboard - Bento Grid Desktop
 *
 * Personal AI OS landing page with widget-style bento layout.
 * Sections span different grid areas for a modern "desktop" feel.
 *
 * Migrated to React Query for automatic caching, deduplication,
 * and background refetching (Phase 4.1b).
 */

import { useMemo, memo } from 'react';
import type { Page, ApiStatus } from '../types';
import type { AIContext } from './ContextSwitcher';
import { AIBrain } from './AIBrain';
import { RisingBubbles } from './RisingBubbles';
import { SkeletonLoader } from './SkeletonLoader';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import { ProactiveDigest } from './ProactiveDigest';
import { ProactiveBriefingWidget } from './ProactiveBriefing/ProactiveBriefingWidget';
import {
  useDashboardSummaryQuery,
  useAIPulseQuery,
  useUpcomingEventsQuery,
  useMarkActivityReadMutation,
} from '../hooks/queries/useDashboard';
import type { TrendPoint } from '../hooks/queries/useDashboard';
import './Dashboard.css';

interface DashboardProps {
  context: AIContext;
  onNavigate: (page: Page) => void;
  isAIActive: boolean;
  ideasCount: number;
  apiStatus: ApiStatus | null;
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

interface QuickNavItem {
  icon: string;
  label: string;
  page: Page;
  accent: string;
}

const QUICK_NAV: QuickNavItem[] = [
  { icon: '💡', label: 'Gedanken', page: 'ideas', accent: 'var(--accent-ideas, #f59e0b)' },
  { icon: '💬', label: 'Chat', page: 'chat', accent: 'var(--accent-chat, #f97316)' },
  { icon: '📅', label: 'Planer', page: 'calendar', accent: 'var(--accent-calendar, #3b82f6)' },
  { icon: '📚', label: 'Wissen', page: 'documents', accent: 'var(--accent-docs, #6366f1)' },
  { icon: '📊', label: 'Insights', page: 'insights', accent: 'var(--accent-insights, #10b981)' },
  { icon: '🧪', label: 'Werkstatt', page: 'workshop', accent: 'var(--accent-workshop, #8b5cf6)' },
  { icon: '✉️', label: 'Email', page: 'email', accent: 'var(--accent-email, #ec4899)' },
  { icon: '🧠', label: 'Meine KI', page: 'my-ai', accent: 'var(--accent-ai, #a855f7)' },
];

const EVENT_ICONS: Record<string, string> = {
  appointment: '📅', reminder: '⏰', deadline: '⚠️',
  travel_block: '🚗', focus_time: '🎯',
};

/** SVG Sparkline for 7-day trend */
const Sparkline = memo<{ data: TrendPoint[] }>(({ data }) => {
  if (data.length === 0) return null;

  const now = new Date();
  const days: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const point = data.find(p => p.date === dateStr);
    days.push(point?.count || 0);
  }

  const gradientId = `sparkFill-${days.join('-')}`;
  const max = Math.max(...days, 1);
  const width = 200;
  const height = 40;
  const padding = 4;

  const points = days.map((val, i) => {
    const x = padding + (i / 6) * (width - padding * 2);
    const y = height - padding - (val / max) * (height - padding * 2);
    return `${x},${y}`;
  });

  // Area fill path
  const areaPath = [
    `M ${padding},${height - padding}`,
    ...days.map((val, i) => {
      const x = padding + (i / 6) * (width - padding * 2);
      const y = height - padding - (val / max) * (height - padding * 2);
      return `L ${x},${y}`;
    }),
    `L ${width - padding},${height - padding} Z`,
  ].join(' ');

  return (
    <div className="bento-sparkline" aria-label={`${days.reduce((s, v) => s + v, 0)} Gedanken in den letzten 7 Tagen`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary, #ff6b35)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--primary, #ff6b35)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--primary, #ff6b35)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {days.map((val, i) => (
          <circle
            key={i}
            cx={padding + (i / 6) * (width - padding * 2)}
            cy={height - padding - (val / max) * (height - padding * 2)}
            r={val > 0 ? 3 : 0}
            fill="var(--primary, #ff6b35)"
          />
        ))}
      </svg>
    </div>
  );
});
Sparkline.displayName = 'Sparkline';

/** Format relative time (e.g. "vor 5 Min.") */
function formatTime(dateString: string): string {
  if (!dateString) return '';
  const time = new Date(dateString).getTime();
  if (isNaN(time)) return '';
  const diff = Date.now() - time;
  if (diff < 0) return 'gerade eben';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(diff / 86400000);
  return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
}

const DashboardComponent: React.FC<DashboardProps> = ({
  context,
  onNavigate,
  isAIActive,
  ideasCount,
  apiStatus,
}) => {
  // React Query hooks — replaces 7+ useState + fetchData callback + useEffect
  const summaryEnabled = !!apiStatus;
  const summary = useDashboardSummaryQuery(context, summaryEnabled);
  const aiPulse = useAIPulseQuery(context, summaryEnabled);
  const events = useUpcomingEventsQuery(context, summaryEnabled);
  const markReadMutation = useMarkActivityReadMutation(context);

  // Derived state from queries
  const stats = summary.data?.stats ?? { total: 0, highPriority: 0, thisWeek: 0, todayCount: 0 };
  const streak = summary.data?.streak ?? 0;
  const trend = summary.data?.trend ?? [];
  const recentIdeas = summary.data?.recentIdeas ?? [];
  const activity = summary.data?.activities ?? [];
  const unreadCount = summary.data?.unreadCount ?? 0;
  const upcomingEvents = events.data ?? [];
  const aiPulseData = aiPulse.data ?? { memoryFacts: 0, procedures: 0, sleepCycles: 0, ragQueries: 0 };

  const loading = summary.isLoading;
  const fetchError = summary.isError;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const greeting = useMemo(() => getTimeBasedGreeting(), [context]);
  const contextInfo = CONTEXT_LABELS[context];

  const welcomeSubtext = useMemo(() => {
    if (ideasCount === 0) return 'Bereit fuer deinen ersten Gedanken?';
    if (streak > 3) return `${streak} Tage in Folge aktiv`;
    if (stats.todayCount > 0) return `Heute schon ${stats.todayCount} neue Gedanken`;
    return `${ideasCount} Gedanken in deinem digitalen Gehirn`;
  }, [ideasCount, streak, stats.todayCount]);

  return (
    <div className={`bento-dashboard${isAIActive ? ' ai-active' : ''}`} data-context={context} role="region" aria-label="Dashboard">
      <RisingBubbles variant="subtle" />

      {/* ===== BENTO GRID ===== */}
      <div className="bento-grid" aria-live="polite" aria-relevant="additions text">

        {/* Hero: Welcome */}
        <section className="bento-card bento-hero">
          <div className="bento-hero-content">
            <div className="bento-hero-brain">
              <AIBrain isActive={isAIActive} activityType="thinking" ideasCount={ideasCount} size="small" />
            </div>
            <div className="bento-hero-text">
              <h2 className="bento-greeting">{greeting.emoji} {greeting.greeting}</h2>
              <p className="bento-subtext">{welcomeSubtext}</p>
            </div>
            <span className="bento-context-badge">
              <span aria-hidden="true">{contextInfo.icon}</span>
              {contextInfo.label}
            </span>
          </div>
          <button
            type="button"
            className="bento-cta"
            onClick={() => onNavigate('ideas')}
          >
            <span aria-hidden="true">💡</span>
            Neuer Gedanke
          </button>
        </section>

        {/* Stat tiles */}
        {fetchError && !loading ? (
          <div className="bento-card bento-stat" style={{ gridColumn: 'span 4', textAlign: 'center', padding: '1.5rem' }}>
            <p style={{ marginBottom: '0.75rem', opacity: 0.7 }}>Daten konnten nicht geladen werden.</p>
            <button type="button" className="neuro-focus-ring" onClick={() => summary.refetch()} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--glass-bg)' }}>
              Erneut versuchen
            </button>
          </div>
        ) : loading ? (
          <>
            <div className="bento-card bento-stat"><SkeletonLoader type="card" count={1} /></div>
            <div className="bento-card bento-stat"><SkeletonLoader type="card" count={1} /></div>
            <div className="bento-card bento-stat"><SkeletonLoader type="card" count={1} /></div>
            <div className="bento-card bento-stat"><SkeletonLoader type="card" count={1} /></div>
          </>
        ) : (
          <>
            <button type="button" className="bento-card bento-stat" onClick={() => onNavigate('ideas')}>
              <span className="bento-stat-icon">💡</span>
              <span className="bento-stat-value">{stats.total}</span>
              <span className="bento-stat-label">Gesamt</span>
            </button>
            <button type="button" className="bento-card bento-stat" onClick={() => onNavigate('ideas')}>
              <span className="bento-stat-icon">📅</span>
              <span className="bento-stat-value">{stats.thisWeek}</span>
              <span className="bento-stat-label">Diese Woche</span>
            </button>
            <button type="button" className="bento-card bento-stat bento-stat--hot" onClick={() => onNavigate('ideas')}>
              <span className="bento-stat-icon">🔥</span>
              <span className="bento-stat-value">{stats.highPriority}</span>
              <span className="bento-stat-label">Wichtig</span>
            </button>
            <button type="button" className="bento-card bento-stat bento-stat--streak" onClick={() => onNavigate('insights')}>
              <span className="bento-stat-icon">{streak > 0 ? '🔥' : '💤'}</span>
              <span className="bento-stat-value">{streak}d</span>
              <span className="bento-stat-label">Streak</span>
            </button>
          </>
        )}

        {/* Trend sparkline (spans 2 cols) */}
        {!loading && !fetchError && (
          <div className="bento-card bento-trend">
            <div className="bento-trend-header">
              <span className="bento-trend-title">7-Tage-Trend</span>
              <span className="bento-trend-total">{trend.reduce((s, p) => s + p.count, 0)} Gedanken</span>
            </div>
            <Sparkline data={trend} />
          </div>
        )}

        {/* AI Status (spans 2 cols) */}
        <section className="bento-card bento-ai-status" aria-label="KI-Systemstatus">
          <button type="button" className="bento-ai-status-main" onClick={() => onNavigate('chat')}>
            <div className="bento-ai-indicator">
              <span className={`bento-ai-dot ${isAIActive ? 'active' : ''}`} />
              <span className="bento-ai-label">{isAIActive ? 'KI arbeitet...' : 'KI bereit'}</span>
            </div>
            <span className="bento-ai-action">Chat starten →</span>
          </button>
          <div className="bento-ai-pulse">
            <button type="button" className="bento-pulse-item" onClick={() => onNavigate('my-ai')} title="Gelernte Denkmuster">
              <span className="bento-pulse-value">{aiPulseData.memoryFacts}</span>
              <span className="bento-pulse-label">Denkmuster</span>
            </button>
            <button type="button" className="bento-pulse-item" onClick={() => onNavigate('my-ai')} title="Gelernte Prozeduren">
              <span className="bento-pulse-value">{aiPulseData.procedures}</span>
              <span className="bento-pulse-label">Prozeduren</span>
            </button>
            <button type="button" className="bento-pulse-item" onClick={() => onNavigate('insights')} title="Schlaf-Zyklen der KI">
              <span className="bento-pulse-value">{aiPulseData.sleepCycles}</span>
              <span className="bento-pulse-label">Schlaf-Zyklen</span>
            </button>
            <button type="button" className="bento-pulse-item" onClick={() => onNavigate('insights')} title="RAG-Anfragen">
              <span className="bento-pulse-value">{aiPulseData.ragQueries}</span>
              <span className="bento-pulse-label">RAG-Suchen</span>
            </button>
          </div>
        </section>

        {/* Quick Nav */}
        <div className="bento-card bento-quicknav">
          <h3 className="bento-section-title">Schnellzugriff</h3>
          <div className="bento-nav-grid">
            {QUICK_NAV.map((item) => (
              <button
                key={item.page}
                type="button"
                className="bento-nav-item"
                onClick={() => onNavigate(item.page)}
                style={{ '--nav-accent': item.accent } as React.CSSProperties}
              >
                <span className="bento-nav-icon">{item.icon}</span>
                <span className="bento-nav-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Proactive Digest */}
        <div className="bento-card bento-digest">
          <ProactiveDigest context={context} onNavigate={onNavigate} />
        </div>

        {/* Proactive Briefing */}
        <div className="bento-card bento-briefing">
          <ProactiveBriefingWidget context={context} onNavigate={onNavigate} />
        </div>

        {/* Upcoming Events */}
        {!loading && upcomingEvents.length > 0 && (
          <section className="bento-card bento-events">
            <div className="bento-card-header">
              <h3>📅 Termine</h3>
              <button type="button" className="bento-link" onClick={() => onNavigate('calendar')}>
                Alle →
              </button>
            </div>
            <div className="bento-events-list">
              {upcomingEvents.map((evt) => {
                const startDate = new Date(evt.start_time);
                const timeStr = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                const dayStr = startDate.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
                return (
                  <button
                    key={evt.id}
                    type="button"
                    className="bento-event-row"
                    onClick={() => onNavigate('calendar')}
                  >
                    <span className="bento-event-icon">{EVENT_ICONS[evt.event_type] || '📅'}</span>
                    <div className="bento-event-info">
                      <span className="bento-event-title">{evt.title}</span>
                      <span className="bento-event-time">{dayStr}, {timeStr}</span>
                    </div>
                    {evt.ai_generated && <span className="bento-ai-tag">KI</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent Ideas */}
        <section className="bento-card bento-recent">
          <div className="bento-card-header">
            <h3>Letzte Gedanken</h3>
            <button type="button" className="bento-link" onClick={() => onNavigate('ideas')}>
              Alle →
            </button>
          </div>
          {loading ? (
            <SkeletonLoader type="card" count={3} />
          ) : recentIdeas.length === 0 ? (
            <div className="bento-empty">
              <span>💡</span>
              <p>Noch keine Gedanken in <strong>{contextInfo.label}</strong>.</p>
              <button type="button" className="bento-empty-cta" onClick={() => onNavigate('ideas')}>
                Ersten Gedanken erfassen
              </button>
            </div>
          ) : (
            <div className="bento-ideas-list">
              {recentIdeas.map((idea) => (
                <button
                  key={idea.id}
                  type="button"
                  className="bento-idea-row"
                  onClick={() => onNavigate('ideas')}
                >
                  <span className="bento-idea-type">{TYPE_EMOJIS[idea.type] || '📝'}</span>
                  <div className="bento-idea-info">
                    <span className="bento-idea-title">{idea.title}</span>
                    <span className="bento-idea-time">{formatTime(idea.created_at)}</span>
                  </div>
                  {idea.priority === 'high' && <span className="bento-idea-hot">🔥</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* AI Activity */}
        <section className="bento-card bento-activity">
          <div className="bento-card-header">
            <h3>
              KI-Aktivitaet
              {unreadCount > 0 && <span className="bento-badge">{unreadCount}</span>}
            </h3>
            <div className="bento-card-actions">
              {unreadCount > 0 && (
                <button type="button" className="bento-link-muted" onClick={() => markReadMutation.mutate()}>
                  Gelesen
                </button>
              )}
              <button type="button" className="bento-link" onClick={() => onNavigate('insights')}>
                Insights →
              </button>
            </div>
          </div>
          {loading ? (
            <SkeletonLoader type="card" count={3} />
          ) : activity.length === 0 ? (
            <div className="bento-empty">
              <span>🧠</span>
              <p>Starte einen Chat oder erfasse Gedanken.</p>
            </div>
          ) : (
            <div className="bento-activity-list">
              {activity.map((item) => (
                <div
                  key={item.id}
                  className={`bento-activity-row ${!item.isRead ? 'unread' : ''}`}
                  {...(item.ideaId ? {
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => onNavigate('ideas'),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate('ideas'); }
                    },
                  } : {})}
                >
                  <span className="bento-activity-icon">{ACTIVITY_ICONS[item.activityType] || '🔹'}</span>
                  <div className="bento-activity-info">
                    <span className="bento-activity-msg">{item.message}</span>
                    <span className="bento-activity-time">{formatTime(item.createdAt)}</span>
                  </div>
                  {!item.isRead && <span className="bento-unread-dot" />}
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export const Dashboard = memo(DashboardComponent);
export default Dashboard;
