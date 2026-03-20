import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ViewToggle } from '../ViewToggle';

describe('ViewToggle', () => {
  it('renders three view buttons', () => {
    render(<ViewToggle active="grid" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Rasteransicht')).toBeInTheDocument();
    expect(screen.getByLabelText('Listenansicht')).toBeInTheDocument();
    expect(screen.getByLabelText('Graphansicht')).toBeInTheDocument();
  });

  it('marks active view with aria-pressed', () => {
    render(<ViewToggle active="list" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Listenansicht')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Rasteransicht')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with view mode on click', () => {
    const onChange = vi.fn();
    render(<ViewToggle active="grid" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Listenansicht'));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('has role group', () => {
    render(<ViewToggle active="grid" onChange={vi.fn()} />);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });
});
