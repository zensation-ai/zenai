import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewToggle } from '../ViewToggle';
import { MEINE_KI_VIEWS } from '../types';

describe('MeineKIPage/ViewToggle', () => {
  const defaultProps = {
    value: 'persona' as const,
    onChange: vi.fn(),
  };

  it('renders all 4 view buttons', () => {
    render(<ViewToggle {...defaultProps} />);
    MEINE_KI_VIEWS.forEach(view => {
      expect(screen.getByRole('tab', { name: view.label })).toBeInTheDocument();
    });
  });

  it('marks active view with aria-selected', () => {
    render(<ViewToggle {...defaultProps} value="wissen" />);
    expect(screen.getByRole('tab', { name: 'Wissen' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Persona' })).toHaveAttribute('aria-selected', 'false');
  });

  it('applies active CSS class', () => {
    render(<ViewToggle {...defaultProps} value="prozeduren" />);
    expect(screen.getByRole('tab', { name: 'Prozeduren' })).toHaveClass('meine-ki-view-toggle__btn--active');
  });

  it('calls onChange when clicked', () => {
    const onChange = vi.fn();
    render(<ViewToggle {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stimme' }));
    expect(onChange).toHaveBeenCalledWith('stimme');
  });

  it('has role="tablist"', () => {
    render(<ViewToggle {...defaultProps} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
