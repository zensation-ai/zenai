import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tooltip } from '../Tooltip';

describe('Tooltip', () => {
  it('renders trigger children', () => {
    render(<Tooltip content="Help text"><button>Hover me</button></Tooltip>);
    expect(screen.getByText('Hover me')).toBeDefined();
  });
  it('shows tooltip on mouse enter', () => {
    render(<Tooltip content="Help text"><button>Hover me</button></Tooltip>);
    fireEvent.mouseEnter(screen.getByText('Hover me'));
    expect(screen.getByRole('tooltip')).toBeDefined();
    expect(screen.getByText('Help text')).toBeDefined();
  });
  it('hides tooltip on mouse leave', () => {
    render(<Tooltip content="Help text"><button>Hover me</button></Tooltip>);
    fireEvent.mouseEnter(screen.getByText('Hover me'));
    fireEvent.mouseLeave(screen.getByText('Hover me'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('applies ds-tooltip class', () => {
    render(<Tooltip content="Tip"><button>X</button></Tooltip>);
    fireEvent.mouseEnter(screen.getByText('X'));
    const tip = screen.getByRole('tooltip');
    expect(tip.classList.contains('ds-tooltip')).toBe(true);
  });
});
