import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare, Brain, Activity, Heart,
  Clock, Mail, Lightbulb, HelpCircle,
  MessageSquare, Check, RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { usePanelContext } from '../../contexts/PanelContext';
import { useTasksQuery } from '../../hooks/queries/useTasks';
import { useUpcomingCalendarEventsQuery } from '../../hooks/queries/useCalendar';
import { useEmailStatsQuery } from '../../hooks/queries/useEmail';
import { useSmartSuggestions } from '../../hooks/useSmartSuggestions';
import { useCuriosityGaps } from '../../hooks/queries/useCognitiveData';
import { useCognitiveOverview } from '../../hooks/queries/useCognitive';
import { useReviewQueue } from '../../hooks/queries/useCognitiveData';
import { useChatSessionsQuery } from '../../hooks/queries/useChat';
import './DashboardPage.css';

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface DashboardPageProps {
  context: AIContext;
}

// ── ScoreRing SVG ─────────────────────────────────────────────────────

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color =
    score > 75
      ? 'var(--color-success)'
      : score > 50
        ? 'var(--color-warning)'
        : 'var(--color-error)';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={6}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-primary)"
        fontSize={size * 0.25}
        fontWeight="bold"
      >
        {score}
      </text>
    </svg>
  );
}

// ── Widget skeleton ───────────────────────────────────────────────────

function WidgetSkeleton() {
  return (
    <div className="dashboard-widget__skeleton">
      <div className="dashboard-widget__skeleton-line dashboard-widget__skeleton-line--short" />
      <div className="dashboard-widget__skeleton-line" />
      <div className="dashboard-widget__skeleton-line dashboard-widget__skeleton-line--medium" />
    </div>
  );
}

// ── Widget error state ────────────────────────────────────────────────

function WidgetError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="dashboard-widget__error">
      <span>Nicht verfuegbar</span>
      <span
        role="button"
        tabIndex={0}
        className="dashboard-widget__retry"
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            onRetry();
          }
        }}
      >
        <RefreshCw size={12} />
        Erneut versuchen
      </span>
    </div>
  );
}

// ── Relative time helper ──────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `vor ${diffD}d`;
}

// ── Format time for calendar events ───────────────────────────────────

function formatEventTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ── Suggestion type → icon mapping ────────────────────────────────────

function suggestionIcon(type: string): LucideIcon {
  switch (type) {
    case 'morning_briefing':
      return Clock;
    case 'knowledge_gap':
      return HelpCircle;
    default:
      return Lightbulb;
  }
}

// ── Widget 1: Heute ───────────────────────────────────────────────────

