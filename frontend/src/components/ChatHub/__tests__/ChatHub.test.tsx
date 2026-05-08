import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatHub } from '../ChatHub';

// Mock GeneralChat (heavyweight, lazy-loaded)
vi.mock('../../GeneralChat', () => ({
  GeneralChat: (props: Record<string, unknown>) => (
    <div data-testid="general-chat" data-context={props.context as string}>GeneralChat Mock</div>
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

  it('renders GeneralChat as the conversation stream', async () => {
    render(<ChatHub context="operations" />);
    await waitFor(() => expect(screen.getByTestId('general-chat')).toBeInTheDocument());
  });

  it('passes context to GeneralChat', async () => {
    render(<ChatHub context="finance" />);
    await waitFor(() => expect(screen.getByTestId('general-chat')).toBeInTheDocument());
    expect(screen.getByTestId('general-chat')).toHaveAttribute('data-context', 'finance');
  });

  it('has a main landmark for the hub', () => {
    render(<ChatHub context="operations" />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Chat Hub');
  });
});
