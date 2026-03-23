import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardPage } from '../DashboardPage';

// ── Mock PanelContext ───────────────────────────────────────────────────
const mockDispatch = vi.fn();
vi.mock('../../../contexts/PanelContext', () => ({
  usePanelContext: () => ({
    state: { activePanel: null, pinned: false, width: 420 },
    dispatch: mockDispatch,
  }),
}));

// ── Mock react-router-dom navigate ──────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Mock hooks ──────────────────────────────────────────────────────────

// Tasks
const mockTasksQuery = vi.fn();
vi.mock('../../../hooks/queries/useTasks', () => ({
  useTasksQuery: (...args: unknown[]) => mockTasksQuery(...args),
}));

// Calendar
const mockCalendarQuery = vi.fn();
vi.mock('../../../hooks/queries/useCalendar', () => ({
  useUpcomingCalendarEventsQuery: (...args: unknown[]) => mockCalendarQuery(...args),
}));

// Email
const mockEmailStatsQuery = vi.fn();
vi.mock('../../../hooks/queries/useEmail', () => ({
  useEmailStatsQuery: (...args: unknown[]) => mockEmailStatsQuery(...args),
}));

// Smart suggestions
const mockSmartSuggestions = vi.fn();
vi.mock('../../../hooks/useSmartSuggestions', () => ({
  useSmartSuggestions: (...args: unknown[]) => mockSmartSuggestions(...args),
}));

// Cognitive data
const mockCuriosityGaps = vi.fn();
const mockCognitiveOverview = vi.fn();
const mockReviewQueue = vi.fn();
vi.mock('../../../hooks/queries/useCognitiveData', () => ({
  useCuriosityGaps: (...args: unknown[]) => mockCuriosityGaps(...args),
  useReviewQueue: (...args: unknown[]) => mockReviewQueue(...args),
}));

vi.mock('../../../hooks/queries/useCognitive', () => ({
  useCognitiveOverview: (...args: unknown[]) => mockCognitiveOverview(...args),
}));

// Chat sessions
const mockChatSessionsQuery = vi.fn();
vi.mock('../../../hooks/queries/useChat', () => ({
  useChatSessionsQuery: (...args: unknown[]) => mockChatSessionsQuery(...args),
}));

// ── Helpers ─────────────────────────────────────────────────────────────

