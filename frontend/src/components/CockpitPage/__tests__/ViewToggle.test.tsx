import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewToggle } from '../ViewToggle';
import { COCKPIT_VIEWS } from '../types';

describe('CockpitPage/ViewToggle', () => {
  const defaultProps = {
    value: 'uebersicht' as const,
    onChange: vi.fn(),
  };

  it('renders all 4 view buttons', () => {
    render(<ViewToggle {...defaultProps} />);
    COCKPIT_VIEWS.forEach(view => {
      expect(screen.getByRole('tab', { name: view.label })).toBeInTheDocument();
    });
  });

  it('marks active view with aria-selected', () => {
    render(<ViewToggle {...defaultProps} value="business" />);
    expect(screen.getByRole('tab', { name: 'Business' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Übersicht' })).toHaveAttribute('aria-selected', 'false');
  });

  it('applies active CSS class to selected view', () => {
    render(<ViewToggle {...defaultProps} value="finanzen" />);
    expect(screen.getByRole('tab', { name: 'Finanzen' })).toHaveClass('cockpit-view-toggle__btn--active');
  });

  it('calls onChange when a different view is clicked', () => {
    const onChange = vi.fn();
    render(<ViewToggle {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Trends' }));
    expect(onChange).toHaveBeenCalledWith('trends');
  });

  it('has role="tablist" on container', () => {
    render(<ViewToggle {...defaultProps} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('has aria-label on tablist', () => {
    render(<ViewToggle {...defaultProps} />);
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Ansicht wechseln');
  });
});
