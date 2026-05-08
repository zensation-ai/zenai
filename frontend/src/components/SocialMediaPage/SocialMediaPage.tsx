/**
 * SocialMediaPage — Social Media Agent UI (Phase 142)
 *
 * Three tabs:
 *   Posts    — draft/pending/scheduled/published list with approve/publish/schedule actions
 *   Calendar — upcoming scheduled posts in a timeline view
 *   Platforms — Twitter, LinkedIn, Discord availability status
 */
import { useState, useCallback, useRef } from 'react';
import { Share2, Calendar, Radio, CheckCircle2, Send, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { QueryErrorState } from '../QueryErrorState';
import {
  useSocialPostsQuery,
  useSocialCalendarQuery,
  usePlatformStatusQuery,
  useApprovePostMutation,
  usePublishPostMutation,
  useSchedulePostMutation,
  useDeletePostMutation,
} from '../../hooks/queries/useSocial';
import type { PostStatus, SocialPost } from '../../hooks/queries/useSocial';
import type { AIContext } from '../ContextSwitcher';
type Tab = 'posts' | 'calendar' | 'platforms';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'posts', label: 'Posts', icon: <Share2 size={14} /> },
  { id: 'calendar', label: 'Kalender', icon: <Calendar size={14} /> },
  { id: 'platforms', label: 'Plattformen', icon: <Radio size={14} /> },
];

const STATUS_FILTERS: { value: PostStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'draft', label: 'Entwurf' },
  { value: 'pending_approval', label: 'Ausstehend' },
  { value: 'approved', label: 'Genehmigt' },
  { value: 'scheduled', label: 'Geplant' },
  { value: 'published', label: 'Veröffentlicht' },
  { value: 'failed', label: 'Fehlgeschlagen' },
];

const PLATFORM_ICONS: Record<string, string> = {
  twitter: '𝕏',
  linkedin: 'in',
  discord: '🎮',
};

// ===========================================
// Status badge label helper
// ===========================================

function statusLabel(status: PostStatus): string {
  switch (status) {
    case 'draft': return 'Entwurf';
    case 'pending_approval': return 'Ausstehend';
    case 'approved': return 'Genehmigt';
    case 'scheduled': return 'Geplant';
    case 'published': return 'Veröffentlicht';
    case 'failed': return 'Fehlgeschlagen';
  }
}

// ===========================================
// PostCard
// ===========================================

interface PostCardProps {
  post: SocialPost;
  onApprove: (id: string) => void;
  onPublish: (id: string) => void;
  onSchedule: (id: string, scheduledAt: string) => void;
  onDelete: (id: string) => void;
  isActing: boolean;
}

