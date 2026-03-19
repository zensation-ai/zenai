// frontend/src/components/ChatHub/__tests__/SlidePanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlidePanel } from '../SlidePanel';

describe('SlidePanel', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    title: 'Test Panel',
    children: <div>Panel Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when open', () => {
    render(<SlidePanel {...defaultProps} />);
    expect(screen.getByText('Panel Content')).toBeInTheDocument();
  });

  it('renders title in header', () => {
    render(<SlidePanel {...defaultProps} />);
    expect(screen.getByText('Test Panel')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(<SlidePanel {...defaultProps} open={false} />);
    expect(container.querySelector('.slide-panel--open')).toBeNull();
  });

  it('calls onClose when close button is clicked', () => {
    render(<SlidePanel {...defaultProps} />);
    const closeBtn = screen.getByLabelText('Panel schliessen');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<SlidePanel {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when glass backdrop is clicked', () => {
    render(<SlidePanel {...defaultProps} />);
    const backdrop = screen.getByTestId('slide-panel-backdrop');
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('has role=dialog and aria-label', () => {
    render(<SlidePanel {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Test Panel');
  });

  it('traps focus when open (has tabIndex on panel)', () => {
    render(<SlidePanel {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('tabIndex', '-1');
  });
});
