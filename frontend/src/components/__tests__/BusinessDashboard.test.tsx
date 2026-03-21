/**
 * Unit Tests for BusinessDashboard Component
 *
 * Tests the business dashboard including:
 * - Rendering without crashing
 * - Tab navigation (9 tabs)
 * - Default tab selection
 * - Tab switching
 * - HubPage integration
 *
 * @module tests/components/BusinessDashboard
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

// Mock HubPage
vi.mock('../HubPage', () => ({
  HubPage: ({ title, subtitle, tabs, activeTab, onTabChange, children, context, ariaLabel }: any) => (
    <div data-testid="hub-page" data-context={context} aria-label={ariaLabel}>
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
vi.mock('../business/BusinessOverview', () => ({
  BusinessOverview: () => <div data-testid="business-overview">BusinessOverview</div>,
}));

vi.mock('../business/RevenueDashboard', () => ({
  RevenueDashboard: () => <div data-testid="revenue-dashboard">RevenueDashboard</div>,
}));

vi.mock('../business/TrafficDashboard', () => ({
  TrafficDashboard: () => <div data-testid="traffic-dashboard">TrafficDashboard</div>,
}));

vi.mock('../business/SeoDashboard', () => ({
  SeoDashboard: () => <div data-testid="seo-dashboard">SeoDashboard</div>,
}));

vi.mock('../business/HealthDashboard', () => ({
  HealthDashboard: () => <div data-testid="health-dashboard">HealthDashboard</div>,
}));

vi.mock('../business/BusinessInsightsTab', () => ({
  BusinessInsightsTab: () => <div data-testid="business-insights">BusinessInsightsTab</div>,
}));

vi.mock('../business/BusinessReports', () => ({
  BusinessReports: () => <div data-testid="business-reports">BusinessReports</div>,
}));

vi.mock('../business/ConnectorSettings', () => ({
  ConnectorSettings: () => <div data-testid="connector-settings">ConnectorSettings</div>,
}));

vi.mock('../BusinessNarrative/BusinessNarrative', () => ({
  BusinessNarrative: () => <div data-testid="business-narrative">BusinessNarrative</div>,
}));

vi.mock('../SkeletonLoader', () => ({
  SkeletonLoader: () => <div data-testid="skeleton-loader">Loading...</div>,
}));

import { BusinessDashboard } from '../BusinessDashboard';

const defaultProps = {
  context: 'personal' as const,
  onBack: vi.fn(),
  initialTab: 'overview' as const,
};

describe('BusinessDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = 'overview';
  });

  it('renders without crashing', () => {
    render(<BusinessDashboard {...defaultProps} />);
    expect(screen.getByTestId('hub-page')).toBeInTheDocument();
  });

  it('shows page title and subtitle', () => {
    render(<BusinessDashboard {...defaultProps} />);
    expect(screen.getByText('Business Manager')).toBeInTheDocument();
    expect(screen.getByText('AI-gesteuerte Geschäftsanalysen')).toBeInTheDocument();
  });

  it('renders all 9 tab buttons', () => {
    render(<BusinessDashboard {...defaultProps} />);
    const tabNav = screen.getByTestId('tab-nav');
    const tabs = tabNav.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(9);
  });

  it('renders key tab labels', () => {
    render(<BusinessDashboard {...defaultProps} />);
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('tab-revenue')).toBeInTheDocument();
    expect(screen.getByTestId('tab-traffic')).toBeInTheDocument();
    expect(screen.getByTestId('tab-seo')).toBeInTheDocument();
    expect(screen.getByTestId('tab-health')).toBeInTheDocument();
    expect(screen.getByTestId('tab-insights')).toBeInTheDocument();
    expect(screen.getByTestId('tab-reports')).toBeInTheDocument();
    expect(screen.getByTestId('tab-connectors')).toBeInTheDocument();
    expect(screen.getByTestId('tab-intelligence')).toBeInTheDocument();
  });

  it('switches tabs when a tab is clicked', () => {
    render(<BusinessDashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-revenue'));
    expect(mockHandleTabChange).toHaveBeenCalledWith('revenue');
  });

  it('renders tab content area for default tab', () => {
    render(<BusinessDashboard {...defaultProps} />);
    expect(screen.getByTestId('tab-content')).toBeInTheDocument();
  });

  it('marks overview tab as selected by default', () => {
    render(<BusinessDashboard {...defaultProps} />);
    expect(screen.getByTestId('tab-overview')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-revenue')).toHaveAttribute('aria-selected', 'false');
  });

  it('marks revenue tab as selected when active', () => {
    mockActiveTab = 'revenue';
    render(<BusinessDashboard {...defaultProps} />);
    expect(screen.getByTestId('tab-revenue')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-overview')).toHaveAttribute('aria-selected', 'false');
  });

  it('has ARIA label for accessibility', () => {
    render(<BusinessDashboard {...defaultProps} />);
    expect(screen.getByTestId('hub-page')).toHaveAttribute('aria-label', 'Business Navigation');
  });
});
