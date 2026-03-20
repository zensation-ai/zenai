import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeRangeChips } from '../TimeRangeChips';
import { TIME_RANGES } from '../types';

describe('CockpitPage/TimeRangeChips', () => {
  const defaultProps = {
    value: '30d' as const,
    onChange: vi.fn(),
  };

  it('renders all 4 time range chips', () => {
    render(<TimeRangeChips {...defaultProps} />);
    TIME_RANGES.forEach(range => {
      expect(screen.getByRole('radio', { name: range.label })).toBeInTheDocument();
    });
  });

  it('marks active range with aria-checked', () => {
    render(<TimeRangeChips {...defaultProps} value="90d" />);
    expect(screen.getByRole('radio', { name: '90 Tage' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '30 Tage' })).toHaveAttribute('aria-checked', 'false');
  });

  it('applies active CSS class to selected range', () => {
    render(<TimeRangeChips {...defaultProps} value="7d" />);
    expect(screen.getByRole('radio', { name: '7 Tage' })).toHaveClass('cockpit-time-chips__chip--active');
  });

  it('calls onChange when a different range is clicked', () => {
    const onChange = vi.fn();
    render(<TimeRangeChips {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: '1 Jahr' }));
    expect(onChange).toHaveBeenCalledWith('1y');
  });

  it('has role="radiogroup" on container', () => {
    render(<TimeRangeChips {...defaultProps} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('has aria-label on radiogroup', () => {
    render(<TimeRangeChips {...defaultProps} />);
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-label', 'Zeitraum wählen');
  });
});
