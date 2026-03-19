import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Popover } from '../Popover';

describe('Popover', () => {
  it('renders trigger', () => {
    render(<Popover trigger={<button>Info</button>} content={<p>Details here</p>} />);
    expect(screen.getByText('Info')).toBeDefined();
  });
  it('shows content on trigger click', () => {
    render(<Popover trigger={<button>Info</button>} content={<p>Details here</p>} />);
    fireEvent.click(screen.getByText('Info'));
    expect(screen.getByText('Details here')).toBeDefined();
  });
  it('hides content on second click', () => {
    render(<Popover trigger={<button>Info</button>} content={<p>Details here</p>} />);
    fireEvent.click(screen.getByText('Info'));
    fireEvent.click(screen.getByText('Info'));
    expect(screen.queryByText('Details here')).toBeNull();
  });
  it('applies ds-popover class', () => {
    const { container } = render(<Popover trigger={<button>Info</button>} content={<p>Content</p>} />);
    fireEvent.click(screen.getByText('Info'));
    expect(container.querySelector('.ds-popover__content')).not.toBeNull();
  });
});
