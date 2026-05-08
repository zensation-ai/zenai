/**
 * Dashboard - Bento Grid Desktop
 *
 * Personal AI OS landing page with widget-style bento layout.
 * Sections span different grid areas for a modern "desktop" feel.
 *
 * Migrated to React Query for automatic caching, deduplication,
 * and background refetching (Phase 4.1b).
 *
 * Migrated from BEM CSS to Tailwind v4 + shadcn Card (Phase 79 Wave 3).
 */

import { useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Page, ApiStatus } from '../types';
import type { AIContext } from './ContextSwitcher';
import { AIBrain } from './AIBrain';
import { AmbientGlow } from './AmbientGlow';
import { RisingBubbles } from './RisingBubbles';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import { ProactiveDigest } from './ProactiveDigest';
import { ProactiveBriefingWidget } from './ProactiveBriefing/ProactiveBriefingWidget';
import { DemoWelcome } from './DemoWelcome';
import {
  useDashboardSummaryQuery,
  useAIPulseQuery,
  useUpcomingEventsQuery,
  useMarkActivityReadMutation,
} from '../hooks/queries/useDashboard';
import type { TrendPoint } from '../hooks/queries/useDashboard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Card } from '@/components/ui/card';
import { QueryErrorState } from './QueryErrorState';
import { getPageIcon } from '../utils/navIcons';
import { cn } from '@/lib/utils';
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
import { StreakWidget } from './Dashboard/StreakWidget';
import { SetupProgress } from './Dashboard/SetupProgress';

interface DashboardProps {
  context: AIContext;
  onNavigate: (page: Page) => void;
  isAIActive: boolean;
  ideasCount: number;
  apiStatus: ApiStatus | null;
}

const CONTEXT_ICONS: Record<AIContext, LucideIcon> = {
  operations: Home,
  finance: Briefcase,
  people: BookOpen,
  strategy: Palette,
};

