import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewToggle } from '../ViewToggle';
import type { WissenViewMode } from '../types';

describe('ViewToggle', () => {
  it('renders all 5 view buttons', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="dokumente" onChange={onChange} />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('renders labels for each view', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="dokumente" onChange={onChange} />);
    expect(screen.getByText('Dokumente')).toBeInTheDocument();
    expect(screen.getByText('Canvas')).toBeInTheDocument();
    expect(screen.getByText('Medien')).toBeInTheDocument();
    expect(screen.getByText('Verbindungen')).toBeInTheDocument();
    expect(screen.getByText('Lernen')).toBeInTheDocument();
  });

  it('highlights the active view button', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="canvas" onChange={onChange} />);
    const canvasBtn = screen.getByText('Canvas').closest('button');
    expect(canvasBtn).toHaveClass('wissen-view-toggle__btn--active');
    const dokBtn = screen.getByText('Dokumente').closest('button');
    expect(dokBtn).not.toHaveClass('wissen-view-toggle__btn--active');
  });

  it('calls onChange when a button is clicked', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="dokumente" onChange={onChange} />);
    fireEvent.click(screen.getByText('Medien'));
    expect(onChange).toHaveBeenCalledWith('medien' as WissenViewMode);
  });

  it('sets aria-selected on active button', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="lernen" onChange={onChange} />);
    const lernenBtn = screen.getByText('Lernen').closest('button');
    expect(lernenBtn).toHaveAttribute('aria-selected', 'true');
    const dokBtn = screen.getByText('Dokumente').closest('button');
    expect(dokBtn).toHaveAttribute('aria-selected', 'false');
  });

  it('has role=tablist on container', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="dokumente" onChange={onChange} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
