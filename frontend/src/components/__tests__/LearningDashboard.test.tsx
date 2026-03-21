/**
 * Unit Tests for LearningDashboard Component
 *
 * Tests the learning dashboard including:
 * - Rendering without crashing
 * - Loading state
 * - Error state
 * - Tab navigation (6 tabs)
 * - Data display
 * - Header action button
 *
 * @module tests/components/LearningDashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useTabNavigation
let mockActiveTab = 'overview';
const mockHandleTabChange = vi.fn((tab: string) => {
  mockActiveTab = tab;
});

vi.mock('../../hooks/useTabNavigation', () => ({
  useTabNavigation: () => ({
    activeTab: mockActiveTab,
    handleTabChange: mockHandleTabChange,
  }),
}));

// Mock useLearningDashboardQuery
const mockLearningData = {
  focus: {
    active_areas: [
      { id: '1', name: 'TypeScript', is_active: true },
    ],
    stats: { active_focus_areas: 1, total_focus_areas: 2 },
  },
  suggestions: {
    active: [{ id: 's1', title: 'Learn React Patterns', status: 'pending' }],
  },
  research: {
    pending: [{ id: 'r1', title: 'AI Trends 2026', status: 'pending' }],
  },
  feedback: {
    stats: { total: 10, positive: 8 },
    insights: [],
  },
  profile: {
    stats: { totalIdeas: 42, totalFacts: 15 },
  },
};

let mockLoading = false;
let mockIsError = false;
let mockQueryError: Error | null = null;
const mockRefetch = vi.fn();

vi.mock('../../hooks/queries/useLearningData', () => ({
  useLearningDashboardQuery: () => ({
    data: mockLoading ? undefined : (mockIsError ? undefined : mockLearningData),
    isLoading: mockLoading,
    isError: mockIsError,
    error: mockQueryError,
    refetch: mockRefetch,
  }),
}));

// Mock HubPage
vi.mock('../HubPage', () => ({
  HubPage: ({ title, subtitle, tabs, activeTab, onTabChange, children, headerActions, ariaLabel }: any) => (
    <div data-testid="hub-page" aria-label={ariaLabel}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {headerActions && <div data-testid="header-actions">{headerActions}</div>}
      <nav data-testid="tab-nav" role="tablist">
        {tabs.map((tab: any) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            {tab.icon} {tab.label}
            {tab.badge != null && <span data-testid={`badge-${tab.id}`}>{tab.badge}</span>}
          </button>
        ))}
      </nav>
      <div data-testid="tab-content">{children}</div>
    </div>
  ),
}));

// Mock child tab components
vi.mock('../LearningDashboard/OverviewTab', () => ({
  OverviewTab: () => <div data-testid="overview-tab">Overview Content</div>,
}));

vi.mock('../LearningDashboard/FocusTab', () => ({
  FocusTab: () => <div data-testid="focus-tab">Focus Content</div>,
}));

vi.mock('../LearningDashboard/SuggestionsTab', () => ({
  SuggestionsTab: () => <div data-testid="suggestions-tab">Suggestions Content</div>,
}));

vi.mock('../LearningDashboard/ResearchTab', () => ({
  ResearchTab: () => <div data-testid="research-tab">Research Content</div>,
}));

vi.mock('../LearningDashboard/FeedbackTab', () => ({
  FeedbackTab: () => <div data-testid="feedback-tab">Feedback Content</div>,
}));

vi.mock('../LearningDashboard/ProfileTab', () => ({
  ProfileTab: () => <div data-testid="profile-tab">Profile Content</div>,
}));

vi.mock('../SkeletonLoader', () => ({
  SkeletonLoader: () => <div data-testid="skeleton-loader">Loading...</div>,
}));

vi.mock('../QueryErrorState', () => ({
  QueryErrorState: ({ error, refetch }: any) => (
    <div data-testid="query-error-state">
      <p>Error: {error?.message}</p>
      <button onClick={refetch}>Retry</button>
    </div>
  ),
}));

vi.mock('../Toast', () => ({
  showToast: vi.fn(),
}));

vi.mock('../ConfirmDialog', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock('../../utils/aiPersonality', () => ({
  getTimeBasedGreeting: () => ({ emoji: '👋', subtext: 'Willkommen!' }),
  EMPTY_STATE_MESSAGES: {
    learning: { description: 'Lerne und wachse mit KI-Unterstuetzung' },
  },
}));

vi.mock('../../utils/errors', () => ({
  logError: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import { LearningDashboard } from '../LearningDashboard/LearningDashboard';

const defaultProps = {
  context: 'personal' as const,
  onBack: vi.fn(),
  initialTab: 'overview' as const,
};

describe('LearningDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = 'overview';
    mockLoading = false;
    mockIsError = false;
    mockQueryError = null;
  });

  it('renders without crashing', () => {
    render(<LearningDashboard {...defaultProps} />);
    expect(screen.getByTestId('hub-page')).toBeInTheDocument();
  });

  it('shows page title with greeting', () => {
    render(<LearningDashboard {...defaultProps} />);
    // Title includes greeting emoji
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders all 6 tab buttons', () => {
    render(<LearningDashboard {...defaultProps} />);
    const tabNav = screen.getByTestId('tab-nav');
    const tabs = tabNav.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(6);
  });

  it('renders tab labels', () => {
    render(<LearningDashboard {...defaultProps} />);
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('tab-focus')).toBeInTheDocument();
    expect(screen.getByTestId('tab-suggestions')).toBeInTheDocument();
    expect(screen.getByTestId('tab-research')).toBeInTheDocument();
    expect(screen.getByTestId('tab-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('tab-profile')).toBeInTheDocument();
  });

  it('shows loading state when data is loading', () => {
    mockLoading = true;
    render(<LearningDashboard {...defaultProps} />);
    expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
  });

  it('shows error state on query error', () => {
    mockIsError = true;
    mockQueryError = new Error('Network error');
    render(<LearningDashboard {...defaultProps} />);
    expect(screen.getByTestId('query-error-state')).toBeInTheDocument();
  });

  it('renders overview tab content by default', () => {
    render(<LearningDashboard {...defaultProps} />);
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument();
  });

  it('switches tabs when clicked', () => {
    render(<LearningDashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-focus'));
    expect(mockHandleTabChange).toHaveBeenCalledWith('focus');
  });

  it('shows header action button for triggering learning', () => {
    render(<LearningDashboard {...defaultProps} />);
    expect(screen.getByTestId('header-actions')).toBeInTheDocument();
    expect(screen.getByText('Lernen starten')).toBeInTheDocument();
  });

  it('shows dynamic badges on tabs when data has counts', () => {
    render(<LearningDashboard {...defaultProps} />);
    // Focus tab should have badge with count 1
    expect(screen.getByTestId('badge-focus')).toHaveTextContent('1');
    // Suggestions tab should have badge with count 1
    expect(screen.getByTestId('badge-suggestions')).toHaveTextContent('1');
  });
});
