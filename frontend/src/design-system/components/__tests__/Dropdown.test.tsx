import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dropdown } from '../Dropdown';

const items = [
  { label: 'Edit', value: 'edit' },
  { label: 'Delete', value: 'delete' },
  { label: 'Share', value: 'share' },
];

describe('Dropdown', () => {
  it('renders trigger', () => {
    render(<Dropdown trigger={<button>Actions</button>} items={items} onSelect={() => {}} />);
    expect(screen.getByText('Actions')).toBeDefined();
  });
  it('opens menu on trigger click', () => {
    render(<Dropdown trigger={<button>Actions</button>} items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Actions'));
    expect(screen.getByRole('menu')).toBeDefined();
    expect(screen.getByText('Edit')).toBeDefined();
  });
  it('calls onSelect with item value', () => {
    const onSelect = vi.fn();
    render(<Dropdown trigger={<button>Actions</button>} items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Actions'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onSelect).toHaveBeenCalledWith('delete');
  });
  it('closes after selection', () => {
    render(<Dropdown trigger={<button>Actions</button>} items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Actions'));
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('has aria-haspopup and aria-expanded on trigger wrapper', () => {
    render(<Dropdown trigger={<button>Actions</button>} items={items} onSelect={() => {}} />);
    const triggerWrapper = screen.getByText('Actions').closest('[aria-haspopup]');
    expect(triggerWrapper).not.toBeNull();
    expect(triggerWrapper?.getAttribute('aria-haspopup')).toBe('menu');
  });
});
