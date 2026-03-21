/**
 * Unit Tests for AgentTeamsPage Component
 *
 * Tests the multi-agent orchestration page including:
 * - Rendering without crashing
 * - Tab navigation (Teams, Agenten, Workflows, A2A)
 * - Strategy selection
 * - Template loading
 * - Task input
 * - Analytics toggle
 *
 * @module tests/components/AgentTeamsPage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

// Mock child components
vi.mock('../AgentIdentityPanel', () => ({
  AgentIdentityPanel: () => <div data-testid="agent-identity-panel">AgentIdentityPanel</div>,
}));

vi.mock('../A2AAgentsPanel', () => ({
  A2AAgentsPanel: () => <div data-testid="a2a-agents-panel">A2AAgentsPanel</div>,
}));

vi.mock('../WorkflowPanel', () => ({
  WorkflowPanel: () => <div data-testid="workflow-panel">WorkflowPanel</div>,
}));

vi.mock('../Toast', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../utils/aiPersonality', () => ({
  getTimeBasedGreeting: () => ({ greeting: 'Guten Tag', emoji: '' }),
}));

vi.mock('../../utils/errors', () => ({
  logError: vi.fn(),
}));

vi.mock('../../utils/apiConfig', () => ({
  getApiBaseUrl: () => 'http://localhost:3000',
  getApiFetchHeaders: () => ({ 'Content-Type': 'application/json' }),
}));

import { AgentTeamsPage } from '../AgentTeamsPage';

const defaultProps = {
  context: 'personal' as const,
  onBack: vi.fn(),
  embedded: false,
};

describe('AgentTeamsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful history and templates loading
    mockedAxios.get.mockImplementation((url: string) => {
      if (url === '/api/agents/history') {
        return Promise.resolve({ data: { success: true, executions: [] } });
      }
      if (url === '/api/agents/templates') {
        return Promise.resolve({
          data: {
            success: true,
            templates: [
              { id: 'deep-research', name: 'Tiefenrecherche', description: 'Umfassende Recherche', icon: '', strategy: 'research_only', promptHint: '' },
              { id: 'blog-post', name: 'Blog-Artikel', description: 'Artikel schreiben', icon: '', strategy: 'research_write_review', promptHint: '' },
            ],
          },
        });
      }
      if (url === '/api/agents/analytics') {
        return Promise.resolve({
          data: {
            success: true,
            totals: { executions: 10, successful: 8, failed: 2, tokens: 5000, successRate: 80 },
            byStrategy: [],
            dailyTrend: [],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders without crashing', () => {
    render(<AgentTeamsPage {...defaultProps} />);
    expect(screen.getByText('Agent Teams')).toBeInTheDocument();
  });

  it('shows header with back button when not embedded', () => {
    render(<AgentTeamsPage {...defaultProps} />);
    const backButton = screen.getByText(/Zur.ck/);
    expect(backButton).toBeInTheDocument();
    fireEvent.click(backButton);
    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  it('hides header when embedded', () => {
    render(<AgentTeamsPage {...defaultProps} embedded={true} />);
    expect(screen.queryByText(/Zur.ck/)).not.toBeInTheDocument();
  });

  it('shows tab navigation with 4 tabs', () => {
    render(<AgentTeamsPage {...defaultProps} />);
    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(screen.getByText('Agenten')).toBeInTheDocument();
    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByText('A2A')).toBeInTheDocument();
  });

  it('defaults to Teams tab', () => {
    render(<AgentTeamsPage {...defaultProps} />);
    // Teams tab should show strategy selection grid
    expect(screen.getByText('Komplett')).toBeInTheDocument();
    expect(screen.getByText('Recherche')).toBeInTheDocument();
    expect(screen.getByText('Code')).toBeInTheDocument();
  });

  it('switches to Agenten tab and shows AgentIdentityPanel', () => {
    render(<AgentTeamsPage {...defaultProps} />);
    fireEvent.click(screen.getByText('Agenten'));
    expect(screen.getByTestId('agent-identity-panel')).toBeInTheDocument();
  });

  it('switches to Workflows tab and shows WorkflowPanel', () => {
    render(<AgentTeamsPage {...defaultProps} />);
    fireEvent.click(screen.getByText('Workflows'));
    expect(screen.getByTestId('workflow-panel')).toBeInTheDocument();
  });

  it('switches to A2A tab and shows A2AAgentsPanel', () => {
    render(<AgentTeamsPage {...defaultProps} />);
    fireEvent.click(screen.getByText('A2A'));
    expect(screen.getByTestId('a2a-agents-panel')).toBeInTheDocument();
  });

  it('shows strategy selection cards on Teams tab', () => {
    render(<AgentTeamsPage {...defaultProps} />);
    expect(screen.getByText('Komplett')).toBeInTheDocument();
    expect(screen.getByText('Recherche')).toBeInTheDocument();
    expect(screen.getByText('Schreiben')).toBeInTheDocument();
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Code-Review')).toBeInTheDocument();
    expect(screen.getByText('Angepasst')).toBeInTheDocument();
  });

  it('loads templates on mount', async () => {
    render(<AgentTeamsPage {...defaultProps} />);
    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/agents/templates');
    });
  });

  it('loads history on mount', async () => {
    render(<AgentTeamsPage {...defaultProps} />);
    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/agents/history', expect.any(Object));
    });
  });

  it('has analytics toggle button', () => {
    render(<AgentTeamsPage {...defaultProps} />);
    const analyticsBtn = screen.getByLabelText('Analytics anzeigen');
    expect(analyticsBtn).toBeInTheDocument();
  });
});
