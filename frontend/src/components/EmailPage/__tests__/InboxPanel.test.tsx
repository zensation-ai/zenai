/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InboxPanel } from '../InboxPanel';

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const defaultProps = {
  open: false,
  emailId: null as string | null,
  mode: 'detail' as const,
  onClose: vi.fn(),
  context: 'operations' as const,
};

describe('InboxPanel', () => {
  it('renders without open class when closed', () => {
    const { container } = render(<InboxPanel {...defaultProps} />, { wrapper: createWrapper() });
    const aside = container.querySelector('.inbox-panel');
    expect(aside).toBeTruthy();
    expect(aside?.classList.contains('inbox-panel--open')).toBe(false);
  });

  it('renders with open class when open', () => {
    const { container } = render(<InboxPanel {...defaultProps} open={true} emailId="abc" />, { wrapper: createWrapper() });
    const aside = container.querySelector('.inbox-panel');
    expect(aside?.classList.contains('inbox-panel--open')).toBe(true);
  });

  it('renders backdrop when open', () => {
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" />, { wrapper: createWrapper() });
    expect(screen.getByTestId('inbox-panel-backdrop')).toBeInTheDocument();
  });

  it('does not render backdrop when closed', () => {
    render(<InboxPanel {...defaultProps} />, { wrapper: createWrapper() });
    expect(screen.queryByTestId('inbox-panel-backdrop')).not.toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" onClose={onClose} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByTestId('inbox-panel-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" onClose={onClose} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByLabelText('Schließen'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" onClose={onClose} />, { wrapper: createWrapper() });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('has complementary role and aria-label', () => {
    render(<InboxPanel {...defaultProps} open={true} emailId="abc" />, { wrapper: createWrapper() });
    expect(screen.getByRole('complementary', { name: 'E-Mail-Details' })).toBeInTheDocument();
  });
});
