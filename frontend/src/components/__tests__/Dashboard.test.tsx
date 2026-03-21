/**
 * Unit Tests for Dashboard Component
 *
 * Tests the bento grid dashboard layout including:
 * - Rendering without crashing
 * - Loading skeletons
 * - Data display after load
 * - Error state
 * - Navigation callbacks
 * - Quick nav section
 * - AI status section
 * - Recent ideas section
 *
 * @module tests/components/Dashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock React Query dashboard hooks
const mockSummaryData = {
  stats: { total: 42, highPriority: 5, thisWeek: 12, todayCount: 3 },
  streak: 7,
  trend: [{ date: '2026-03-20', count: 5 }, { date: '2026-03-21', count: 3 }],
  recentIdeas: [
    { id: '1', title: 'Test Idea One', type: 'task', priority: 'high', created_at: new Date().toISOString() },
    { id: '2', title: 'Test Idea Two', type: 'idea', priority: 'medium', created_at: new Date().toISOString() },
  ],
  activities: [
    { id: 'a1', activityType: 'idea_created', message: 'Neue Idee erstellt', createdAt: new Date().toISOString(), isRead: false, ideaId: '1' },
  ],
  unreadCount: 1,
};

let mockSummaryLoading = false;
let mockSummaryError = false;
let mockSummaryErrorObj: Error | null = null;

vi.mock('../../hooks/queries/useDashboard', () => ({
  useDashboardSummaryQuery: () => ({
    data: mockSummaryLoading ? undefined : (mockSummaryError ? undefined : mockSummaryData),
    isLoading: mockSummaryLoading,
    isError: mockSummaryError,
    error: mockSummaryErrorObj,
    refetch: vi.fn(),
  }),
  useAIPulseQuery: () => ({
    data: { memoryFacts: 10, procedures: 5, sleepCycles: 3, ragQueries: 20 },
    isLoading: false,
  }),
  useUpcomingEventsQuery: () => ({
    data: [
      { id: 'e1', title: 'Team Meeting', start_time: '2026-03-22T10:00:00Z', event_type: 'appointment', ai_generated: false },
    ],
    isLoading: false,
  }),
  useMarkActivityReadMutation: () => ({
    mutate: vi.fn(),
  }),
}));

// Mock child components
vi.mock('../AIBrain', () => ({
  AIBrain: () => <div data-testid="ai-brain">AIBrain</div>,
}));

vi.mock('../RisingBubbles', () => ({
  RisingBubbles: () => null,
}));

vi.mock('../ProactiveDigest', () => ({
  ProactiveDigest: () => <div data-testid="proactive-digest">ProactiveDigest</div>,
}));

vi.mock('../ProactiveBriefing/ProactiveBriefingWidget', () => ({
  ProactiveBriefingWidget: () => <div data-testid="briefing-widget">BriefingWidget</div>,
}));

vi.mock('../SetupChecklist', () => ({
  SetupChecklist: () => <div data-testid="setup-checklist">SetupChecklist</div>,
}));

vi.mock('../QueryErrorState', () => ({
  QueryErrorState: ({ refetch }: { refetch: () => void }) => (
    <div data-testid="query-error-state">
      <button onClick={refetch}>Erneut versuchen</button>
    </div>
  ),
}));

vi.mock('../../utils/aiPersonality', () => ({
  getTimeBasedGreeting: () => ({ greeting: 'Guten Tag', emoji: '' }),
}));

vi.mock('../../utils/animations', () => ({
  staggerItem: {},
  usePrefersReducedMotion: () => true,
}));

vi.mock('../../utils/navIcons', () => ({
  getPageIcon: () => () => <span data-testid="nav-icon">icon</span>,
}));

import { Dashboard } from '../Dashboard';

const defaultProps = {
  context: 'personal' as const,
  onNavigate: vi.fn(),
  isAIActive: false,
  ideasCount: 42,
  apiStatus: { status: 'ok' } as any,
};

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSummaryLoading = false;
    mockSummaryError = false;
    mockSummaryErrorObj = null;
  });

  it('renders without crashing', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByRole('region', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows greeting text', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('Guten Tag')).toBeInTheDocument();
  });

  it('shows loading skeletons when data is loading', () => {
    mockSummaryLoading = true;
    const { container } = render(<Dashboard {...defaultProps} />);
    // Should show skeleton placeholders (ds-skeleton from design system)
    const skeletons = container.querySelectorAll('.ds-skeleton, .bento-stat .ds-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('displays stat tiles after data loads', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Gesamt')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Diese Woche')).toBeInTheDocument();
  });

  it('displays streak value', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('Streak')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', () => {
    mockSummaryError = true;
    mockSummaryErrorObj = new Error('Network error');
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByTestId('query-error-state')).toBeInTheDocument();
  });

  it('shows quick nav section with navigation items', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('Schnellzugriff')).toBeInTheDocument();
    expect(screen.getByText('Gedanken')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('navigates when clicking a quick nav item', () => {
    render(<Dashboard {...defaultProps} />);
    const chatButton = screen.getByText('Chat');
    fireEvent.click(chatButton);
    expect(defaultProps.onNavigate).toHaveBeenCalledWith('chat');
  });

  it('shows AI status section', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('KI bereit')).toBeInTheDocument();
    expect(screen.getByText(/Chat starten/)).toBeInTheDocument();
  });

  it('shows "KI arbeitet..." when AI is active', () => {
    render(<Dashboard {...defaultProps} isAIActive={true} />);
    expect(screen.getByText('KI arbeitet...')).toBeInTheDocument();
  });

  it('displays AI pulse metrics', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('Denkmuster')).toBeInTheDocument();
    expect(screen.getByText('Prozeduren')).toBeInTheDocument();
    expect(screen.getByText('Schlaf-Zyklen')).toBeInTheDocument();
    expect(screen.getByText('RAG-Suchen')).toBeInTheDocument();
  });

  it('displays recent ideas', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('Letzte Gedanken')).toBeInTheDocument();
    expect(screen.getByText('Test Idea One')).toBeInTheDocument();
    expect(screen.getByText('Test Idea Two')).toBeInTheDocument();
  });

  it('shows AI activity section with unread badge', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('KI-Aktivitaet')).toBeInTheDocument();
    expect(screen.getByText('Neue Idee erstellt')).toBeInTheDocument();
  });

  it('navigates to ideas on "Neuer Gedanke" button click', () => {
    render(<Dashboard {...defaultProps} />);
    const ctaButton = screen.getByText('Neuer Gedanke');
    fireEvent.click(ctaButton);
    expect(defaultProps.onNavigate).toHaveBeenCalledWith('ideas');
  });

  it('shows context badge with correct label', () => {
    render(<Dashboard {...defaultProps} context="work" />);
    expect(screen.getByText('Arbeit')).toBeInTheDocument();
  });

  it('shows upcoming events section', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
  });
});
