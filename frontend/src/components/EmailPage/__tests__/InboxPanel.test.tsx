/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxPanel } from '../InboxPanel';

// Mock inner components
vi.mock('../EmailDetail', () => ({
  default: ({ emailId }: any) => <div data-testid="email-detail">Detail: {emailId}</div>,
  EmailDetail: ({ emailId }: any) => <div data-testid="email-detail">Detail: {emailId}</div>,
}));

vi.mock('../EmailCompose', () => ({
  default: () => <div data-testid="email-compose">Compose</div>,
  EmailCompose: () => <div data-testid="email-compose">Compose</div>,
}));

const defaultProps = {
  open: false,
  emailId: null as string | null,
  mode: 'detail' as const,
  onClose: vi.fn(),
  context: 'personal' as const,
};

describe('InboxPanel', () => {
  it('renders without open class when closed', () => {
    const { container } = render(<InboxPanel {...defaultProps} />);
    const aside = container.querySelector('.inbox-panel');
    expect(aside).toBeTruthy();
    expect(aside?.classList.contains('inbox-panel--open')).toBe(false);
  });

  it('renders with open class when open', () => {
    const { container } = render(<InboxPanel {...defaultProps} open={true} emailId="abc" />);
    const aside = container.querySelector('.inbox-panel');
    expect(aside?.classList.contains('inbox-panel--open')).toBe(true);
  });

  it('renders backdrop when open', () => {
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" />);
    expect(screen.getByTestId('inbox-panel-backdrop')).toBeInTheDocument();
  });

  it('does not render backdrop when closed', () => {
    render(<InboxPanel {...defaultProps} />);
    expect(screen.queryByTestId('inbox-panel-backdrop')).not.toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('inbox-panel-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Schliessen'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('has complementary role and aria-label', () => {
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" />);
    expect(screen.getByRole('complementary', { name: 'E-Mail-Details' })).toBeInTheDocument();
  });
});
