import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useIdeaFilters } from '../useIdeaFilters';


const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

describe('useIdeaFilters', () => {
  it('initializes with default filters (active status)', () => {
    const { result } = renderHook(() => useIdeaFilters());
    expect(result.current.filters.status.has('active')).toBe(true);
    expect(result.current.filters.types.size).toBe(0);
    expect(result.current.filters.search).toBe('');
  });

  it('toggles a status filter chip', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => { result.current.toggleFilter('status', 'archived'); });
    expect(result.current.filters.status.has('archived')).toBe(true);
    expect(result.current.filters.status.has('active')).toBe(true);
  });

  it('toggles off an active filter', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => { result.current.toggleFilter('status', 'active'); });
    expect(result.current.filters.status.has('active')).toBe(false);
  });

  it('toggles type filter', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => { result.current.toggleFilter('type', 'task'); });
    expect(result.current.filters.types.has('task')).toBe(true);
    act(() => { result.current.toggleFilter('type', 'task'); });
    expect(result.current.filters.types.has('task')).toBe(false);
  });

  it('sets search query', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => { result.current.setSearch('hello'); });
    expect(result.current.filters.search).toBe('hello');
  });

  it('clears all filters to defaults', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => {
      result.current.toggleFilter('status', 'archived');
      result.current.toggleFilter('type', 'task');
      result.current.setSearch('test');
    });
    act(() => { result.current.clearAll(); });
    expect(result.current.filters.status.has('active')).toBe(true);
    expect(result.current.filters.status.size).toBe(1);
    expect(result.current.filters.types.size).toBe(0);
    expect(result.current.filters.search).toBe('');
  });

  it('toggles favorites only', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => { result.current.toggleFavorites(); });
    expect(result.current.filters.favoritesOnly).toBe(true);
    act(() => { result.current.toggleFavorites(); });
    expect(result.current.filters.favoritesOnly).toBe(false);
  });

  it('computes active filter count', () => {
    const { result } = renderHook(() => useIdeaFilters());
    expect(result.current.activeFilterCount).toBe(0);
    act(() => {
      result.current.toggleFilter('type', 'task');
      result.current.toggleFilter('status', 'archived');
    });
    expect(result.current.activeFilterCount).toBe(2);
  });

  it('computes chipDefs from current state', () => {
    const { result } = renderHook(() => useIdeaFilters());
    const chips = result.current.chipDefs;
    const statusChips = chips.filter(c => c.group === 'status');
    expect(statusChips).toHaveLength(4);
    expect(statusChips.find(c => c.value === 'active')).toBeDefined();
  });

  it('handles initialTab=incubator by setting status filter', () => {
    const { result } = renderHook(() => useIdeaFilters('incubator'));
    expect(result.current.filters.status.has('incubating')).toBe(true);
    expect(result.current.filters.status.has('active')).toBe(false);
  });

  it('handles initialTab=archive by setting status filter', () => {
    const { result } = renderHook(() => useIdeaFilters('archive'));
    expect(result.current.filters.status.has('archived')).toBe(true);
  });

  it('handles initialTab=triage by setting status filter', () => {
    const { result } = renderHook(() => useIdeaFilters('triage'));
    expect(result.current.filters.status.has('triage')).toBe(true);
  });

  it('sets sort field and direction', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => { result.current.setSort({ field: 'priority', direction: 'asc' }); });
    expect(result.current.sort.field).toBe('priority');
    expect(result.current.sort.direction).toBe('asc');
  });
});
