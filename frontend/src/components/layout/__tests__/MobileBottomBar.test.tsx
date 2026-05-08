import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileBottomBar } from '../MobileBottomBar';

const defaultProps = {
  currentPage: 'hub' as const,
  onNavigate: vi.fn(),
  onOpenMore: vi.fn(),
};

describe('MobileBottomBar (Chunk 4)', () => {
  it('renders exactly 5 tabs', () => {
    render(<MobileBottomBar {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
  });

  it('renders correct tab labels: Home, Gedanken, Chat, Entdecken, Mehr', () => {
    render(<MobileBottomBar {...defaultProps} />);
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Gedanken')).toBeDefined();
    expect(screen.getByText('Chat')).toBeDefined();
    expect(screen.getByText('Entdecken')).toBeDefined();
    expect(screen.getByText('Mehr')).toBeDefined();
  });

  it('does NOT render old tab labels', () => {
    render(<MobileBottomBar {...defaultProps} />);
    expect(screen.queryByText('Ideen')).toBeNull();
    expect(screen.queryByText('Planer')).toBeNull();
    expect(screen.queryByText('Inbox')).toBeNull();
    expect(screen.queryByText('Suche')).toBeNull();
  });

  it('Home tab navigates to hub', async () => {
    const onNavigate = vi.fn();
    render(<MobileBottomBar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Home'));
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });

  it('Gedanken tab navigates to ideas', async () => {
    const onNavigate = vi.fn();
    render(<MobileBottomBar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Gedanken'));
    expect(onNavigate).toHaveBeenCalledWith('ideas');
  });

  it('Entdecken tab navigates to documents', async () => {
    const onNavigate = vi.fn();
    render(<MobileBottomBar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Entdecken'));
    expect(onNavigate).toHaveBeenCalledWith('documents');
  });

  it('Mehr tab calls onOpenMore', async () => {
    const onOpenMore = vi.fn();
    render(<MobileBottomBar {...defaultProps} onOpenMore={onOpenMore} />);
    await userEvent.click(screen.getByText('Mehr'));
    expect(onOpenMore).toHaveBeenCalled();
  });

  it('highlights active tab for ideas pages', () => {
    render(<MobileBottomBar {...defaultProps} currentPage="ideas" />);
    const activeTab = screen.getByRole('tab', { selected: true });
    expect(activeTab).toBeDefined();
    expect(activeTab.textContent).toContain('Gedanken');
  });

  it('highlights Home tab for hub, home, and chat pages', () => {
    for (const page of ['hub', 'home', 'chat'] as const) {
      const { unmount } = render(<MobileBottomBar {...defaultProps} currentPage={page} />);
      const activeTab = screen.getByRole('tab', { selected: true });
      expect(activeTab.textContent).toContain('Home');
      unmount();
    }
  });

  it('applies press animation class', () => {
    render(<MobileBottomBar {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0].className).toContain('active:scale-[0.92]');
  });
});
