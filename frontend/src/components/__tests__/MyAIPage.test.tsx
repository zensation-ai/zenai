/**
 * Unit Tests for MyAIPage Component
 *
 * Tests the My AI page including:
 * - Rendering without crashing
 * - Tab navigation (5 tabs)
 * - Default tab selection
 * - Tab switching
 * - HubPage integration
 *
 * @module tests/components/MyAIPage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useTabNavigation
let mockActiveTab = 'personalize';
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
vi.mock('../PersonalizationChat', () => ({
  PersonalizationChat: () => <div data-testid="personalization-chat">PersonalizationChat</div>,
}));

vi.mock('../MemoryTransparency', () => ({
  MemoryTransparency: () => <div data-testid="memory-transparency">MemoryTransparency</div>,
}));

vi.mock('../VoiceChat/VoiceChat', () => ({
  VoiceChat: () => <div data-testid="voice-chat">VoiceChat</div>,
}));

vi.mock('../VoiceChat/VoiceSettings', () => ({
  VoiceSettings: () => <div data-testid="voice-settings">VoiceSettings</div>,
}));

vi.mock('../ProceduralMemoryPanel', () => ({
  ProceduralMemoryPanel: () => <div data-testid="procedural-memory">ProceduralMemoryPanel</div>,
}));

vi.mock('../DigitalTwinPage/DigitalTwinPage', () => ({
  DigitalTwinPage: () => <div data-testid="digital-twin">DigitalTwinPage</div>,
}));

vi.mock('../SkeletonLoader', () => ({
  SkeletonLoader: () => <div data-testid="skeleton-loader">Loading...</div>,
}));

import { MyAIPage } from '../MyAIPage';

const defaultProps = {
  context: 'personal' as const,
  onBack: vi.fn(),
  initialTab: 'personalize' as const,
};

describe('MyAIPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = 'personalize';
  });

  it('renders without crashing', () => {
    render(<MyAIPage {...defaultProps} />);
    expect(screen.getByTestId('hub-page')).toBeInTheDocument();
  });

  it('shows page title and subtitle', () => {
    render(<MyAIPage {...defaultProps} />);
    expect(screen.getByText('Meine KI')).toBeInTheDocument();
    expect(screen.getByText('Personalisierung, KI-Wissen und Sprach-Chat')).toBeInTheDocument();
  });

  it('renders all 5 tab buttons', () => {
    render(<MyAIPage {...defaultProps} />);
    const tabNav = screen.getByTestId('tab-nav');
    const tabs = tabNav.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(5);
  });

  it('renders key tab labels', () => {
    render(<MyAIPage {...defaultProps} />);
    expect(screen.getByTestId('tab-personalize')).toBeInTheDocument();
    expect(screen.getByTestId('tab-memory')).toBeInTheDocument();
    expect(screen.getByTestId('tab-procedures')).toBeInTheDocument();
    expect(screen.getByTestId('tab-digital-twin')).toBeInTheDocument();
    expect(screen.getByTestId('tab-voice-chat')).toBeInTheDocument();
  });

  it('switches tabs when a tab is clicked', () => {
    render(<MyAIPage {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-memory'));
    expect(mockHandleTabChange).toHaveBeenCalledWith('memory');
  });

  it('renders tab content area for default tab', () => {
    render(<MyAIPage {...defaultProps} />);
    expect(screen.getByTestId('tab-content')).toBeInTheDocument();
  });

  it('marks personalize tab as selected by default', () => {
    render(<MyAIPage {...defaultProps} />);
    expect(screen.getByTestId('tab-personalize')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-memory')).toHaveAttribute('aria-selected', 'false');
  });

  it('marks memory tab as selected when active', () => {
    mockActiveTab = 'memory';
    render(<MyAIPage {...defaultProps} />);
    expect(screen.getByTestId('tab-memory')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-personalize')).toHaveAttribute('aria-selected', 'false');
  });

  it('marks voice-chat tab as selected when active', () => {
    mockActiveTab = 'voice-chat';
    render(<MyAIPage {...defaultProps} />);
    expect(screen.getByTestId('tab-voice-chat')).toHaveAttribute('aria-selected', 'true');
  });

  it('passes context to HubPage', () => {
    render(<MyAIPage {...defaultProps} />);
    expect(screen.getByTestId('hub-page')).toHaveAttribute('data-context', 'personal');
  });
});
