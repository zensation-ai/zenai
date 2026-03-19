import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatHub } from '../ChatHub';

// Mock GeneralChat (heavyweight, lazy-loaded)
vi.mock('../../GeneralChat', () => ({
  GeneralChat: (props: Record<string, unknown>) => (
    <div data-testid="general-chat" data-context={props.context as string}>GeneralChat Mock</div>
  ),
}));

// Mock SmartSurfaceV2
vi.mock('../SmartSurfaceV2', () => ({
  SmartSurfaceV2: (props: Record<string, unknown>) => (
    <div data-testid="smart-surface-v2" data-context={props.context as string}>SmartSurfaceV2 Mock</div>
  ),
}));

// Mock useSmartSuggestions
vi.mock('../../../hooks/useSmartSuggestions', () => ({
  useSmartSuggestions: vi.fn(() => ({
    suggestions: [],
    loading: false,
    timeOfDay: 'morning',
    dismiss: vi.fn(),
    snooze: vi.fn(),
    accept: vi.fn(),
    refresh: vi.fn(),
  })),
  isMorningBriefingTime: vi.fn(() => false),
  getTimeOfDay: vi.fn(() => 'morning'),
  getDayOfWeek: vi.fn(() => 'monday'),
}));

describe('ChatHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the 3-layer layout: SmartSurface + chat + IntentBar', async () => {
    render(<ChatHub context="personal" />);
    expect(screen.getByTestId('smart-surface-v2')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('general-chat')).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/frag mich|gib mir/i)).toBeInTheDocument();
  });

  it('passes context to child components', async () => {
    render(<ChatHub context="work" />);
    expect(screen.getByTestId('smart-surface-v2')).toHaveAttribute('data-context', 'work');
    await waitFor(() => expect(screen.getByTestId('general-chat')).toBeInTheDocument());
    expect(screen.getByTestId('general-chat')).toHaveAttribute('data-context', 'work');
  });

  it('has a main landmark for the hub', () => {
    render(<ChatHub context="personal" />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Chat Hub');
  });
});
