import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress } from '../Progress';

describe('Progress', () => {
  it('renders progressbar role with value', () => {
    render(<Progress value={45} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('45');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });
  it('clamps value between 0 and 100', () => {
    const { rerender } = render(<Progress value={-10} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    rerender(<Progress value={150} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });
  it('renders indeterminate when value undefined', () => {
    const { container } = render(<Progress />);
    expect(container.querySelector('.ds-progress--indeterminate')).not.toBeNull();
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });
  it('renders label', () => {
    render(<Progress value={75} label="75% done" />);
    expect(screen.getByText('75% done')).toBeDefined();
  });
  it('supports color variants', () => {
    const { container } = render(<Progress value={50} color="success" />);
    expect(container.querySelector('.ds-progress--success')).not.toBeNull();
  });
});
