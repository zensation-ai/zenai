import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('renders with role="status" and accessible label', () => {
    render(<Spinner label="Laden" />);
    const el = screen.getByRole('status');
    expect(el).toBeDefined();
    expect(el.getAttribute('aria-label')).toBe('Laden');
  });
  it('applies ds-spinner base class', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.ds-spinner')).not.toBeNull();
  });
  it('supports sm/md/lg sizes', () => {
    const { container, rerender } = render(<Spinner size="sm" />);
    expect(container.querySelector('.ds-spinner--sm')).not.toBeNull();
    rerender(<Spinner size="lg" />);
    expect(container.querySelector('.ds-spinner--lg')).not.toBeNull();
  });
  it('defaults to md size', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.ds-spinner--md')).not.toBeNull();
  });
});
