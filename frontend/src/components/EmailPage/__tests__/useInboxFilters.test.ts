import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useInboxFilters } from '../useInboxFilters';
import { INBOX_FOLDER_CHIPS, INBOX_STATUS_CHIPS, INBOX_CATEGORY_CHIPS } from '../types';

describe('useInboxFilters', () => {
  it('initial state has empty filters and default sort', () => {
    const { result } = renderHook(() => useInboxFilters());
    expect(result.current.filters.folders.size).toBe(0);
    expect(result.current.filters.statuses.size).toBe(0);
    expect(result.current.filters.categories.size).toBe(0);
    expect(result.current.filters.search).toBe('');
    expect(result.current.filters.accountId).toBeNull();
    expect(result.current.sort.key).toBe('date');
    expect(result.current.sort.direction).toBe('desc');
  });

  it('toggleFilter adds a folder chip, toggleFilter again removes it', () => {
    const { result } = renderHook(() => useInboxFilters());
    const folderChip = INBOX_FOLDER_CHIPS[0]; // inbox

    act(() => {
      result.current.toggleFilter(folderChip);
    });
    expect(result.current.filters.folders.has('inbox')).toBe(true);
    expect(result.current.filters.folders.size).toBe(1);

    act(() => {
      result.current.toggleFilter(folderChip);
    });
    expect(result.current.filters.folders.has('inbox')).toBe(false);
    expect(result.current.filters.folders.size).toBe(0);
  });

  it('toggleFilter on status chip works', () => {
    const { result } = renderHook(() => useInboxFilters());
    const statusChip = INBOX_STATUS_CHIPS[0]; // unread

    act(() => {
      result.current.toggleFilter(statusChip);
    });
    expect(result.current.filters.statuses.has('unread')).toBe(true);

    act(() => {
      result.current.toggleFilter(statusChip);
    });
    expect(result.current.filters.statuses.has('unread')).toBe(false);
  });

  it('toggleFilter on category chip works', () => {
    const { result } = renderHook(() => useInboxFilters());
    const categoryChip = INBOX_CATEGORY_CHIPS[0]; // business

    act(() => {
      result.current.toggleFilter(categoryChip);
    });
    expect(result.current.filters.categories.has('business')).toBe(true);

    act(() => {
      result.current.toggleFilter(categoryChip);
    });
    expect(result.current.filters.categories.has('business')).toBe(false);
  });

  it('setSearch updates search string', () => {
    const { result } = renderHook(() => useInboxFilters());

    act(() => {
      result.current.setSearch('test query');
    });
    expect(result.current.filters.search).toBe('test query');

    act(() => {
      result.current.setSearch('');
    });
    expect(result.current.filters.search).toBe('');
  });

  it('clearAll resets all filters', () => {
    const { result } = renderHook(() => useInboxFilters());

    act(() => {
      result.current.toggleFilter(INBOX_FOLDER_CHIPS[0]);
      result.current.toggleFilter(INBOX_STATUS_CHIPS[0]);
      result.current.toggleFilter(INBOX_CATEGORY_CHIPS[0]);
      result.current.setSearch('hello');
    });
    expect(result.current.activeFilterCount).toBeGreaterThan(0);

    act(() => {
      result.current.clearAll();
    });
    expect(result.current.filters.folders.size).toBe(0);
    expect(result.current.filters.statuses.size).toBe(0);
    expect(result.current.filters.categories.size).toBe(0);
    expect(result.current.filters.search).toBe('');
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('activeFilterCount reflects active filter count', () => {
    const { result } = renderHook(() => useInboxFilters());
    expect(result.current.activeFilterCount).toBe(0);

    act(() => {
      result.current.toggleFilter(INBOX_FOLDER_CHIPS[0]); // +1
    });
    expect(result.current.activeFilterCount).toBe(1);

    act(() => {
      result.current.toggleFilter(INBOX_STATUS_CHIPS[0]); // +1
      result.current.toggleFilter(INBOX_CATEGORY_CHIPS[0]); // +1
    });
    expect(result.current.activeFilterCount).toBe(3);

    act(() => {
      result.current.setSearch('test'); // +1
    });
    expect(result.current.activeFilterCount).toBe(4);
  });

  it('chipDefs combines all chip arrays (5+2+4 = 11)', () => {
    const { result } = renderHook(() => useInboxFilters());
    expect(result.current.chipDefs).toHaveLength(11);
    // folder chips first
    expect(result.current.chipDefs[0].group).toBe('folder');
    // then status chips
    expect(result.current.chipDefs[5].group).toBe('status');
    // then category chips
    expect(result.current.chipDefs[7].group).toBe('category');
  });
});
