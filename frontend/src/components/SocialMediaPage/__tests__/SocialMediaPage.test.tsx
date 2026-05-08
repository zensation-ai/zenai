/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SocialMediaPage } from '../SocialMediaPage';

// ─── Mock React Query hooks ────────────────────────────────────────────────

const mockPost = {
  id: 'post-1',
  source_type: 'manual',
  source_id: null,
  platform: 'twitter' as const,
  content: 'Hello from ZenAI #AI',
  media_urls: [],
  status: 'draft' as const,
  scheduled_at: null,
  published_at: null,
  platform_post_id: null,
  engagement_metrics: null,
  created_at: '2026-04-01T09:00:00Z',
  updated_at: '2026-04-01T09:00:00Z',
};

const mockScheduledPost = {
  ...mockPost,
  id: 'post-2',
  status: 'scheduled' as const,
  scheduled_at: '2026-04-05T14:30:00Z',
};

vi.mock('../../../hooks/queries/useSocial', () => ({
  useSocialPostsQuery: () => ({
    data: [mockPost],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSocialCalendarQuery: () => ({
    data: [mockScheduledPost],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePlatformStatusQuery: () => ({
    data: [
      { platform: 'twitter', configured: true, name: 'Twitter' },
      { platform: 'discord', configured: true, name: 'Discord' },
      { platform: 'linkedin', configured: false, name: 'LinkedIn' },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useApprovePostMutation: () => ({ mutate: vi.fn(), isPending: false }),
  usePublishPostMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSchedulePostMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePostMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

// ─── Setup ─────────────────────────────────────────────────────────────────

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
});

function renderPage(initialTab?: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SocialMediaPage context="operations" initialTab={initialTab} />
    </QueryClientProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('SocialMediaPage', () => {
  it('renders the tab bar', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /Posts/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Kalender/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Plattformen/i })).toBeInTheDocument();
  });

  it('defaults to the Posts tab', () => {
    renderPage();
    expect(screen.getByTestId('posts-tab')).toBeInTheDocument();
  });

  it('respects initialTab prop', () => {
    renderPage('calendar');
    expect(screen.getByTestId('calendar-tab')).toBeInTheDocument();
  });

  it('respects initialTab=platforms', () => {
    renderPage('platforms');
    expect(screen.getByTestId('platforms-tab')).toBeInTheDocument();
  });

  it('switches to Calendar tab on click', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Kalender/i }));
    expect(screen.getByTestId('calendar-tab')).toBeInTheDocument();
  });

  it('switches to Platforms tab on click', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Plattformen/i }));
    expect(screen.getByTestId('platforms-tab')).toBeInTheDocument();
  });

  it('active tab has --active class', () => {
    renderPage();
    const postsTab = screen.getByRole('tab', { name: /Posts/i });
    expect(postsTab.className).toContain('--active');
  });
});

describe('PostsTab', () => {
  it('renders status filter buttons', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Alle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entwurf/i })).toBeInTheDocument();
  });

  it('renders a post card', () => {
    renderPage();
    expect(screen.getByTestId('post-card')).toBeInTheDocument();
  });

  it('shows post content', () => {
    renderPage();
    expect(screen.getByText('Hello from ZenAI #AI')).toBeInTheDocument();
  });

  it('shows draft status badge', () => {
    renderPage();
    expect(screen.getByLabelText('Status: Entwurf')).toBeInTheDocument();
  });

  it('shows publish and approve buttons for draft posts', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Jetzt veröffentlichen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Genehmigen/i })).toBeInTheDocument();
  });

  it('shows inline schedule picker when Planen is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Planen/i }));
    expect(screen.getByTestId('schedule-picker')).toBeInTheDocument();
    expect(screen.getByLabelText('Veröffentlichungszeitpunkt')).toBeInTheDocument();
  });

  it('shows error when schedule submitted without date', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Planen/i }));
    fireEvent.click(screen.getByRole('button', { name: /Bestätigen/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('CalendarTab', () => {
  it('shows the scheduled post', () => {
    renderPage('calendar');
    expect(screen.getByText('Hello from ZenAI #AI')).toBeInTheDocument();
  });

  it('shows platform label', () => {
    renderPage('calendar');
    expect(screen.getByText('twitter')).toBeInTheDocument();
  });
});

describe('PlatformsTab', () => {
  it('shows twitter as connected', () => {
    renderPage('platforms');
    const cards = screen.getAllByText('Verbunden');
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });

  it('shows linkedin as not configured', () => {
    renderPage('platforms');
    expect(screen.getByText('Nicht konfiguriert')).toBeInTheDocument();
  });

  it('renders all 3 platform cards', () => {
    renderPage('platforms');
    expect(screen.getAllByText(/Verbunden|Nicht konfiguriert/).length).toBe(3);
  });
});