function PostCard({ post, onApprove, onPublish, onSchedule, onDelete, isActing }: PostCardProps) {
  const canApprove = post.status === 'draft' || post.status === 'pending_approval';
  const canPublish = post.status === 'draft' || post.status === 'pending_approval' || post.status === 'approved';
  const canSchedule = post.status === 'draft' || post.status === 'approved' || post.status === 'pending_approval';
  const canDelete = post.status !== 'published';

  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleScheduleSubmit = useCallback(() => {
    if (!scheduleValue) {
      setScheduleError('Bitte Datum und Uhrzeit auswählen.');
      return;
    }
    const date = new Date(scheduleValue);
    if (isNaN(date.getTime())) {
      setScheduleError('Ungültiges Datum.');
      return;
    }
    if (date <= new Date()) {
      setScheduleError('Datum muss in der Zukunft liegen.');
      return;
    }
    setScheduleError('');
    setShowScheduler(false);
    onSchedule(post.id, date.toISOString());
  }, [scheduleValue, post.id, onSchedule]);

  return (
    <article className="social-post-card" data-testid="post-card">
      <div className="social-post-card__header">
        <span className="social-post-card__platform">
          <span className="social-post-card__platform-icon" aria-hidden="true">
            {PLATFORM_ICONS[post.platform] ?? '?'}
          </span>
          {post.platform}
        </span>
        <span className="social-post-card__spacer" />
        <span
          className={`social-post-card__status social-post-card__status--${post.status}`}
          aria-label={`Status: ${statusLabel(post.status)}`}
        >
          {statusLabel(post.status)}
        </span>
      </div>

      <p className="social-post-card__content">{post.content}</p>

      {post.metrics && Object.keys(post.metrics).length > 0 && (
        <div className="post-metrics">
          {post.metrics.impressions != null && (
            <span>👁 {Number(post.metrics.impressions).toLocaleString()}</span>
          )}
          {post.metrics.likes != null && (
            <span>❤️ {post.metrics.likes}</span>
          )}
          {(post.metrics.retweets ?? post.metrics.shares) != null && (
            <span>🔁 {post.metrics.retweets ?? post.metrics.shares}</span>
          )}
        </div>
      )}

      <div className="social-post-card__meta">
        {post.scheduled_at && (
          <span>Geplant: {new Date(post.scheduled_at).toLocaleString('de-DE')}</span>
        )}
        {post.published_at && (
          <span>Veröffentlicht: {new Date(post.published_at).toLocaleString('de-DE')}</span>
        )}
        {!post.scheduled_at && !post.published_at && (
          <span>Erstellt: {new Date(post.created_at).toLocaleString('de-DE')}</span>
        )}
      </div>

      {showScheduler && (
        <div className="social-post-card__scheduler" data-testid="schedule-picker">
          <input
            ref={dateInputRef}
            type="datetime-local"
            className="social-post-card__datetime-input"
            value={scheduleValue}
            onChange={e => { setScheduleValue(e.target.value); setScheduleError(''); }}
            aria-label="Veröffentlichungszeitpunkt"
            min={new Date().toISOString().slice(0, 16)}
          />
          {scheduleError && (
            <span className="social-post-card__schedule-error" role="alert">{scheduleError}</span>
          )}
          <div className="social-post-card__scheduler-actions">
            <Button variant="default" size="sm" onClick={handleScheduleSubmit} disabled={isActing}>
              Bestätigen
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowScheduler(false); setScheduleError(''); }}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      <div className="social-post-card__actions">
        {canApprove && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onApprove(post.id)}
            disabled={isActing}
          >
            <CheckCircle2 size={13} />
            Genehmigen
          </Button>
        )}
        {canPublish && (
          <Button
            variant="default"
            size="sm"
            onClick={() => onPublish(post.id)}
            disabled={isActing}
          >
            <Send size={13} />
            Jetzt veröffentlichen
          </Button>
        )}
        {canSchedule && !showScheduler && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowScheduler(true)}
            disabled={isActing}
          >
            <Clock size={13} />
            Planen
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(post.id)}
            disabled={isActing}
          >
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </article>
  );
}

// ===========================================
// PostsTab
// ===========================================

interface PostsTabProps {
  context: AIContext;
}

