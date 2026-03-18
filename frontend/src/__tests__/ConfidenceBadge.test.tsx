/**
 * ConfidenceBadge Tests
 *
 * Verifies the confidence indicator renders correctly
 * for high/medium/low levels with proper ARIA labels.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfidenceBadge } from '../components/GeneralChat/ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it('renders high confidence (green) for values > 0.75', () => {
    render(<ConfidenceBadge confidence={0.92} />);
    const badge = screen.getByRole('status');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('aria-label')).toContain('Hohe Sicherheit');
    expect(badge.getAttribute('aria-label')).toContain('92%');

    const dot = badge.querySelector('.confidence-dot');
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).style.backgroundColor).toBe('rgb(34, 197, 94)'); // #22c55e
  });

  it('renders medium confidence (amber) for values 0.45-0.75', () => {
    render(<ConfidenceBadge confidence={0.6} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('aria-label')).toContain('Mittlere Sicherheit');
    expect(badge.getAttribute('aria-label')).toContain('60%');

    const dot = badge.querySelector('.confidence-dot');
    expect((dot as HTMLElement).style.backgroundColor).toBe('rgb(245, 158, 11)'); // #f59e0b
  });

  it('renders low confidence (red) for values < 0.45', () => {
    render(<ConfidenceBadge confidence={0.2} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('aria-label')).toContain('Geringe Sicherheit');
    expect(badge.getAttribute('aria-label')).toContain('20%');

    const dot = badge.querySelector('.confidence-dot');
    expect((dot as HTMLElement).style.backgroundColor).toBe('rgb(239, 68, 68)'); // #ef4444
  });

  it('shows tooltip on hover', () => {
    render(<ConfidenceBadge confidence={0.85} />);
    const badge = screen.getByRole('status');

    // Tooltip should not be visible initially
    expect(screen.queryByRole('tooltip')).toBeNull();

    // Show tooltip on mouseenter
    fireEvent.mouseEnter(badge);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeDefined();
    expect(tooltip.textContent).toContain('Hohe Sicherheit');
    expect(tooltip.textContent).toContain('85%');

    // Hide tooltip on mouseleave
    fireEvent.mouseLeave(badge);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows tooltip on focus for keyboard accessibility', () => {
    render(<ConfidenceBadge confidence={0.5} />);
    const badge = screen.getByRole('status');

    fireEvent.focus(badge);
    expect(screen.getByRole('tooltip')).toBeDefined();

    fireEvent.blur(badge);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('handles boundary value 0.75 as medium', () => {
    render(<ConfidenceBadge confidence={0.75} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('aria-label')).toContain('Mittlere Sicherheit');
  });

  it('handles boundary value 0.45 as medium', () => {
    render(<ConfidenceBadge confidence={0.45} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('aria-label')).toContain('Mittlere Sicherheit');
  });

  it('handles value 0 as low', () => {
    render(<ConfidenceBadge confidence={0} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('aria-label')).toContain('Geringe Sicherheit');
    expect(badge.getAttribute('aria-label')).toContain('0%');
  });

  it('handles value 1.0 as high', () => {
    render(<ConfidenceBadge confidence={1.0} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('aria-label')).toContain('Hohe Sicherheit');
    expect(badge.getAttribute('aria-label')).toContain('100%');
  });

  it('rounds percentage display', () => {
    render(<ConfidenceBadge confidence={0.678} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('aria-label')).toContain('68%');
  });

  it('is focusable for keyboard users', () => {
    render(<ConfidenceBadge confidence={0.9} />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('tabindex')).toBe('0');
  });
});
