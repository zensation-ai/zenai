/**
 * Unit Tests for InsightsDashboard Component
 *
 * Tests the insights dashboard including:
 * - Rendering without crashing
 * - Tab navigation (6 tabs)
 * - Default tab selection
 * - Tab switching
 * - HubPage integration
 *
 * @module tests/components/InsightsDashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useTabNavigation to control active tab
let mockActiveTab = 'analytics';
const mockHandleTabChange = vi.fn((tab: string) => {
  mockActiveTab = tab;
});

vi.mock('../../hooks/useTabNavigation', () => ({
  useTabNavigation: () => ({
    activeTab: mockActiveTab,
    handleTabChange: mockHandleTabChange,
  }),
}));

// Mock HubPage to simplify testing
vi.mock('../HubPage', () => ({
  HubPage: ({ title, subtitle, tabs, activeTab, onTabChange, children, context }: any) => (
    <div data-testid="hub-page" data-context={context}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
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
          </button>
        ))}
      </nav>
      <div data-testid="tab-content">{children}</div>
    </div>
  ),
}));

// Mock lazy-loaded child components
vi.mock('../AnalyticsDashboard/AnalyticsDashboard', () => ({
  AnalyticsDashboardV2: () => <div data-testid="analytics-dashboard">AnalyticsDashboard</div>,
}));

vi.mock('../DigestDashboard', () => ({
  DigestDashboard: () => <div data-testid="digest-dashboard">DigestDashboard</div>,
}));

vi.mock('../KnowledgeGraph/KnowledgeGraphPage', () => ({
  default: () => <div data-testid="knowledge-graph">KnowledgeGraph</div>,
}));

vi.mock('../GraphRAGPanel', () => ({
  GraphRAGPanel: () => <div data-testid="graphrag-panel">GraphRAGPanel</div>,
}));

vi.mock('../InsightsDashboard/SleepInsights', () => ({
  SleepInsights: () => <div data-testid="sleep-insights">SleepInsights</div>,
}));

vi.mock('../InsightsDashboard/AITracesPanel', () => ({
  AITracesPanel: () => <div data-testid="ai-traces-panel">AITracesPanel</div>,
}));

vi.mock('../InsightsDashboard/TemporalKGPanel', () => ({
  TemporalKGPanel: () => <div data-testid="temporal-kg-panel">TemporalKGPanel</div>,
}));

vi.mock('../SkeletonLoader', () => ({
  SkeletonLoader: () => <div data-testid="skeleton-loader">Loading...</div>,
}));

import { InsightsDashboard } from '../InsightsDashboard';

const defaultProps = {
  context: 'personal' as const,
  onBack: vi.fn(),
  onSelectIdea: vi.fn(),
  initialTab: 'analytics' as const,
};

describe('InsightsDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = 'analytics';
  });

  it('renders without crashing', () => {
    render(<InsightsDashboard {...defaultProps} />);
    expect(screen.getByTestId('hub-page')).toBeInTheDocument();
  });

  it('shows page title and subtitle', () => {
    render(<InsightsDashboard {...defaultProps} />);
    expect(screen.getByText('Insights')).toBeInTheDocument();
    expect(screen.getByText(/Deine Gedanken im/)).toBeInTheDocument();
  });

  it('renders all 6 tab buttons', () => {
    render(<InsightsDashboard {...defaultProps} />);
    const tabNav = screen.getByTestId('tab-nav');
    const tabs = tabNav.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(6);
  });

  it('renders key tab labels', () => {
    render(<InsightsDashboard {...defaultProps} />);
    expect(screen.getByTestId('tab-analytics')).toBeInTheDocument();
    expect(screen.getByTestId('tab-digest')).toBeInTheDocument();
    expect(screen.getByTestId('tab-connections')).toBeInTheDocument();
    expect(screen.getByTestId('tab-graphrag')).toBeInTheDocument();
    expect(screen.getByTestId('tab-sleep')).toBeInTheDocument();
    expect(screen.getByTestId('tab-ai-traces')).toBeInTheDocument();
  });

  it('switches tabs when a tab is clicked', () => {
    render(<InsightsDashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-digest'));
    expect(mockHandleTabChange).toHaveBeenCalledWith('digest');
  });

  it('renders tab content area for default tab', () => {
    render(<InsightsDashboard {...defaultProps} />);
    // Lazy-loaded content renders via Suspense; at minimum the tab-content wrapper exists
    expect(screen.getByTestId('tab-content')).toBeInTheDocument();
  });

  it('marks analytics tab as selected by default', () => {
    render(<InsightsDashboard {...defaultProps} />);
    expect(screen.getByTestId('tab-analytics')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-digest')).toHaveAttribute('aria-selected', 'false');
  });

  it('passes context to HubPage', () => {
    render(<InsightsDashboard {...defaultProps} />);
    expect(screen.getByTestId('hub-page')).toHaveAttribute('data-context', 'personal');
  });
});
