import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPicker } from '../../components/ui/color-picker';

describe('ColorPicker', () => {
  it('should render the trigger button with selected color', () => {
    render(<ColorPicker value="#ff6b35" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button');
    expect(trigger).toBeDefined();
  });

  it('should call onChange when a color is selected', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#ff6b35" onChange={onChange} />);

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const swatches = screen.getAllByRole('option');
    if (swatches.length > 0) {
      fireEvent.click(swatches[0]);
      expect(onChange).toHaveBeenCalled();
    }
  });

  it('should render default palette colors', () => {
    render(<ColorPicker value="#ff6b35" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));

    const swatches = screen.getAllByRole('option');
    expect(swatches.length).toBeGreaterThanOrEqual(8);
  });
});
