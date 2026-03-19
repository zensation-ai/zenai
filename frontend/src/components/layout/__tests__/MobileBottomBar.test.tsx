import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileBottomBar } from '../MobileBottomBar';

const defaultProps = {
  currentPage: 'hub' as const,
  onNavigate: vi.fn(),
  onOpenMore: vi.fn(),
};

describe('MobileBottomBar (Phase 105)', () => {
  it('renders exactly 5 tabs', () => {
    const { container } = render(<MobileBottomBar {...defaultProps} />);
    const tabs = container.querySelectorAll('.bottom-tab');
    expect(tabs).toHaveLength(5);
  });

  it('renders correct tab labels: Chat, Ideen, Planer, Inbox, Mehr', () => {
    render(<MobileBottomBar {...defaultProps} />);
    expect(screen.getByText('Chat')).toBeDefined();
    expect(screen.getByText('Ideen')).toBeDefined();
    expect(screen.getByText('Planer')).toBeDefined();
    expect(screen.getByText('Inbox')).toBeDefined();
    expect(screen.getByText('Mehr')).toBeDefined();
  });

  it('does NOT render Home tab (replaced by Chat)', () => {
    render(<MobileBottomBar {...defaultProps} />);
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('does NOT render E-Mail tab (replaced by Inbox)', () => {
    render(<MobileBottomBar {...defaultProps} />);
    expect(screen.queryByText('E-Mail')).toBeNull();
  });

  it('Chat tab navigates to hub', async () => {
    const onNavigate = vi.fn();
    render(<MobileBottomBar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Chat'));
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });

  it('Ideen tab navigates to ideas', async () => {
    const onNavigate = vi.fn();
    render(<MobileBottomBar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Ideen'));
    expect(onNavigate).toHaveBeenCalledWith('ideas');
  });

  it('Mehr tab opens drawer (calls onOpenMore)', async () => {
    const onOpenMore = vi.fn();
    render(<MobileBottomBar {...defaultProps} onOpenMore={onOpenMore} />);
    await userEvent.click(screen.getByText('Mehr'));
    expect(onOpenMore).toHaveBeenCalled();
  });

  it('highlights active tab', () => {
    const { container } = render(<MobileBottomBar {...defaultProps} currentPage="ideas" />);
    const activeTab = container.querySelector('.bottom-tab.active');
    expect(activeTab).toBeDefined();
    expect(activeTab!.textContent).toContain('Ideen');
  });

  it('highlights Chat tab for hub, home, and chat pages', () => {
    for (const page of ['hub', 'home', 'chat'] as const) {
      const { container } = render(<MobileBottomBar {...defaultProps} currentPage={page} />);
      const activeTab = container.querySelector('.bottom-tab.active');
      expect(activeTab!.textContent).toContain('Chat');
      container.remove();
    }
  });
});
