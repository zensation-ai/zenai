/**
 * Unit Tests for NotificationsPage Component
 *
 * Tests tab navigation, loading state, error display, and device listing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock axios
const mockAxiosGet = vi.fn();
const mockAxiosPut = vi.fn();
const mockAxiosDelete = vi.fn();
const mockIsAxiosError = vi.fn(() => false);

vi.mock('axios', () => ({
  default: {
    get: (...args: any[]) => mockAxiosGet(...args),
    put: (...args: any[]) => mockAxiosPut(...args),
    delete: (...args: any[]) => mockAxiosDelete(...args),
    isAxiosError: (...args: any[]) => mockIsAxiosError(...args),
  },
}));

vi.mock('../Toast', () => ({
  showToast: vi.fn(),
}));

vi.mock('../ConfirmDialog', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock('../../utils/aiPersonality', () => ({
  getRandomReward: () => ({ emoji: '', message: 'Good' }),
}));

vi.mock('../ContextSwitcher', () => ({
  getContextLabel: (ctx: string) => ctx,
}));

vi.mock('../UnifiedInbox/UnifiedInbox', () => ({
  UnifiedInbox: () => <div data-testid="unified-inbox">UnifiedInbox</div>,
}));

vi.mock('../NotificationsPage.css', () => ({}));
vi.mock('../../neurodesign.css', () => ({}));

import { NotificationsPage } from '../NotificationsPage';

const defaultProps = {
  onBack: vi.fn(),
  context: 'personal' as const,
};

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all API calls succeed with empty data
    mockAxiosGet.mockImplementation((url: string) => {
      if (url.includes('/status')) return Promise.resolve({ data: { configured: false } });
      if (url.includes('/devices')) return Promise.resolve({ data: { devices: [] } });
      if (url.includes('/history')) return Promise.resolve({ data: { notifications: [] } });
      if (url.includes('/stats')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
  });

  it('should show loading state initially', () => {
    // Make the promise never resolve to keep loading state
    mockAxiosGet.mockReturnValue(new Promise(() => {}));
    render(<NotificationsPage {...defaultProps} />);
    expect(screen.getByText('Lade Benachrichtigungen...')).toBeInTheDocument();
  });

  it('should render tabs after loading', async () => {
    render(<NotificationsPage {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText('Lade Benachrichtigungen...')).not.toBeInTheDocument();
    });
    // Check that tab buttons exist
    const tabs = screen.getAllByRole('button').filter(btn => btn.classList.contains('tab-btn'));
    expect(tabs.length).toBe(5);
    expect(screen.getByText(/📥 Inbox/)).toBeInTheDocument();
    expect(screen.getByText(/📊 Übersicht/)).toBeInTheDocument();
  });

  it('should show back button that calls onBack', async () => {
    render(<NotificationsPage {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText('Lade Benachrichtigungen...')).not.toBeInTheDocument();
    });
    const backButton = screen.getByText('← Zurück');
    fireEvent.click(backButton);
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });

  it('should show UnifiedInbox on inbox tab by default', async () => {
    render(<NotificationsPage {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('unified-inbox')).toBeInTheDocument();
    });
  });

  it('should switch to devices tab and show empty state', async () => {
    render(<NotificationsPage {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText('Lade Benachrichtigungen...')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Geräte/));
    expect(screen.getByText('Keine Geräte registriert')).toBeInTheDocument();
  });

  it('should show history tab with empty state', async () => {
    render(<NotificationsPage {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText('Lade Benachrichtigungen...')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Verlauf/));
    expect(screen.getByText('Noch keine Benachrichtigungen')).toBeInTheDocument();
  });

  it('should display page title', async () => {
    render(<NotificationsPage {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText('Lade Benachrichtigungen...')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Benachrichtigungen');
  });
});
