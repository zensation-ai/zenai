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
import { motion } from 'framer-motion';
import type { Page, ApiStatus } from '../types';
import type { AIContext } from './ContextSwitcher';
import { AIBrain } from './AIBrain';
import { RisingBubbles } from './RisingBubbles';
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
import { Button, Card, Badge, Skeleton, EmptyState } from '../design-system';
import { getPageIcon } from '../utils/navIcons';
import {
  Lightbulb,
  Calendar,
  Flame,
  Moon,
  ClipboardList,
  FileText,
  HelpCircle,
  Search,
  AlertTriangle,
  Clock,
  Target,
  Sparkles,
  Brain,
  Pencil,
  MessageSquare,
  Sprout,
  RefreshCw,
  Shuffle,
  Home,
  Briefcase,
  BookOpen,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import { staggerItem, usePrefersReducedMotion } from '../utils/animations';
import { SetupChecklist } from './SetupChecklist';
import './Dashboard.css';

interface DashboardProps {
  context: AIContext;
  onNavigate: (page: Page) => void;
  isAIActive: boolean;
  ideasCount: number;
  apiStatus: ApiStatus | null;
}

const CONTEXT_ICONS: Record<AIContext, LucideIcon> = {
  personal: Home,
  work: Briefcase,
  learning: BookOpen,
  creative: Palette,
};

const CONTEXT_LABELS: Record<AIContext, { label: string }> = {
  personal: { label: 'Privat' },
  work: { label: 'Arbeit' },
  learning: { label: 'Lernen' },
  creative: { label: 'Kreativ' },
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  task: ClipboardList, idea: Lightbulb, note: FileText, question: HelpCircle,
  insight: Search, problem: AlertTriangle, reminder: Clock, goal: Target,
};

const ACTIVITY_ICON_MAP: Record<string, LucideIcon> = {
  idea_created: Sparkles, idea_structured: Brain, search_performed: Search,
  draft_generated: Pencil, pattern_detected: Lightbulb, suggestion_made: MessageSquare,
  idea_evolved: Sprout, routine_detected: RefreshCw, context_switch: Shuffle,
};

interface QuickNavItem {
  label: string;
  page: Page;
  accent: string;
}

const QUICK_NAV: QuickNavItem[] = [
  { label: 'Gedanken', page: 'ideas', accent: 'var(--accent-ideas, #f59e0b)' },
  { label: 'Chat', page: 'chat', accent: 'var(--accent-chat, #f97316)' },
  { label: 'Planer', page: 'calendar', accent: 'var(--accent-calendar, #3b82f6)' },
  { label: 'Wissen', page: 'documents', accent: 'var(--accent-docs, #6366f1)' },
  { label: 'Insights', page: 'insights', accent: 'var(--accent-insights, #10b981)' },
  { label: 'Werkstatt', page: 'workshop', accent: 'var(--accent-workshop, #8b5cf6)' },
  { label: 'Email', page: 'email', accent: 'var(--accent-email, #ec4899)' },
  { label: 'Meine KI', page: 'my-ai', accent: 'var(--accent-ai, #a855f7)' },
];

const EVENT_ICON_MAP: Record<string, LucideIcon> = {
  appointment: Calendar, reminder: Clock, deadline: AlertTriangle,
  travel_block: Target, focus_time: Target,
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
  const reducedMotion = usePrefersReducedMotion();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const greeting = useMemo(() => getTimeBasedGreeting(), [context]);
  const contextInfo = CONTEXT_LABELS[context];
  const ContextIcon = CONTEXT_ICONS[context];

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
              <h2 className="bento-greeting">{greeting.greeting}</h2>
              <p className="bento-subtext">{welcomeSubtext}</p>
            </div>
            <Badge variant="context" size="sm" className="bento-context-badge">
              <ContextIcon size={14} strokeWidth={1.5} aria-hidden="true" />
              {contextInfo.label}
            </Badge>
          </div>
          <Button
            variant="primary"
            className="bento-cta"
            onClick={() => onNavigate('ideas')}
            icon={<Lightbulb size={16} strokeWidth={1.5} />}
          >
            Neuer Gedanke
          </Button>
        </section>

        {/* Setup Checklist (Phase 86) */}
        <SetupChecklist onNavigate={onNavigate} ideasCount={ideasCount} />

        {/* Stat tiles */}
        {fetchError && !loading ? (
          <Card variant="surface" padding="md" className="bento-stat" style={{ gridColumn: 'span 4', textAlign: 'center' }}>
            <EmptyState
              title="Daten konnten nicht geladen werden"
              action={
                <Button variant="secondary" size="sm" onClick={() => summary.refetch()}>
                  Erneut versuchen
                </Button>
              }
            />
          </Card>
        ) : loading ? (
          <>
            <Card variant="surface" padding="sm" className="bento-stat"><Skeleton variant="card" /></Card>
            <Card variant="surface" padding="sm" className="bento-stat"><Skeleton variant="card" /></Card>
            <Card variant="surface" padding="sm" className="bento-stat"><Skeleton variant="card" /></Card>
            <Card variant="surface" padding="sm" className="bento-stat"><Skeleton variant="card" /></Card>
          </>
        ) : (
          <>
            {([
              { icon: <Lightbulb size={22} strokeWidth={1.5} />, value: stats.total, label: 'Gesamt', cls: '', page: 'ideas' as Page },
              { icon: <Calendar size={22} strokeWidth={1.5} />, value: stats.thisWeek, label: 'Diese Woche', cls: '', page: 'ideas' as Page },
              { icon: <Flame size={22} strokeWidth={1.5} />, value: stats.highPriority, label: 'Wichtig', cls: ' bento-stat--hot', page: 'ideas' as Page },
              { icon: streak > 0 ? <Flame size={22} strokeWidth={1.5} /> : <Moon size={22} strokeWidth={1.5} />, value: `${streak}d`, label: 'Streak', cls: ' bento-stat--streak', page: 'insights' as Page },
            ] as const).map((stat, i) => (
              <motion.button
                key={stat.label}
                type="button"
                className={`bento-card bento-stat${stat.cls}`}
                onClick={() => onNavigate(stat.page)}
                variants={reducedMotion ? undefined : staggerItem}
                initial={reducedMotion ? undefined : 'initial'}
                animate={reducedMotion ? undefined : 'animate'}
                transition={reducedMotion ? undefined : { delay: i * 0.03 }}
              >
                <span className="bento-stat-icon">{stat.icon}</span>
                <span className="bento-stat-value">{stat.value}</span>
                <span className="bento-stat-label">{stat.label}</span>
              </motion.button>
            ))}
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
            {QUICK_NAV.map((item) => {
              const NavIcon = getPageIcon(item.page);
              return (
                <button
                  key={item.page}
                  type="button"
                  className="bento-nav-item"
                  onClick={() => onNavigate(item.page)}
                  style={{ '--nav-accent': item.accent } as React.CSSProperties}
                >
                  <span className="bento-nav-icon"><NavIcon size={20} strokeWidth={1.5} /></span>
                  <span className="bento-nav-label">{item.label}</span>
                </button>
              );
            })}
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
              <h3><Calendar size={16} strokeWidth={1.5} /> Termine</h3>
              <Button variant="ghost" size="sm" className="bento-link" onClick={() => onNavigate('calendar')}>
                Alle →
              </Button>
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
                    <span className="bento-event-icon">{(() => { const EIcon = EVENT_ICON_MAP[evt.event_type] || Calendar; return <EIcon size={16} strokeWidth={1.5} />; })()}</span>
                    <div className="bento-event-info">
                      <span className="bento-event-title">{evt.title}</span>
                      <span className="bento-event-time">{dayStr}, {timeStr}</span>
                    </div>
                    {evt.ai_generated && <Badge variant="status" color="info" size="sm" className="bento-ai-tag">KI</Badge>}
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
            <Button variant="ghost" size="sm" className="bento-link" onClick={() => onNavigate('ideas')}>
              Alle →
            </Button>
          </div>
          {loading ? (
            <Skeleton variant="text" count={3} />
          ) : recentIdeas.length === 0 ? (
            <EmptyState
              icon={<Lightbulb size={32} strokeWidth={1.5} />}
              title={`Noch keine Gedanken in ${contextInfo.label}`}
              action={
                <Button variant="primary" size="sm" className="bento-empty-cta" onClick={() => onNavigate('ideas')}>
                  Ersten Gedanken erfassen
                </Button>
              }
            />
          ) : (
            <div className="bento-ideas-list">
              {recentIdeas.map((idea) => (
                <button
                  key={idea.id}
                  type="button"
                  className="bento-idea-row"
                  onClick={() => onNavigate('ideas')}
                >
                  <span className="bento-idea-type">{(() => { const TIcon = TYPE_ICONS[idea.type] || FileText; return <TIcon size={16} strokeWidth={1.5} />; })()}</span>
                  <div className="bento-idea-info">
                    <span className="bento-idea-title">{idea.title}</span>
                    <span className="bento-idea-time">{formatTime(idea.created_at)}</span>
                  </div>
                  {idea.priority === 'high' && <span className="bento-idea-hot"><Flame size={14} strokeWidth={1.5} /></span>}
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
              {unreadCount > 0 && <Badge variant="status" color="danger" size="sm" className="bento-badge">{unreadCount}</Badge>}
            </h3>
            <div className="bento-card-actions">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="bento-link-muted" onClick={() => markReadMutation.mutate()}>
                  Gelesen
                </Button>
              )}
              <Button variant="ghost" size="sm" className="bento-link" onClick={() => onNavigate('insights')}>
                Insights →
              </Button>
            </div>
          </div>
          {loading ? (
            <Skeleton variant="text" count={3} />
          ) : activity.length === 0 ? (
            <EmptyState
              icon={<Brain size={32} strokeWidth={1.5} />}
              title="Noch keine Aktivitaet"
              description="Starte einen Chat oder erfasse Gedanken."
            />
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
                  <span className="bento-activity-icon">{(() => { const AIcon = ACTIVITY_ICON_MAP[item.activityType] || Sparkles; return <AIcon size={16} strokeWidth={1.5} />; })()}</span>
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
