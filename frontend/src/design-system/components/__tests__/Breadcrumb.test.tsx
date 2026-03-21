import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumb } from '../Breadcrumb';

const items = [
  { label: 'Home', href: '/' },
  { label: 'Settings', href: '/settings' },
  { label: 'Profile' },
];

describe('Breadcrumb', () => {
  it('renders all items', () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Profile')).toBeDefined();
  });

  it('has aria-label="Breadcrumb" on nav', () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeDefined();
  });

  it('sets aria-current="page" on the last item', () => {
    render(<Breadcrumb items={items} />);
    const lastItem = screen.getByText('Profile');
    expect(lastItem.getAttribute('aria-current')).toBe('page');
  });

  it('renders links for items with href', () => {
    render(<Breadcrumb items={items} />);
    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink.getAttribute('href')).toBe('/');
  });

  it('collapses middle items with ellipsis when maxItems exceeded', () => {
    render(<Breadcrumb items={items} maxItems={2} />);
    // Should show first (Home), ellipsis, last (Profile) — not Settings
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Profile')).toBeDefined();
    expect(screen.queryByText('Settings')).toBeNull();
    // Ellipsis present
    expect(screen.getByText('…')).toBeDefined();
  });

  it('does not collapse when items <= maxItems', () => {
    render(<Breadcrumb items={items} maxItems={3} />);
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Profile')).toBeDefined();
    expect(screen.queryByText('…')).toBeNull();
  });

  it('uses custom separator', () => {
    render(<Breadcrumb items={items} separator=">" />);
    const seps = screen.getAllByText('>');
    expect(seps.length).toBe(2); // 3 items = 2 separators
  });

  it('calls onClick handler for button items', () => {
    const onClick = vi.fn();
    const btnItems = [
      { label: 'Home', onClick },
      { label: 'Current' },
    ];
    render(<Breadcrumb items={btnItems} />);
    fireEvent.click(screen.getByText('Home'));
    expect(onClick).toHaveBeenCalled();
  });
});
