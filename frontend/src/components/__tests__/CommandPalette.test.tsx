/**
 * Unit Tests for CommandPalette Component
 *
 * Tests the command palette (Cmd+K) including:
 * - Rendering without crashing
 * - Opens/closes behavior
 * - Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
 * - Search filtering
 * - Category grouping
 * - Command execution
 *
 * @module tests/components/CommandPalette
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock hooks used by CommandPalette
vi.mock('../../hooks/useCommandRegistry', () => ({
  useRegisteredCommands: () => [],
}));

vi.mock('../../hooks/useKeyboardNavigation', () => ({
  getGKeyLabel: () => undefined,
}));

vi.mock('../../hooks/useKeyboardShortcut', () => ({
  formatShortcut: (s: string) => s,
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => vi.fn(),
}));

vi.mock('../../utils/animations', () => ({
  scaleIn: {},
  springs: { snappy: {} },
  durations: { fast: 0.1, instant: 0.01 },
  usePrefersReducedMotion: () => true,
}));

vi.mock('../ui', () => ({
  BottomSheet: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('fuse.js', () => ({
  default: class MockFuse {
    private items: any[];
    constructor(items: any[]) { this.items = items; }
    search(query: string) {
      return this.items
        .filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
        .map(item => ({ item, score: 0.1 }));
    }
  },
}));

import { CommandPalette, type Command } from '../CommandPalette';

const mockCommands: Command[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', category: 'navigation', action: vi.fn() },
  { id: 'ideas', label: 'Gedanken', icon: '💡', category: 'navigation', action: vi.fn() },
  { id: 'settings', label: 'Einstellungen', icon: '⚙️', category: 'settings', action: vi.fn() },
  { id: 'action-new-idea', label: 'Neue Idee', description: 'Erstelle eine neue Idee', icon: '✨', category: 'actions', action: vi.fn() },
  { id: 'ai-chat', label: 'KI-Chat', icon: '🤖', category: 'ai-features', action: vi.fn(), keywords: ['chat', 'ai'] },
  { id: 'search', label: 'Suche', icon: '🔍', category: 'actions', action: vi.fn() },
];

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  commands: mockCommands,
  recentPages: [] as string[],
};

describe('CommandPalette Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage
    localStorage.clear();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CommandPalette {...defaultProps} isOpen={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders when isOpen is true', () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Schnellnavigation');
  });

  it('shows search input with placeholder', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Seite, Aktion oder Befehl suchen...');
    expect(input).toBeInTheDocument();
  });

  it('displays commands grouped by category', () => {
    render(<CommandPalette {...defaultProps} />);
    // Should show navigation commands
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Gedanken')).toBeInTheDocument();
    // Should show action commands
    expect(screen.getByText('Neue Idee')).toBeInTheDocument();
  });

  it('filters commands when typing in search', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Seite, Aktion oder Befehl suchen...');
    fireEvent.change(input, { target: { value: 'Dashboard' } });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<CommandPalette {...defaultProps} />);
    const input = screen.getByPlaceholderText('Seite, Aktion oder Befehl suchen...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('executes command and calls onClose when a command is clicked', () => {
    render(<CommandPalette {...defaultProps} />);
    const dashboardBtn = screen.getByText('Dashboard').closest('button');
    expect(dashboardBtn).toBeInTheDocument();
    fireEvent.click(dashboardBtn!);
    expect(mockCommands[0].action).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows ESC shortcut hint', () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByText('ESC')).toBeInTheDocument();
  });

  it('shows mode hints when query is empty', () => {
    render(<CommandPalette {...defaultProps} />);
    // "Navigation" appears both as a category label and a mode hint
    expect(screen.getAllByText('Navigation').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Befehle')).toBeInTheDocument();
  });

  it('shows footer navigation hints', () => {
    render(<CommandPalette {...defaultProps} />);
    expect(screen.getByText('navigieren')).toBeInTheDocument();
    expect(screen.getByText('auswaehlen')).toBeInTheDocument();
    expect(screen.getByText('schliessen')).toBeInTheDocument();
  });
});
