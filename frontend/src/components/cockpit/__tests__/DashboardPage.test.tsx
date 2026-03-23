import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { DashboardPage } from '../DashboardPage';

// Mock PanelContext
vi.mock('../../../contexts/PanelContext', () => ({
  usePanelContext: () => ({
    state: { activePanel: null, pinned: false, width: 420 },
    dispatch: vi.fn(),
  }),
}));

// Mock all data hooks with empty defaults
vi.mock('../../../hooks/queries/useTasks', () => ({
  useTasksQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('../../../hooks/queries/useCalendar', () => ({
  useUpcomingCalendarEventsQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('../../../hooks/queries/useEmail', () => ({
  useEmailStatsQuery: () => ({ data: { unreadCount: 0, categories: {} }, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('../../../hooks/useSmartSuggestions', () => ({
  useSmartSuggestions: () => ({ suggestions: [], loading: false }),
}));
vi.mock('../../../hooks/queries/useCognitiveData', () => ({
  useCuriosityGaps: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useReviewQueue: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('../../../hooks/queries/useCognitive', () => ({
  useCognitiveOverview: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('../../../hooks/queries/useChat', () => ({
  useChatSessionsQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DashboardPage', () => {
  const renderDashboard = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage context="personal" />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('renders 4 widget sections', () => {
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
});
