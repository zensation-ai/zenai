import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Alert } from '../Alert';

describe('Alert', () => {
  it('renders with role="alert"', () => {
    render(<Alert variant="info">Hinweis</Alert>);
    expect(screen.getByRole('alert')).toBeDefined();
  });
  it('renders children text', () => {
    render(<Alert variant="info">Bitte beachten</Alert>);
    expect(screen.getByText('Bitte beachten')).toBeDefined();
  });
  it('supports all 4 variants', () => {
    const { container, rerender } = render(<Alert variant="info">I</Alert>);
    expect(container.querySelector('.ds-alert--info')).not.toBeNull();
    rerender(<Alert variant="success">S</Alert>);
    expect(container.querySelector('.ds-alert--success')).not.toBeNull();
    rerender(<Alert variant="warning">W</Alert>);
    expect(container.querySelector('.ds-alert--warning')).not.toBeNull();
    rerender(<Alert variant="danger">D</Alert>);
    expect(container.querySelector('.ds-alert--danger')).not.toBeNull();
  });
  it('renders title when provided', () => {
    render(<Alert variant="info" title="Wichtig">Details</Alert>);
    expect(screen.getByText('Wichtig')).toBeDefined();
  });
  it('renders dismiss button when onDismiss provided', () => {
    const onDismiss = vi.fn();
    render(<Alert variant="info" onDismiss={onDismiss}>Info</Alert>);
    const btn = screen.getByRole('button', { name: /schlie/i });
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
