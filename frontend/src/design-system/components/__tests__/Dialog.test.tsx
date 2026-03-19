import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from '../Dialog';

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(<Dialog open={false} onClose={() => {}}>Content</Dialog>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('renders with role="dialog" when open', () => {
    render(<Dialog open={true} onClose={() => {}}>Content</Dialog>);
    expect(screen.getByRole('dialog')).toBeDefined();
  });
  it('renders title when provided', () => {
    render(<Dialog open={true} onClose={() => {}} title="Confirm">Body</Dialog>);
    expect(screen.getByText('Confirm')).toBeDefined();
  });
  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<Dialog open={true} onClose={onClose}>Body</Dialog>);
    const backdrop = container.querySelector('.ds-dialog__backdrop');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<Dialog open={true} onClose={onClose}>Body</Dialog>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('supports sm/md/lg sizes', () => {
    const { container } = render(<Dialog open={true} onClose={() => {}} size="lg">Body</Dialog>);
    expect(container.querySelector('.ds-dialog__panel--lg')).not.toBeNull();
  });
});
