/**
 * MarketplaceTab tests
 *
 * Sprint 1.11 — covers URL state sync (search/category/sort) and basic rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import axios from 'axios';
import { MarketplaceTab } from '../MarketplaceTab';

vi.mock('axios');
vi.mock('../../../utils/errors', () => ({ logError: vi.fn() }));

const mockedAxios = vi.mocked(axios, true);

function LocationSpy({ onChange }: { onChange: (search: string) => void }) {
  const loc = useLocation();
  onChange(loc.search);
  return null;
}

function setupEmpty() {
  mockedAxios.get = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith('/featured')) {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
}

describe('MarketplaceTab URL state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmpty();
  });

  it('reads category from URL on mount', async () => {
    render(
      <MemoryRouter initialEntries={['/agents?category=research']}>
        <MarketplaceTab />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('research');
    });
  });

  it('reads sort from URL on mount', async () => {
    render(
      <MemoryRouter initialEntries={['/agents?sort=rating']}>
        <MarketplaceTab />
      </MemoryRouter>,
    );
    await waitFor(() => {
      // The "Bewertung" button should be highlighted (has text-white class)
      const btn = screen.getByRole('button', { name: 'Bewertung' });
      expect(btn.className).toMatch(/text-white/);
    });
  });

  it('reads search query from URL on mount', async () => {
    render(
      <MemoryRouter initialEntries={['/agents?q=email']}>
        <MarketplaceTab />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/Agents suchen/) as HTMLInputElement;
      expect(input.value).toBe('email');
    });
  });

  it('falls back to defaults when URL params are invalid', async () => {
    render(
      <MemoryRouter initialEntries={['/agents?sort=hacks&category=bogus']}>
        <MarketplaceTab />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('');
      const btn = screen.getByRole('button', { name: 'Beliebt' });
      expect(btn.className).toMatch(/text-white/);
    });
  });

  it('writes search into URL as ?q=', async () => {
    let current = '';
    render(
      <MemoryRouter initialEntries={['/agents']}>
        <LocationSpy onChange={s => { current = s; }} />
        <MarketplaceTab />
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText(/Agents suchen/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'calendar' } });
    await waitFor(() => expect(current).toContain('q=calendar'));
  });

  it('writes category into URL', async () => {
    let current = '';
    render(
      <MemoryRouter initialEntries={['/agents']}>
        <LocationSpy onChange={s => { current = s; }} />
        <MarketplaceTab />
      </MemoryRouter>,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'finance' } });
    await waitFor(() => expect(current).toContain('category=finance'));
  });

  it('clears category from URL when set to empty', async () => {
    let current = '';
    render(
      <MemoryRouter initialEntries={['/agents?category=finance']}>
        <LocationSpy onChange={s => { current = s; }} />
        <MarketplaceTab />
      </MemoryRouter>,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(current).not.toContain('category='));
  });

  it('does not persist the default sort "popular" in URL', async () => {
    let current = '';
    render(
      <MemoryRouter initialEntries={['/agents']}>
        <LocationSpy onChange={s => { current = s; }} />
        <MarketplaceTab />
      </MemoryRouter>,
    );
    await waitFor(() => expect(current).not.toContain('sort=popular'));
  });

  it('renders empty state when no blueprints returned', async () => {
    render(
      <MemoryRouter>
        <MarketplaceTab />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Keine Community Agents gefunden/)).toBeInTheDocument(),
    );
  });
});