function TodayWidget({ context }: { context: AIContext }) {
  const { dispatch } = usePanelContext();
  const tasksQuery = useTasksQuery(context, { status: 'pending' });
  const calendarQuery = useUpcomingCalendarEventsQuery(context);
  const emailQuery = useEmailStatsQuery(context);

  const isLoading = tasksQuery.isLoading || calendarQuery.isLoading || emailQuery.isLoading;
  const isError = tasksQuery.isError && calendarQuery.isError && emailQuery.isError;

  const todayTasks = useMemo(() => {
    if (!Array.isArray(tasksQuery.data)) return [];
    const todayStr = new Date().toISOString().split('T')[0];
    return (tasksQuery.data as Array<{ due_date?: string }>).filter(
      (t) => t.due_date && t.due_date.slice(0, 10) <= todayStr,
    );
  }, [tasksQuery.data]);

  const nextEvent = useMemo(() => {
    if (!Array.isArray(calendarQuery.data) || calendarQuery.data.length === 0) return null;
    return calendarQuery.data[0];
  }, [calendarQuery.data]);

  const unreadCount = (emailQuery.data as { unreadCount?: number } | undefined)?.unreadCount ?? 0;

  const hasContent = todayTasks.length > 0 || nextEvent || unreadCount > 0;

  return (
    <button
      className="dashboard-widget"
      onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'tasks' })}
    >
      <div className="dashboard-widget__header">
        <CheckSquare size={16} />
        <span>Heute</span>
      </div>
      <div className="dashboard-widget__content">
        {isLoading ? (
          <WidgetSkeleton />
        ) : isError ? (
          <WidgetError
            onRetry={() => {
              tasksQuery.refetch();
              calendarQuery.refetch();
              emailQuery.refetch();
            }}
          />
        ) : !hasContent ? (
          <div className="dashboard-widget__empty">
            <Check size={16} />
            <span>Alles erledigt</span>
          </div>
        ) : (
          <ul className="dashboard-widget__list">
            {todayTasks.length > 0 && (
              <li>
                <CheckSquare size={14} />
                <span>{todayTasks.length} offene Tasks</span>
              </li>
            )}
            {nextEvent && (
              <li>
                <Clock size={14} />
                <span>
                  {formatEventTime(nextEvent.start_time)} {nextEvent.title}
                </span>
              </li>
            )}
            {unreadCount > 0 && (
              <li>
                <Mail size={14} />
                <span>{unreadCount} ungelesene Mails</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </button>
  );
}

// ── Widget 2: AI Insights ─────────────────────────────────────────────

function AIInsightsWidget({ context }: { context: AIContext }) {
  const navigate = useNavigate();
  const { suggestions, loading: suggestionsLoading } = useSmartSuggestions(context);
  const gapsQuery = useCuriosityGaps(context);

  const isLoading = suggestionsLoading && gapsQuery.isLoading;

  const topSuggestions = suggestions.slice(0, 3);
  const topGap = Array.isArray(gapsQuery.data) && gapsQuery.data.length > 0
    ? gapsQuery.data[0]
    : null;

  const hasContent = topSuggestions.length > 0 || topGap;

  return (
    <button
      className="dashboard-widget"
      onClick={() => navigate('/chat')}
    >
      <div className="dashboard-widget__header">
        <Brain size={16} />
        <span>AI Insights</span>
      </div>
      <div className="dashboard-widget__content">
        {isLoading ? (
          <WidgetSkeleton />
        ) : !hasContent ? (
          <div className="dashboard-widget__empty">
            <Lightbulb size={16} />
            <span>Keine Vorschlaege gerade</span>
          </div>
        ) : (
          <ul className="dashboard-widget__list">
            {topSuggestions.map((s) => {
              const IconComp = suggestionIcon(s.type);
              return (
                <li key={s.id}>
                  <IconComp size={14} />
                  <span>{s.title}</span>
                </li>
              );
            })}
            {topGap && (
              <li className="dashboard-widget__gap">
                <HelpCircle size={14} />
                <span>{topGap.topic}</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </button>
  );
}

// ── Widget 3: Letzte Aktivitaet ───────────────────────────────────────

function RecentActivityWidget({ context }: { context: AIContext }) {
  const navigate = useNavigate();
  const sessionsQuery = useChatSessionsQuery(context);

  const recentSessions = useMemo(() => {
    if (!Array.isArray(sessionsQuery.data)) return [];
    return sessionsQuery.data.slice(0, 5);
  }, [sessionsQuery.data]);

  return (
    <button
      className="dashboard-widget"
      onClick={() => navigate('/chat')}
    >
      <div className="dashboard-widget__header">
        <Activity size={16} />
        <span>Letzte Aktivitaet</span>
      </div>
      <div className="dashboard-widget__content">
        {sessionsQuery.isLoading ? (
          <WidgetSkeleton />
        ) : sessionsQuery.isError ? (
          <WidgetError onRetry={() => sessionsQuery.refetch()} />
        ) : recentSessions.length === 0 ? (
          <div className="dashboard-widget__empty">
            <MessageSquare size={16} />
            <span>Noch keine Gespraeche</span>
          </div>
        ) : (
          <ul className="dashboard-widget__timeline">
            {recentSessions.map((s) => (
              <li key={s.id} className="dashboard-widget__timeline-item">
                <span className="dashboard-widget__timeline-time">
                  {relativeTime(s.updatedAt)}
                </span>
                <span className="dashboard-widget__timeline-title">
                  {s.title ?? 'Unbenannt'}
                </span>
                <span className={`dashboard-widget__context-badge dashboard-widget__context-badge--${s.context}`}>
                  {s.context}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </button>
  );
}

// ── Widget 4: Memory Health ───────────────────────────────────────────

function MemoryHealthWidget({ context }: { context: AIContext }) {
  const { dispatch } = usePanelContext();
  const overviewQuery = useCognitiveOverview(context);
  const reviewQuery = useReviewQueue(context);

  const score = useMemo(() => {
    const d = overviewQuery.data as {
      confidence_score?: number;
      coherence_score?: number;
      coverage_score?: number;
    } | null | undefined;
    if (!d || d.confidence_score == null || d.coherence_score == null || d.coverage_score == null) {
      return 0;
    }
    return Math.round(
      ((d.confidence_score + d.coherence_score + d.coverage_score) / 3) * 100,
    );
  }, [overviewQuery.data]);

  const reviewCount = Array.isArray(reviewQuery.data) ? reviewQuery.data.length : 0;
  const hasData = overviewQuery.data != null && score > 0;

  return (
    <button
      className="dashboard-widget"
      onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'memory' })}
    >
      <div className="dashboard-widget__header">
        <Heart size={16} />
        <span>Memory Health</span>
      </div>
      <div className="dashboard-widget__content">
        {overviewQuery.isLoading ? (
          <WidgetSkeleton />
        ) : overviewQuery.isError ? (
          <WidgetError onRetry={() => overviewQuery.refetch()} />
        ) : !hasData ? (
          <div className="dashboard-widget__memory-empty">
            <ScoreRing score={0} size={64} />
            <span className="dashboard-widget__memory-label">Noch keine Daten</span>
          </div>
        ) : (
          <div className="dashboard-widget__memory">
            <ScoreRing score={score} size={64} />
            <div className="dashboard-widget__memory-details">
              <span className="dashboard-widget__memory-score-label">Cognitive Score</span>
              {reviewCount > 0 && (
                <span className="dashboard-widget__memory-reviews">
                  {reviewCount} Reviews faellig
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

// ── DashboardPage ─────────────────────────────────────────────────────

export function DashboardPage({ context }: DashboardPageProps) {
  return (
    <div className="dashboard-page">
      <h1 className="dashboard-page__title">Dashboard</h1>
      <div className="dashboard-grid">
        <TodayWidget context={context} />
        <AIInsightsWidget context={context} />
        <RecentActivityWidget context={context} />
        <MemoryHealthWidget context={context} />
      </div>
    </div>
  );
}
