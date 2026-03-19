import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Chip } from '../Chip';

describe('Chip', () => {
  it('renders label text', () => {
    render(<Chip label="TypeScript" />);
    expect(screen.getByText('TypeScript')).toBeDefined();
  });
  it('supports color variants', () => {
    const { container } = render(<Chip label="Active" color="success" />);
    expect(container.querySelector('.ds-chip--success')).not.toBeNull();
  });
  it('renders dismiss button when onDismiss provided', () => {
    const onDismiss = vi.fn();
    render(<Chip label="Remove me" onDismiss={onDismiss} />);
    const btn = screen.getByRole('button', { name: /entfernen/i });
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
  it('renders as selected', () => {
    const { container } = render(<Chip label="Filter" selected />);
    expect(container.querySelector('.ds-chip--selected')).not.toBeNull();
  });
});
