/**
 * Unit Tests for MCPConnectionsPage Component
 *
 * Tests server listing, form display, tab navigation, and empty states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock child components
vi.mock('../ToolMarketplace', () => ({
  ToolMarketplace: () => <div data-testid="tool-marketplace">ToolMarketplace</div>,
}));

vi.mock('../ServerSetupWizard', () => ({
  ServerSetupWizard: ({ onCancel }: any) => (
    <div data-testid="server-setup-wizard">
      <button onClick={onCancel}>Cancel Wizard</button>
    </div>
  ),
}));

vi.mock('../ConfirmDialog', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock('../MCPConnectionsPage.css', () => ({}));

import { MCPConnectionsPage } from '../MCPConnectionsPage';

const defaultProps = {
  context: 'personal' as const,
};

const mockServer = {
  id: 'srv-001',
  name: 'GitHub MCP',
  transport: 'streamable-http',
  url: 'https://github-mcp.example.com',
  command: null,
  args: [],
  envVars: {},
  authType: 'bearer',
  authConfig: { token: 'test' },
  enabled: true,
  healthStatus: 'healthy',
  lastHealthCheck: '2026-03-20T10:00:00Z',
  toolCount: 5,
  resourceCount: 2,
  errorMessage: null,
  connected: true,
  liveHealthy: true,
  createdAt: '2026-03-20T09:00:00Z',
  updatedAt: '2026-03-20T10:00:00Z',
};

describe('MCPConnectionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/mcp/servers')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
    });
  });

  it('should render the page header', async () => {
    render(<MCPConnectionsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('MCP Ecosystem Hub')).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<MCPConnectionsPage {...defaultProps} />);

    expect(screen.getByText('Lade Server...')).toBeInTheDocument();
  });

  it('should show empty state when no servers configured', async () => {
    render(<MCPConnectionsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Keine MCP Server konfiguriert')).toBeInTheDocument();
    });
  });

  it('should render tab navigation for Servers and Marketplace', async () => {
    render(<MCPConnectionsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Server (0)')).toBeInTheDocument();
    });
    expect(screen.getByText('Marketplace')).toBeInTheDocument();
  });

  it('should switch to marketplace tab', async () => {
    render(<MCPConnectionsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('Lade Server...')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Marketplace'));
    expect(screen.getByTestId('tool-marketplace')).toBeInTheDocument();
  });

  it('should show server list when servers exist', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/mcp/servers')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [mockServer] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
    });

    render(<MCPConnectionsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('GitHub MCP')).toBeInTheDocument();
    });
    expect(screen.getByText('Verbunden')).toBeInTheDocument();
    expect(screen.getByText('HTTP')).toBeInTheDocument();
  });

  it('should show add server button', async () => {
    render(<MCPConnectionsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('Lade Server...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('+ Server hinzufuegen')).toBeInTheDocument();
  });

  it('should show ecosystem summary when servers exist', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/mcp/servers')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [mockServer] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
    });

    render(<MCPConnectionsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Server (1)')).toBeInTheDocument();
    });
    // Summary stats should show
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Resources')).toBeInTheDocument();
  });
});
