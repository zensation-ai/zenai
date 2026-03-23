import { render, screen, fireEvent } from '@testing-library/react';
import { CockpitBottomBar } from '../CockpitBottomBar';

describe('CockpitBottomBar', () => {
  const defaultProps = {
    currentPage: 'chat' as const,
    onNavigate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderBar = (props = {}) =>
    render(<CockpitBottomBar {...defaultProps} {...props} />);

  it('renders 3 navigation icons', () => {
    renderBar();
    expect(screen.getByLabelText('Chat')).toBeInTheDocument();
    expect(screen.getByLabelText('Dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('highlights active page with indicator dot', () => {
    renderBar({ currentPage: 'chat' });
    const chatBtn = screen.getByLabelText('Chat');
    expect(chatBtn).toHaveClass('cockpit-bottom-bar__item--active');
    expect(chatBtn.querySelector('.cockpit-bottom-bar__indicator')).toBeInTheDocument();

    const dashBtn = screen.getByLabelText('Dashboard');
    expect(dashBtn).not.toHaveClass('cockpit-bottom-bar__item--active');
    expect(dashBtn.querySelector('.cockpit-bottom-bar__indicator')).not.toBeInTheDocument();
  });

  it('calls onNavigate with correct page on click', () => {
    const onNavigate = vi.fn();
    renderBar({ onNavigate });

    fireEvent.click(screen.getByLabelText('Dashboard'));
    expect(onNavigate).toHaveBeenCalledWith('dashboard');

    fireEvent.click(screen.getByLabelText('Einstellungen'));
    expect(onNavigate).toHaveBeenCalledWith('settings');

    fireEvent.click(screen.getByLabelText('Chat'));
    expect(onNavigate).toHaveBeenCalledWith('chat');
  });

  it('has proper accessibility labels', () => {
    renderBar({ currentPage: 'dashboard' });
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    expect(nav).toBeInTheDocument();

    const dashBtn = screen.getByLabelText('Dashboard');
    expect(dashBtn).toHaveAttribute('aria-current', 'page');

    const chatBtn = screen.getByLabelText('Chat');
    expect(chatBtn).not.toHaveAttribute('aria-current');
  });

  it('switches indicator when currentPage changes', () => {
    const { rerender } = renderBar({ currentPage: 'chat' });
    expect(screen.getByLabelText('Chat')).toHaveClass('cockpit-bottom-bar__item--active');

    rerender(<CockpitBottomBar {...defaultProps} currentPage="settings" />);
    expect(screen.getByLabelText('Einstellungen')).toHaveClass('cockpit-bottom-bar__item--active');
    expect(screen.getByLabelText('Chat')).not.toHaveClass('cockpit-bottom-bar__item--active');
  });
});