function PostsTab({ context }: PostsTabProps) {
  const [statusFilter, setStatusFilter] = useState<PostStatus | 'all'>('all');

  const filters = statusFilter === 'all' ? undefined : { status: statusFilter };
  const { data: posts = [], isLoading, error, refetch } = useSocialPostsQuery(context, filters);
  const approveMutation = useApprovePostMutation(context);
  const publishMutation = usePublishPostMutation(context);
  const scheduleMutation = useSchedulePostMutation(context);
  const deleteMutation = useDeletePostMutation(context);

  const isActing =
    approveMutation.isPending ||
    publishMutation.isPending ||
    scheduleMutation.isPending ||
    deleteMutation.isPending;

  const handleSchedule = useCallback((id: string, scheduledAt: string) => {
    scheduleMutation.mutate({ id, scheduled_at: scheduledAt });
  }, [scheduleMutation]);

  if (isLoading) {
    return (
      <div className="social-loading-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <QueryErrorState error={error as Error} refetch={refetch} />;
  }

  return (
    <div data-testid="posts-tab">
      <div className="social-posts__filters" role="group" aria-label="Status-Filter">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            className={`social-posts__filter-btn${statusFilter === f.value ? ' social-posts__filter-btn--active' : ''}`}
            onClick={() => setStatusFilter(f.value as PostStatus | 'all')}
            aria-pressed={statusFilter === f.value}
          >
            {f.label}
          </button>
        ))}
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={<Share2 size={36} strokeWidth={1.5} />}
          title="Keine Posts"
          description="Noch keine Social-Media-Posts vorhanden."
        />
      ) : (
        <div className="social-posts__list">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onApprove={id => approveMutation.mutate(id)}
              onPublish={id => publishMutation.mutate(id)}
              onSchedule={handleSchedule}
              onDelete={id => deleteMutation.mutate(id)}
              isActing={isActing}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================
// CalendarTab
// ===========================================

interface CalendarTabProps {
  context: AIContext;
}

function CalendarTab({ context }: CalendarTabProps) {
  const { data: posts = [], isLoading, error, refetch } = useSocialCalendarQuery(context);

  if (isLoading) {
    return (
      <div className="social-loading-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <QueryErrorState error={error as Error} refetch={refetch} />;
  }

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={36} strokeWidth={1.5} />}
        title="Keine geplanten Posts"
        description="Plane deinen ersten Post, um ihn hier zu sehen."
      />
    );
  }

  const sorted = [...posts].sort((a, b) => {
    const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
    const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
    return ta - tb;
  });

  return (
    <div className="social-calendar__list" data-testid="calendar-tab">
      {sorted.map(post => {
        const date = post.scheduled_at ? new Date(post.scheduled_at) : null;
        return (
          <div key={post.id} className="social-calendar__item">
            <div className="social-calendar__date">
              {date ? (
                <>
                  <div className="social-calendar__date-day">{date.getDate()}</div>
                  <div className="social-calendar__date-month">
                    {date.toLocaleString('de-DE', { month: 'short' })}
                  </div>
                  <div className="social-calendar__date-time">
                    {date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </>
              ) : (
                <div className="social-calendar__date-month">–</div>
              )}
            </div>
            <div className="social-calendar__divider" />
            <div className="social-calendar__info">
              <div className="social-calendar__platform">{post.platform}</div>
              <div className="social-calendar__preview">{post.content}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================
// PlatformsTab
// ===========================================

interface PlatformsTabProps {
  context: AIContext;
}

function PlatformsTab({ context }: PlatformsTabProps) {
  const { data: platforms = [], isLoading, error, refetch } = usePlatformStatusQuery(context);

  if (isLoading) {
    return (
      <div className="social-loading-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <QueryErrorState error={error as Error} refetch={refetch} />;
  }

  return (
    <div className="social-platforms__grid" data-testid="platforms-tab">
      {platforms.map(p => (
        <div key={p.platform} className="social-platform-card">
          <div className="social-platform-card__header">
            <span className="social-platform-card__icon" aria-hidden="true">
              {PLATFORM_ICONS[p.platform] ?? '?'}
            </span>
            <span className="social-platform-card__name">{p.platform}</span>
          </div>
          <div className="social-platform-card__status">
            <span
              className={`social-platform-card__dot social-platform-card__dot--${p.configured ? 'ok' : 'error'}`}
              aria-hidden="true"
            />
            <span className={`social-platform-card__status-text--${p.configured ? 'ok' : 'error'}`}>
              {p.configured ? 'Verbunden' : 'Nicht konfiguriert'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===========================================
// SocialMediaPage (main)
// ===========================================

interface SocialMediaPageProps {
  context: AIContext | string;
  initialTab?: string;
}

export function SocialMediaPage({ context, initialTab }: SocialMediaPageProps) {
  const validTabs: Tab[] = ['posts', 'calendar', 'platforms'];
  const resolved = (initialTab && validTabs.includes(initialTab as Tab))
    ? (initialTab as Tab)
    : 'posts';

  const [activeTab, setActiveTab] = useState<Tab>(resolved);
  const ctx = context as AIContext;

  return (
    <div className="social-media-page" role="main" aria-label="Social Media Agent">
      <nav className="social-media-page__tabs" role="tablist" aria-label="Social Media Tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`social-tab-panel-${tab.id}`}
            className={`social-media-page__tab${activeTab === tab.id ? ' social-media-page__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      <div
        className="social-media-page__content"
        role="tabpanel"
        id={`social-tab-panel-${activeTab}`}
        aria-label={TABS.find(t => t.id === activeTab)?.label}
      >
        {activeTab === 'posts' && <PostsTab context={ctx} />}
        {activeTab === 'calendar' && <CalendarTab context={ctx} />}
        {activeTab === 'platforms' && <PlatformsTab context={ctx} />}
      </div>
    </div>
  );
}
