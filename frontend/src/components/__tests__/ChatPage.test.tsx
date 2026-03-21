/**
 * Unit Tests for ChatPage Component
 *
 * Tests the chat page layout including:
 * - Rendering without crashing
 * - Session sidebar presence
 * - Context bar presence
 * - Quick actions section
 * - Chat area with GeneralChat
 * - Context switching
 * - New chat handling
 *
 * @module tests/components/ChatPage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock child components to avoid lazy loading and heavy dependencies
vi.mock('../ChatSessionSidebar', () => ({
  ChatSessionSidebar: ({ collapsed, onToggleCollapse, onNewChat }: any) => (
    <div data-testid="chat-session-sidebar" data-collapsed={collapsed}>
      <button onClick={onToggleCollapse} data-testid="toggle-sidebar">Toggle</button>
      <button onClick={onNewChat} data-testid="new-chat-btn">Neuer Chat</button>
    </div>
  ),
}));

vi.mock('../GeneralChat/ChatContextBar', () => ({
  ChatContextBar: ({ context, onContextChange }: any) => (
    <div data-testid="chat-context-bar" data-context={context}>
      <button onClick={() => onContextChange('work')} data-testid="switch-to-work">Work</button>
    </div>
  ),
}));

vi.mock('../GeneralChat/ChatQuickActions', () => ({
  ChatQuickActions: ({ context, onAction, hasMessages }: any) => (
    <div data-testid="chat-quick-actions" data-context={context} data-has-messages={hasMessages}>
      <button onClick={() => onAction('Test prompt')} data-testid="quick-action-btn">Action</button>
    </div>
  ),
}));

vi.mock('../GeneralChat', () => ({
  GeneralChat: ({ context, initialSessionId, onSessionChange }: any) => (
    <div data-testid="general-chat" data-context={context} data-session={initialSessionId}>
      <button onClick={() => onSessionChange('session-123')} data-testid="set-session">Set Session</button>
    </div>
  ),
}));

vi.mock('../RisingBubbles', () => ({
  RisingBubbles: () => null,
}));

vi.mock('../SkeletonLoader', () => ({
  SkeletonLoader: () => <div data-testid="skeleton-loader">Loading...</div>,
}));

vi.mock('../ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../utils/storage', () => ({
  safeLocalStorage: vi.fn(() => null),
}));

import { ChatPage } from '../ChatPage';

const defaultProps = {
  context: 'personal' as const,
  onContextChange: vi.fn(),
};

describe('ChatPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<ChatPage {...defaultProps} />);
    expect(container.querySelector('.chat-page')).toBeInTheDocument();
  });

  it('shows session sidebar', () => {
    render(<ChatPage {...defaultProps} />);
    expect(screen.getByTestId('chat-session-sidebar')).toBeInTheDocument();
  });

  it('shows context bar with current context', () => {
    render(<ChatPage {...defaultProps} />);
    const contextBar = screen.getByTestId('chat-context-bar');
    expect(contextBar).toBeInTheDocument();
    expect(contextBar).toHaveAttribute('data-context', 'personal');
  });

  it('shows quick actions section', () => {
    render(<ChatPage {...defaultProps} />);
    expect(screen.getByTestId('chat-quick-actions')).toBeInTheDocument();
  });

  it('shows GeneralChat area', () => {
    render(<ChatPage {...defaultProps} />);
    expect(screen.getByTestId('general-chat')).toBeInTheDocument();
  });

  it('calls onContextChange when switching context', () => {
    render(<ChatPage {...defaultProps} />);
    fireEvent.click(screen.getByTestId('switch-to-work'));
    expect(defaultProps.onContextChange).toHaveBeenCalledWith('work');
  });

  it('handles new chat button correctly', () => {
    render(<ChatPage {...defaultProps} />);
    // First set a session via GeneralChat callback
    fireEvent.click(screen.getByTestId('set-session'));
    expect(screen.getByTestId('general-chat')).toHaveAttribute('data-session', 'session-123');
    // Now click new chat to reset
    fireEvent.click(screen.getByTestId('new-chat-btn'));
    // GeneralChat should have null session (attribute not present)
    expect(screen.getByTestId('general-chat')).not.toHaveAttribute('data-session', 'session-123');
  });

  it('toggles sidebar collapsed state', () => {
    render(<ChatPage {...defaultProps} />);
    const sidebar = screen.getByTestId('chat-session-sidebar');
    expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    fireEvent.click(screen.getByTestId('toggle-sidebar'));
    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  });

  it('updates session when GeneralChat reports session change', () => {
    render(<ChatPage {...defaultProps} />);
    fireEvent.click(screen.getByTestId('set-session'));
    // Session sidebar should reflect the active session (via ChatSessionSidebar props)
    // We verify the GeneralChat has the session propagated through state
    expect(screen.getByTestId('general-chat')).toHaveAttribute('data-session', 'session-123');
  });

  it('dispatches custom event for quick actions', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<ChatPage {...defaultProps} />);
    fireEvent.click(screen.getByTestId('quick-action-btn'));
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'zenai-chat-quick-action',
        detail: { prompt: 'Test prompt' },
      })
    );
    dispatchSpy.mockRestore();
  });
});