function makeQueryResult(data: unknown, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

function setDefaultMocks() {
  mockTasksQuery.mockReturnValue(makeQueryResult([]));
  mockCalendarQuery.mockReturnValue(makeQueryResult([]));
  mockEmailStatsQuery.mockReturnValue(makeQueryResult({ unreadCount: 0, categories: {} }));
  mockSmartSuggestions.mockReturnValue({ suggestions: [], loading: false });
  mockCuriosityGaps.mockReturnValue(makeQueryResult([]));
  mockCognitiveOverview.mockReturnValue(makeQueryResult(null));
  mockReviewQueue.mockReturnValue(makeQueryResult([]));
  mockChatSessionsQuery.mockReturnValue(makeQueryResult([]));
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderDashboard(context: 'personal' | 'work' | 'learning' | 'creative' = 'personal') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage context={context} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('DashboardPage — Widgets with Real Data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultMocks();
  });

  // ── Structure ───────────────────────────────────────────────────────

  it('renders all 4 widget titles', () => {
    renderDashboard();
    expect(screen.getByText('Heute')).toBeInTheDocument();
    expect(screen.getByText('AI Insights')).toBeInTheDocument();
    expect(screen.getByText('Letzte Aktivitaet')).toBeInTheDocument();
    expect(screen.getByText('Memory Health')).toBeInTheDocument();
  });

  it('has dashboard grid layout', () => {
    const { container } = renderDashboard();
    expect(container.querySelector('.dashboard-grid')).toBeInTheDocument();
  });

  it('each widget is a clickable button', () => {
    renderDashboard();
    const widgets = screen.getAllByRole('button');
    expect(widgets.length).toBeGreaterThanOrEqual(4);
  });

  // ── Widget 1: Heute ─────────────────────────────────────────────────

  describe('Heute Widget', () => {
    it('shows pending tasks count for today', () => {
      const today = new Date().toISOString().split('T')[0];
      mockTasksQuery.mockReturnValue(
        makeQueryResult([
          { id: '1', title: 'Task A', due_date: today, status: 'pending' },
          { id: '2', title: 'Task B', due_date: today, status: 'pending' },
          { id: '3', title: 'Task C', due_date: '2099-12-31', status: 'pending' },
        ]),
      );
      renderDashboard();
      expect(screen.getByText(/2 offene Tasks/)).toBeInTheDocument();
    });

    it('shows next calendar event', () => {
      const future = new Date(Date.now() + 3600_000).toISOString();
      mockCalendarQuery.mockReturnValue(
        makeQueryResult([{ id: '1', title: 'Standup', start_time: future }]),
      );
      renderDashboard();
      expect(screen.getByText(/Standup/)).toBeInTheDocument();
    });

    it('shows unread email count', () => {
      mockEmailStatsQuery.mockReturnValue(
        makeQueryResult({ unreadCount: 5, categories: {} }),
      );
      renderDashboard();
      expect(screen.getByText(/5 ungelesene Mails/)).toBeInTheDocument();
    });

    it('shows empty state when all done', () => {
      renderDashboard();
      expect(screen.getByText('Alles erledigt')).toBeInTheDocument();
    });

    it('dispatches OPEN_PANEL tasks on click', () => {
      renderDashboard();
      const widget = screen.getByText('Heute').closest('button');
      if (widget) fireEvent.click(widget);
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'OPEN_PANEL', panel: 'tasks' });
    });
  });

  // ── Widget 2: AI Insights ───────────────────────────────────────────

  describe('AI Insights Widget', () => {
    it('shows up to 3 suggestions', () => {
      mockSmartSuggestions.mockReturnValue({
        suggestions: [
          { id: '1', title: 'Tipp A', type: 'morning_briefing' },
          { id: '2', title: 'Tipp B', type: 'knowledge_gap' },
          { id: '3', title: 'Tipp C', type: 'reminder' },
          { id: '4', title: 'Tipp D', type: 'reminder' },
        ],
        loading: false,
      });
      renderDashboard();
      expect(screen.getByText('Tipp A')).toBeInTheDocument();
      expect(screen.getByText('Tipp B')).toBeInTheDocument();
      expect(screen.getByText('Tipp C')).toBeInTheDocument();
      expect(screen.queryByText('Tipp D')).not.toBeInTheDocument();
    });

    it('shows top knowledge gap', () => {
      mockCuriosityGaps.mockReturnValue(
        makeQueryResult([
          { topic: 'Kubernetes', gapScore: 0.8, suggestedAction: 'web_research' },
        ]),
      );
      renderDashboard();
      expect(screen.getByText(/Kubernetes/)).toBeInTheDocument();
    });

    it('shows empty state when no suggestions', () => {
      renderDashboard();
      expect(screen.getByText('Keine Vorschlaege gerade')).toBeInTheDocument();
    });
  });

  // ── Widget 3: Letzte Aktivitaet ─────────────────────────────────────

  describe('Letzte Aktivitaet Widget', () => {
    it('shows recent chat sessions', () => {
      const now = new Date().toISOString();
      mockChatSessionsQuery.mockReturnValue(
        makeQueryResult([
          { id: '1', title: 'React Hooks Frage', updatedAt: now, context: 'personal' },
          { id: '2', title: 'Python Debugging', updatedAt: now, context: 'work' },
        ]),
      );
      renderDashboard();
      expect(screen.getByText('React Hooks Frage')).toBeInTheDocument();
      expect(screen.getByText('Python Debugging')).toBeInTheDocument();
    });

    it('shows max 5 sessions', () => {
      const sessions = Array.from({ length: 7 }, (_, i) => ({
        id: String(i),
        title: `Session ${i}`,
        updatedAt: new Date().toISOString(),
        context: 'personal',
      }));
      mockChatSessionsQuery.mockReturnValue(makeQueryResult(sessions));
      renderDashboard();
      expect(screen.getByText('Session 0')).toBeInTheDocument();
      expect(screen.getByText('Session 4')).toBeInTheDocument();
      expect(screen.queryByText('Session 5')).not.toBeInTheDocument();
    });

    it('shows empty state', () => {
      renderDashboard();
      expect(screen.getByText('Noch keine Gespraeche')).toBeInTheDocument();
    });

    it('navigates to chat on click', () => {
      renderDashboard();
      const widget = screen.getByText('Letzte Aktivitaet').closest('button');
      if (widget) fireEvent.click(widget);
      expect(mockNavigate).toHaveBeenCalledWith('/chat');
    });
  });

  // ── Widget 4: Memory Health ─────────────────────────────────────────

  describe('Memory Health Widget', () => {
    it('shows composite score from cognitive overview', () => {
      mockCognitiveOverview.mockReturnValue(
        makeQueryResult({
          confidence_score: 0.8,
          coherence_score: 0.6,
          coverage_score: 0.7,
        }),
      );
      renderDashboard();
      // (0.8 + 0.6 + 0.7) / 3 * 100 = 70
      expect(screen.getByText('70')).toBeInTheDocument();
    });

    it('shows review queue count', () => {
      mockCognitiveOverview.mockReturnValue(
        makeQueryResult({
          confidence_score: 0.9,
          coherence_score: 0.9,
          coverage_score: 0.9,
        }),
      );
      mockReviewQueue.mockReturnValue(
        makeQueryResult([
          { id: '1', content: 'fact 1' },
          { id: '2', content: 'fact 2' },
          { id: '3', content: 'fact 3' },
        ]),
      );
      renderDashboard();
      expect(screen.getByText(/3 Reviews faellig/)).toBeInTheDocument();
    });

    it('dispatches OPEN_PANEL memory on click', () => {
      renderDashboard();
      const widget = screen.getByText('Memory Health').closest('button');
      if (widget) fireEvent.click(widget);
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'OPEN_PANEL', panel: 'memory' });
    });

    it('shows 0 with empty data text', () => {
      renderDashboard();
      expect(screen.getByText('Noch keine Daten')).toBeInTheDocument();
    });

    it('renders SVG ring chart', () => {
      mockCognitiveOverview.mockReturnValue(
        makeQueryResult({
          confidence_score: 0.8,
          coherence_score: 0.8,
          coverage_score: 0.8,
        }),
      );
      const { container } = renderDashboard();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  // ── Loading States ──────────────────────────────────────────────────

  describe('Loading states', () => {
    it('shows skeleton for Heute widget when loading', () => {
      mockTasksQuery.mockReturnValue(makeQueryResult(undefined, { isLoading: true }));
      const { container } = renderDashboard();
      expect(container.querySelector('.dashboard-widget__skeleton')).toBeInTheDocument();
    });

    it('shows skeleton for Memory widget when loading', () => {
      mockCognitiveOverview.mockReturnValue(makeQueryResult(undefined, { isLoading: true }));
      const { container } = renderDashboard();
      expect(container.querySelector('.dashboard-widget__skeleton')).toBeInTheDocument();
    });
  });

  // ── Error States ──────────────────────────────────────────────────

  describe('Error states', () => {
    it('shows error state with retry button on Memory widget', () => {
      const refetch = vi.fn();
      mockCognitiveOverview.mockReturnValue(
        makeQueryResult(undefined, { isError: true, error: new Error('fail'), refetch }),
      );
      renderDashboard();
      expect(screen.getByText('Nicht verfuegbar')).toBeInTheDocument();
      const retryBtn = screen.getByText('Erneut versuchen');
      fireEvent.click(retryBtn);
      expect(refetch).toHaveBeenCalled();
    });

    it('shows error state on Letzte Aktivitaet widget', () => {
      const refetch = vi.fn();
      mockChatSessionsQuery.mockReturnValue(
        makeQueryResult(undefined, { isError: true, error: new Error('fail'), refetch }),
      );
      renderDashboard();
      expect(screen.getAllByText('Nicht verfuegbar').length).toBeGreaterThanOrEqual(1);
    });
  });
});
