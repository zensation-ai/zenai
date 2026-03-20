import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ViewToggle } from '../ViewToggle';

describe('ViewToggle', () => {
  it('renders 3 view options (Liste, Kacheln, Konversation)', () => {
    render(<ViewToggle value="list" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Liste' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Kacheln' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Konversation' })).toBeInTheDocument();
  });

  it('active mode has aria-checked="true"', () => {
    render(<ViewToggle value="grid" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Kacheln' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Liste' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Konversation' })).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking a different mode calls onChange with that mode', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="list" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Kacheln' }));
    expect(onChange).toHaveBeenCalledWith('grid');
  });

  it('has radiogroup role', () => {
    render(<ViewToggle value="conversation" onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });
});