const CONTEXT_LABELS: Record<AIContext, { label: string }> = {
  operations: { label: 'Operativ' },
  finance: { label: 'Finanzen' },
  people: { label: 'Team' },
  strategy: { label: 'Strategie' },
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

/** All available quick nav items with accent colors */
const ALL_QUICK_NAV: QuickNavItem[] = [
  { label: 'Gedanken', page: 'ideas', accent: 'var(--accent-ideas, #f59e0b)' },
  { label: 'Chat', page: 'chat', accent: 'var(--accent-chat, #f97316)' },
  { label: 'Planer', page: 'calendar', accent: 'var(--accent-calendar, #3b82f6)' },
  { label: 'Wissensbasis', page: 'documents', accent: 'var(--accent-docs, #144A56)' },
  { label: 'Einblicke', page: 'insights', accent: 'var(--accent-insights, #10b981)' },
  { label: 'Werkstatt', page: 'workshop', accent: 'var(--accent-workshop, #1a6b7a)' },
  { label: 'Email', page: 'email', accent: 'var(--accent-email, #ec4899)' },
  { label: 'Meine KI', page: 'my-ai', accent: 'var(--accent-ai, #a855f7)' },
  { label: 'Cockpit', page: 'business', accent: 'var(--accent-business, #0ea5e9)' },
  { label: 'Finanzen', page: 'finance', accent: 'var(--accent-finance, #14b8a6)' },
  { label: 'Kontakte', page: 'contacts', accent: 'var(--accent-contacts, #f43f5e)' },
  { label: 'Lernen', page: 'learning', accent: 'var(--accent-learning, #eab308)' },
];

const FRECENCY_KEY = 'zenai_nav_frecency';
const FRECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface FrecencyEntry { count: number; lastVisit: number; }

/** Read frecency data from localStorage */
function readFrecency(): Record<string, FrecencyEntry> {
  try {
    const raw = localStorage.getItem(FRECENCY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Record a page visit for frecency scoring */
export function recordPageVisit(page: string): void {
  try {
    const data = readFrecency();
    const entry = data[page] ?? { count: 0, lastVisit: 0 };
    entry.count += 1;
    entry.lastVisit = Date.now();
    data[page] = entry;
    localStorage.setItem(FRECENCY_KEY, JSON.stringify(data));
  } catch { /* ignore storage errors */ }
}

/** Compute frecency score: frequency * recency decay */
function frecencyScore(entry: FrecencyEntry | undefined): number {
  if (!entry || entry.count === 0) return 0;
  const age = Date.now() - entry.lastVisit;
  const recency = Math.exp(-age / FRECENCY_HALF_LIFE_MS);
  return entry.count * recency;
}

/** Get top-8 quick nav items sorted by frecency, falling back to static order */
function useFrecencyNav(): QuickNavItem[] {
  return useMemo(() => {
    const data = readFrecency();
    const hasData = Object.keys(data).length > 0;
    if (!hasData) return ALL_QUICK_NAV.slice(0, 8);

    const scored = ALL_QUICK_NAV.map(item => ({
      item,
      score: frecencyScore(data[item.page]),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 8).map(s => s.item);
  }, []);
}

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
    <div className="flex-1 min-h-[40px]" aria-label={`${days.reduce((s, v) => s + v, 0)} Gedanken in den letzten 7 Tagen`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-[40px] block">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--color-primary)"
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
            fill="var(--color-primary)"
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

/* Shared card style — replaces .bento-card */
const cardBase = 'glass border border-glass-border rounded-lg p-4 backdrop-blur-md shadow-sm transition-[border-color,box-shadow] duration-200 animate-fade-in';

const DashboardComponent: React.FC<DashboardProps> = ({
  context,
  onNavigate,
  isAIActive,
  ideasCount,
  apiStatus,
}) => {
  // Frecency-based quick nav (sorted by usage)
  const quickNav = useFrecencyNav();

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

  // Intentionally depend on context (not time) — greeting recomputes on context switch, not every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const greeting = useMemo(() => getTimeBasedGreeting(), [context]);
  const contextInfo = CONTEXT_LABELS[context];
  const ContextIcon = CONTEXT_ICONS[context];

  const welcomeSubtext = useMemo(() => {
    if (ideasCount === 0) return 'Bereit für deinen ersten Gedanken?';
    if (streak > 3) return `${streak} Tage in Folge aktiv`;
    if (stats.todayCount > 0) return `Heute schon ${stats.todayCount} neue Gedanken`;
    return `${ideasCount} Gedanken in deinem digitalen Gehirn`;
  }, [ideasCount, streak, stats.todayCount]);

  return (
    <div className={cn('max-w-[1200px] mx-auto px-6 pb-12 pt-6 relative overflow-hidden animate-fade-in', isAIActive && 'ai-active')} data-context={context} role="region" aria-label="Dashboard">
      <AmbientGlow state="idle" />
      <RisingBubbles variant="subtle" />

      {/* ===== BENTO GRID ===== */}
      <div className="relative z-[1] grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:gap-3 max-[480px]:grid-cols-2 max-[480px]:gap-2 max-[400px]:grid-cols-1" aria-live="polite" aria-relevant="additions text">

        {/* Hero: Welcome */}
        <section className={cn(cardBase, 'col-span-full flex items-center justify-between gap-4 px-8 py-6 bg-[var(--glass-bg-warm)] relative overflow-hidden max-md:flex-wrap max-md:p-4 max-md:gap-3')}>
          {/* Warm gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
          <div className="flex items-center gap-4 flex-1 min-w-0 max-md:flex-wrap relative z-[1]">
            <div className="shrink-0 w-12 h-12 flex items-center justify-center scale-[1.3] origin-center max-md:scale-110">
              <AIBrain isActive={isAIActive} activityType="thinking" ideasCount={ideasCount} size="small" />
            </div>
            <div className="flex-1 min-w-0 max-md:flex-[1_1_200px]">
              <h2 className="text-2xl font-bold mb-1 text-text tracking-tight max-md:text-lg max-[480px]:text-base">{greeting.greeting}</h2>
              <p className="m-0 text-sm text-text-secondary">{welcomeSubtext}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap max-md:order-first max-md:self-start">
              <Badge variant="secondary" className="flex items-center gap-1 px-3 py-1 bg-surface border border-glass-border rounded-full text-xs font-medium text-text-secondary whitespace-nowrap">
                <ContextIcon size={14} strokeWidth={1.5} aria-hidden="true" />
                {contextInfo.label}
              </Badge>
              <StreakWidget context={context} />
            </div>
          </div>
          <Button
            variant="default"
            className="relative z-[1] shrink-0 flex items-center gap-2 px-5 py-2 bg-gradient-to-br from-primary to-[var(--primary-light,#ff8c5a)] border-none rounded-md text-white text-sm font-semibold cursor-pointer transition-all whitespace-nowrap hover:-translate-y-px hover:shadow-lg active:translate-y-0 max-md:w-full max-md:justify-center"
            onClick={() => onNavigate('ideas')}
          >
            Neuer Gedanke
          </Button>
        </section>

        {/* Demo onboarding (Alex Chen) — renders null unless demo session */}
        <div className="col-span-full">
          <DemoWelcome />
        </div>

        {/* Feature Discovery Progress */}
        <SetupProgress />

        {/* Setup Checklist (Phase 86) */}
        <SetupChecklist onNavigate={onNavigate} ideasCount={ideasCount} />

        {/* Stat tiles */}
        {fetchError && !loading ? (
          <Card className={cn('col-span-4 p-4 text-center', cardBase)}>
            <QueryErrorState error={summary.error} refetch={summary.refetch} />
          </Card>
        ) : (
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="stats-skeleton" className="col-span-full grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:gap-3 max-[480px]:grid-cols-2 max-[480px]:gap-2 max-[400px]:grid-cols-1" exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
                {[0,1,2,3].map(i => (
                  <Card key={i} className={cn(cardBase, 'flex flex-col items-center justify-center gap-1 p-3')}>
                    <Skeleton />
                  </Card>
                ))}
              </motion.div>
            ) : (
              <motion.div key="stats-content" className="col-span-full grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:gap-3 max-[480px]:grid-cols-2 max-[480px]:gap-2 max-[400px]:grid-cols-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
                {([
                  { icon: <Lightbulb size={22} strokeWidth={1.5} />, value: stats.total, label: 'Gesamt', variant: 'default' as const, page: 'ideas' as Page },
                  { icon: <Calendar size={22} strokeWidth={1.5} />, value: stats.thisWeek, label: 'Diese Woche', variant: 'default' as const, page: 'ideas' as Page },
                  { icon: <Flame size={22} strokeWidth={1.5} />, value: stats.highPriority, label: 'Wichtig', variant: 'hot' as const, page: 'ideas' as Page },
                  { icon: streak > 0 ? <Flame size={22} strokeWidth={1.5} /> : <Moon size={22} strokeWidth={1.5} />, value: `${streak}d`, label: 'Streak', variant: 'streak' as const, page: 'insights' as Page },
                ] as const).map((stat, i) => (
                  <motion.button
                    key={stat.label}
                    type="button"
                    className={cn(
                      cardBase,
                      'flex flex-col items-center justify-center gap-1 py-4 px-3 cursor-pointer text-center relative overflow-hidden',
                      'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:transition-[80ms]',
                      'focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
                      'max-[480px]:py-3 max-[480px]:px-2',
                    )}
                    onClick={() => onNavigate(stat.page)}
                    variants={reducedMotion ? undefined : staggerItem}
                    initial={reducedMotion ? undefined : 'initial'}
                    animate={reducedMotion ? undefined : 'animate'}
                    transition={reducedMotion ? undefined : { delay: i * 0.03 }}
                  >
                    <span className={cn(
                      'flex items-center justify-center w-9 h-9 rounded-md bg-black/[0.04] text-text-secondary',
                      stat.variant === 'hot' && 'text-primary bg-primary/[0.08]',
                      stat.variant === 'streak' && 'text-warning bg-warning/[0.08]',
                    )}>{stat.icon}</span>
                    <span className="text-2xl font-bold text-text leading-none max-md:text-xl max-[480px]:text-lg">{stat.value}</span>
                    <span className="text-[0.72rem] text-text-secondary font-medium uppercase tracking-wide">{stat.label}</span>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Trend sparkline (spans 2 cols) */}
        {!loading && !fetchError && (
          <div className={cn(cardBase, 'col-span-2 flex flex-col gap-2 max-md:col-span-full')}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">7-Tage-Trend</span>
              <span className="text-xs font-semibold text-text">{trend.reduce((s, p) => s + p.count, 0)} Gedanken</span>
            </div>
            <Sparkline data={trend} />
          </div>
        )}

        {/* AI Status (spans 2 cols) */}
        <section className={cn(cardBase, 'col-span-2 flex flex-col gap-0 text-left !p-0 overflow-hidden hover:border-[var(--ctx-accent-glow,rgba(139,92,246,0.3))] max-md:col-span-full')} aria-label="KI-Systemstatus">
          <button
            type="button"
            className="flex items-center justify-between px-5 py-4 bg-transparent border-none text-inherit cursor-pointer text-left w-full hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            onClick={() => onNavigate('chat')}
          >
            <div className="flex items-center gap-2">
              <span className={cn(
                'w-2.5 h-2.5 rounded-full bg-text-muted shrink-0 transition-colors',
                isAIActive && 'bg-success shadow-md animate-pulse',
              )} />
              <span className="text-sm font-medium text-text">{isAIActive ? 'KI arbeitet...' : 'KI bereit'}</span>
            </div>
            <span className="text-[0.82rem] font-medium text-primary opacity-70 group-hover:opacity-100 transition-opacity">Chat starten →</span>
          </button>
          <div className="grid grid-cols-4 border-t border-white/[0.06] max-[480px]:grid-cols-2">
            {([
              { value: aiPulseData.memoryFacts, label: 'Denkmuster', page: 'my-ai' as Page, title: 'Gelernte Denkmuster' },
              { value: aiPulseData.procedures, label: 'Prozeduren', page: 'my-ai' as Page, title: 'Gelernte Prozeduren' },
              { value: aiPulseData.sleepCycles, label: 'Schlaf-Zyklen', page: 'insights' as Page, title: 'Schlaf-Zyklen der KI' },
              { value: aiPulseData.ragQueries, label: 'RAG-Suchen', page: 'insights' as Page, title: 'RAG-Anfragen' },
            ] as const).map((item, idx) => (
              <button
                key={item.label}
                type="button"
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2.5 px-2 bg-transparent border-none cursor-pointer transition-colors text-inherit',
                  idx < 3 && 'border-r border-white/[0.04]',
                  'hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                )}
                onClick={() => onNavigate(item.page)}
                title={item.title}
              >
                <span className="text-base font-bold text-text tabular-nums">{item.value}</span>
                <span className="text-[0.65rem] font-medium text-text-muted uppercase tracking-wide">{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Quick Nav */}
        <div className={cn(cardBase, 'col-span-2 max-md:col-span-full')}>
          <h3 className="mb-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Schnellzugriff</h3>
          <div className="grid grid-cols-4 gap-2 max-[480px]:grid-cols-2 max-[480px]:gap-1.5">
            {quickNav.map((item) => {
              const NavIcon = getPageIcon(item.page);
              return (
                <button
                  key={item.page}
                  type="button"
                  className="flex flex-col items-center gap-1 py-3 px-2 bg-transparent border border-glass-border rounded-md cursor-pointer text-inherit transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:transition-[80ms] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 max-[480px]:py-2.5 max-[480px]:px-1.5 group"
                  onClick={() => onNavigate(item.page)}
                  style={{ '--nav-accent': item.accent } as React.CSSProperties}
                >
                  <span className="flex items-center justify-center text-text-secondary transition-colors group-hover:text-[var(--nav-accent,var(--primary,#ff6b35))]"><NavIcon size={20} strokeWidth={1.5} /></span>
                  <span className="text-xs font-medium text-text-secondary transition-colors group-hover:text-text">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Proactive Digest */}
        <div className={cn(cardBase, 'col-span-2 max-md:col-span-full')}>
          <ProactiveDigest context={context} onNavigate={onNavigate} />
        </div>

        {/* Proactive Briefing */}
        <div className={cn(cardBase, 'col-span-2 max-md:col-span-full')}>
          <ProactiveBriefingWidget context={context} onNavigate={onNavigate} />
        </div>

        {/* Upcoming Events */}
        {!loading && upcomingEvents.length > 0 && (
          <section className={cn(cardBase, 'col-span-2 max-md:col-span-full')}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="m-0 text-base font-semibold text-text flex items-center gap-2"><Calendar size={16} strokeWidth={1.5} /> Termine</h3>
              <Button variant="ghost" size="sm" className="text-primary text-xs font-medium px-2 py-1 rounded-md hover:bg-primary/10" onClick={() => onNavigate('calendar')}>
                Alle →
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              {upcomingEvents.map((evt) => {
                const startDate = new Date(evt.start_time);
                const timeStr = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                const dayStr = startDate.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
                return (
                  <button
                    key={evt.id}
                    type="button"
                    className="flex items-center gap-3 py-2 px-3 bg-transparent border border-transparent rounded-[10px] cursor-pointer text-left w-full text-inherit transition-all hover:bg-surface-hover hover:border-glass-border"
                    onClick={() => onNavigate('calendar')}
                  >
                    <span className="shrink-0 w-6 flex items-center justify-center text-text-secondary">{(() => { const EIcon = EVENT_ICON_MAP[evt.event_type] || Calendar; return <EIcon size={16} strokeWidth={1.5} />; })()}</span>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[0.85rem] font-medium text-text truncate">{evt.title}</span>
                      <span className="text-[0.72rem] text-text-muted">{dayStr}, {timeStr}</span>
                    </div>
                    {evt.ai_generated && <Badge variant="outline" className="text-[0.65rem] font-semibold text-[var(--accent,#4A90D9)] bg-[rgba(74,144,217,0.1)] px-1.5 py-0.5 rounded-sm shrink-0">KI</Badge>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent Ideas */}
        <section className={cn(cardBase, 'col-span-2 max-md:col-span-full')}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-base font-semibold text-text">Letzte Gedanken</h3>
            <Button variant="ghost" size="sm" className="text-primary text-xs font-medium px-2 py-1 rounded-md hover:bg-primary/10" onClick={() => onNavigate('ideas')}>
              Alle →
            </Button>
          </div>
          {loading ? (
            <Skeleton />
          ) : recentIdeas.length === 0 ? (
            <EmptyState
              title={`Noch keine Gedanken in ${contextInfo.label}`}
              action={
                <Button variant="default" size="sm" className="mt-1.5 px-5 py-2.5 bg-gradient-to-br from-primary to-[var(--primary-light,#ff8c5a)] text-white border-none rounded-[10px] text-sm font-semibold cursor-pointer transition-all shadow-sm hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:transition-[80ms]" onClick={() => onNavigate('ideas')}>
                  Ersten Gedanken erfassen
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {recentIdeas.map((idea) => (
                <button
                  key={idea.id}
                  type="button"
                  className="flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none rounded-sm text-inherit cursor-pointer transition-all text-left hover:bg-surface-hover"
                  onClick={() => onNavigate('ideas')}
                >
                  <span className="shrink-0 w-6 flex items-center justify-center text-text-secondary">{(() => { const TIcon = TYPE_ICONS[idea.type] || FileText; return <TIcon size={16} strokeWidth={1.5} />; })()}</span>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[0.88rem] text-text font-medium truncate">{idea.title}</span>
                    <span className="text-[0.72rem] text-text-muted">{formatTime(idea.created_at)}</span>
                  </div>
                  {idea.priority === 'high' && <span className="shrink-0 text-primary flex items-center"><Flame size={14} strokeWidth={1.5} /></span>}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* AI Activity */}
        <section className={cn(cardBase, 'col-span-2 max-md:col-span-full')}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-base font-semibold text-text flex items-center gap-2">
              KI-Aktivität
              {unreadCount > 0 && <Badge variant="outline" className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 ml-2 bg-primary text-white rounded-full text-[0.7rem] font-semibold align-middle">{unreadCount}</Badge>}
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="py-1 px-2.5 bg-transparent border border-black/10 rounded-sm text-text-secondary text-xs cursor-pointer transition-all whitespace-nowrap hover:bg-black/[0.05] hover:text-text hover:border-black/20" onClick={() => markReadMutation.mutate()}>
                  Gelesen
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-primary text-xs font-medium px-2 py-1 rounded-md hover:bg-primary/10" onClick={() => onNavigate('insights')}>
                Insights →
              </Button>
            </div>
          </div>
          {loading ? (
            <Skeleton />
          ) : activity.length === 0 ? (
            <EmptyState
              title="Noch keine Aktivität"
              description="Starte einen Chat oder erfasse Gedanken."
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {activity.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-2 py-2 px-3 rounded-sm transition-colors',
                    item.ideaId && 'cursor-pointer hover:bg-primary/[0.06]',
                    !item.isRead && '[&_.activity-msg]:font-medium',
                  )}
                  {...(item.ideaId ? {
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => onNavigate('ideas'),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate('ideas'); }
                    },
                  } : {})}
                >
                  <span className="shrink-0 w-6 flex items-center justify-center text-text-secondary mt-px">{(() => { const AIcon = ACTIVITY_ICON_MAP[item.activityType] || Sparkles; return <AIcon size={16} strokeWidth={1.5} />; })()}</span>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="activity-msg text-[0.85rem] text-text leading-relaxed">{item.message}</span>
                    <span className="text-[0.72rem] text-text-muted">{formatTime(item.createdAt)}</span>
                  </div>
                  {!item.isRead && <span className="w-2 h-2 bg-primary rounded-full shrink-0 ml-1 self-center" />}
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
