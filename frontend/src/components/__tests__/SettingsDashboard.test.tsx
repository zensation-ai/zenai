/**
 * Unit Tests for SettingsDashboard Component
 *
 * Tests the settings page including:
 * - Rendering without crashing
 * - Tab navigation (16 tabs)
 * - General tab content
 * - Tab switching
 * - HubPage integration
 *
 * @module tests/components/SettingsDashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useTabNavigation to control active tab
let mockActiveTab = 'general';
const mockHandleTabChange = vi.fn((tab: string) => {
  mockActiveTab = tab;
});

vi.mock('../../hooks/useTabNavigation', () => ({
  useTabNavigation: () => ({
    activeTab: mockActiveTab,
    handleTabChange: mockHandleTabChange,
  }),
}));

// Mock useSettings
vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      theme: 'dark',
      language: 'de',
      startPage: 'home',
      aiModel: 'claude-sonnet',
      proactiveSuggestions: true,
      memorySystem: true,
      dataProcessing: true,
    },
    updateSetting: vi.fn(),
  }),
}));

// Mock useAuth
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { mfa_enabled: false, email: 'test@example.com' },
    getAccessToken: () => 'mock-token',
  }),
}));

// Mock constants
vi.mock('../../constants/featureHints', () => ({
  FEATURE_HINTS: [],
  STORAGE_KEY_PREFIX: 'zenai-hint-',
}));

// Mock HubPage to simplify testing
vi.mock('../HubPage', () => ({
  HubPage: ({ title, subtitle, tabs, activeTab, onTabChange, children, ariaLabel }: any) => (
    <div data-testid="hub-page" aria-label={ariaLabel}>
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
vi.mock('../ProfileDashboard', () => ({
  ProfileDashboard: () => <div data-testid="profile-dashboard">ProfileDashboard</div>,
}));

vi.mock('../AutomationDashboard', () => ({
  AutomationDashboard: () => <div data-testid="automation-dashboard">AutomationDashboard</div>,
}));

vi.mock('../IntegrationsPage', () => ({
  IntegrationsPage: () => <div data-testid="integrations-page">IntegrationsPage</div>,
}));

vi.mock('../DataManagement', () => ({
  DataManagement: () => <div data-testid="data-management">DataManagement</div>,
}));

vi.mock('../MemoryGovernance', () => ({
  MemoryGovernance: () => <div data-testid="memory-governance">MemoryGovernance</div>,
}));

vi.mock('../GovernanceDashboard', () => ({
  GovernanceDashboard: () => <div data-testid="governance-dashboard">GovernanceDashboard</div>,
}));

vi.mock('../MCPConnectionsPage', () => ({
  MCPConnectionsPage: () => <div data-testid="mcp-connections">MCPConnectionsPage</div>,
}));

vi.mock('../ExtensionMarketplace/ExtensionMarketplace', () => ({
  ExtensionMarketplace: () => <div data-testid="extension-marketplace">ExtensionMarketplace</div>,
}));

vi.mock('../ContextRulesPanel', () => ({
  ContextRulesPanel: () => <div data-testid="context-rules-panel">ContextRulesPanel</div>,
}));

vi.mock('../ProactiveRulesPanel', () => ({
  ProactiveRulesPanel: () => <div data-testid="proactive-rules-panel">ProactiveRulesPanel</div>,
}));

vi.mock('../SecurityAuditPanel', () => ({
  SecurityAuditPanel: () => <div data-testid="security-audit-panel">SecurityAuditPanel</div>,
}));

vi.mock('../ObservabilityPanel', () => ({
  ObservabilityPanel: () => <div data-testid="observability-panel">ObservabilityPanel</div>,
}));

vi.mock('../OnDeviceAI/OnDeviceAISettings', () => ({
  OnDeviceAISettings: () => <div data-testid="on-device-ai-settings">OnDeviceAISettings</div>,
}));

vi.mock('../SkeletonLoader', () => ({
  SkeletonLoader: () => <div data-testid="skeleton-loader">Loading...</div>,
}));

import { SettingsDashboard } from '../SettingsDashboard';

const defaultProps = {
  context: 'personal' as const,
  onBack: vi.fn(),
  onNavigate: vi.fn(),
  initialTab: 'general' as const,
};

describe('SettingsDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = 'general';
  });

  it('renders without crashing', () => {
    render(<SettingsDashboard {...defaultProps} />);
    expect(screen.getByTestId('hub-page')).toBeInTheDocument();
  });

  it('shows page title and subtitle', () => {
    render(<SettingsDashboard {...defaultProps} />);
    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
    expect(screen.getByText('App-Konfiguration und Datenschutz')).toBeInTheDocument();
  });

  it('renders all 16 tab buttons', () => {
    render(<SettingsDashboard {...defaultProps} />);
    const tabNav = screen.getByTestId('tab-nav');
    const tabs = tabNav.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(16);
  });

  it('renders key tab labels', () => {
    render(<SettingsDashboard {...defaultProps} />);
    expect(screen.getByTestId('tab-profile')).toBeInTheDocument();
    expect(screen.getByTestId('tab-account')).toBeInTheDocument();
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-ai')).toBeInTheDocument();
    expect(screen.getByTestId('tab-privacy')).toBeInTheDocument();
    expect(screen.getByTestId('tab-data')).toBeInTheDocument();
  });

  it('shows General tab content by default', () => {
    render(<SettingsDashboard {...defaultProps} />);
    // General tab should show appearance settings
    expect(screen.getByText('Erscheinungsbild')).toBeInTheDocument();
    expect(screen.getByText('Farbschema')).toBeInTheDocument();
    expect(screen.getByText('Sprache')).toBeInTheDocument();
  });

  it('shows Verhalten section in General tab', () => {
    render(<SettingsDashboard {...defaultProps} />);
    expect(screen.getByText('Verhalten')).toBeInTheDocument();
    expect(screen.getByText('Startseite')).toBeInTheDocument();
  });

  it('calls handleTabChange when clicking a different tab', () => {
    render(<SettingsDashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-profile'));
    expect(mockHandleTabChange).toHaveBeenCalledWith('profile');
  });

  it('shows Profile tab content when profile tab is active', async () => {
    mockActiveTab = 'profile';
    render(<SettingsDashboard {...defaultProps} initialTab="profile" />);
    // Profile is lazy-loaded via Suspense; wait for it
    const profileDashboard = await screen.findByTestId('profile-dashboard');
    expect(profileDashboard).toBeInTheDocument();
  });

  it('shows Account tab content when account tab is active', () => {
    mockActiveTab = 'account';
    render(<SettingsDashboard {...defaultProps} initialTab="account" />);
    // Account tab shows password change section - use getAllByText since "Passwort" appears in tab + content
    const passwordElements = screen.getAllByText(/Passwort/i);
    expect(passwordElements.length).toBeGreaterThanOrEqual(1);
  });

  it('has correct ARIA label on tab navigation', () => {
    render(<SettingsDashboard {...defaultProps} />);
    expect(screen.getByTestId('hub-page')).toHaveAttribute('aria-label', 'Einstellungs-Kategorien');
  });

  it('marks the active tab as selected', () => {
    render(<SettingsDashboard {...defaultProps} />);
    const generalTab = screen.getByTestId('tab-general');
    expect(generalTab).toHaveAttribute('aria-selected', 'true');
  });
});
