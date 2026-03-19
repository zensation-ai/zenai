import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';

// Mock auth context
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

// Mock navIcons
vi.mock('../../../utils/navIcons', () => ({
  getPageIcon: () => () => null,
  getIconByName: () => () => null,
  LogOut: () => null,
  Star: () => null,
  ChevronDown: () => null,
}));

const defaultProps = {
  collapsed: false,
  onToggleCollapse: vi.fn(),
  currentPage: 'hub' as const,
  onNavigate: vi.fn(),
  apiStatus: null,
  isAIActive: false,
  archivedCount: 0,
  notificationCount: 0,
};

describe('Sidebar (Phase 105)', () => {
  it('renders 8 nav items (hub + 7 Smart Pages)', () => {
    render(<Sidebar {...defaultProps} />);
    const labels = ['Chat Hub', 'Ideen', 'Planer', 'Inbox', 'Wissen', 'Cockpit', 'Meine KI', 'System'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('does NOT render section headers', () => {
    const { container } = render(<Sidebar {...defaultProps} />);
    // Old section headers should be gone
    expect(container.querySelector('.sidebar-section-header')).toBeNull();
    expect(screen.queryByText('Organisieren')).toBeNull();
    expect(screen.queryByText('Auswerten')).toBeNull();
    expect(screen.queryByText('KI & Lernen')).toBeNull();
  });

  it('does NOT render Browser nav item', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.queryByText('Browser')).toBeNull();
  });

  it('does NOT render old footer items as separate section', () => {
    render(<Sidebar {...defaultProps} />);
    // 'Benachrichtigungen' was a footer item — now absorbed into Inbox
    expect(screen.queryByText('Benachrichtigungen')).toBeNull();
    // 'Einstellungen' label is gone — replaced by 'System'
    expect(screen.queryByText('Einstellungen')).toBeNull();
  });

  it('highlights active item with aria-current="page"', () => {
    render(<Sidebar {...defaultProps} currentPage="ideas" />);
    const navItems = screen.getAllByRole('button');
    const activeItem = navItems.find(el => el.getAttribute('aria-current') === 'page');
    expect(activeItem).toBeDefined();
    expect(activeItem!.textContent).toContain('Ideen');
  });

  it('highlights parent item when sub-page is active', () => {
    render(<Sidebar {...defaultProps} currentPage="contacts" />);
    const navItems = screen.getAllByRole('button');
    const activeItem = navItems.find(el => el.getAttribute('aria-current') === 'page');
    expect(activeItem).toBeDefined();
    expect(activeItem!.textContent).toContain('Planer');
  });

  it('calls onNavigate when a nav item is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Sidebar {...defaultProps} onNavigate={onNavigate} />);
    const ideen = screen.getByText('Ideen');
    await userEvent.click(ideen);
    expect(onNavigate).toHaveBeenCalledWith('ideas');
  });
});
