/**
 * useInboxFilters - Inbox filter state management hook
 *
 * Manages Set-based filter state for folders, statuses, categories.
 * Follows the same pattern as PlannerPage/usePlannerFilters.
 */
import { useState, useMemo, useCallback } from 'react';
import type { InboxFilters, InboxFilterChipDef } from './types';
import {
  DEFAULT_INBOX_FILTERS,
  INBOX_FOLDER_CHIPS,
  INBOX_STATUS_CHIPS,
  INBOX_CATEGORY_CHIPS,
} from './types';

export type InboxSortKey = 'date' | 'sender' | 'subject' | 'priority';
export type SortDirection = 'asc' | 'desc';

export interface InboxSort {
  key: InboxSortKey;
  direction: SortDirection;
}

const DEFAULT_SORT: InboxSort = { key: 'date', direction: 'desc' };

export function useInboxFilters() {
  const [filters, setFilters] = useState<InboxFilters>({ ...DEFAULT_INBOX_FILTERS });
  const [sort, setSort] = useState<InboxSort>(DEFAULT_SORT);

  const toggleFilter = useCallback((chip: InboxFilterChipDef) => {
    setFilters(prev => {
      const next = { ...prev };
      if (chip.group === 'folder') {
        const s = new Set(prev.folders);
        if (s.has(chip.value as any)) s.delete(chip.value as any);
        else s.add(chip.value as any);
        next.folders = s;
      } else if (chip.group === 'status') {
        const s = new Set(prev.statuses);
        if (s.has(chip.value as any)) s.delete(chip.value as any);
        else s.add(chip.value as any);
        next.statuses = s;
      } else if (chip.group === 'category') {
        const s = new Set(prev.categories);
        if (s.has(chip.value as any)) s.delete(chip.value as any);
        else s.add(chip.value as any);
        next.categories = s;
      }
      return next;
    });
  }, []);

  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({ ...prev, search }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters({ ...DEFAULT_INBOX_FILTERS, folders: new Set(), statuses: new Set(), categories: new Set() });
  }, []);

  const activeFilterCount = useMemo(
    () => filters.folders.size + filters.statuses.size + filters.categories.size + (filters.search ? 1 : 0),
    [filters],
  );

  const chipDefs = useMemo(
    () => [...INBOX_FOLDER_CHIPS, ...INBOX_STATUS_CHIPS, ...INBOX_CATEGORY_CHIPS],
    [],
  );

  return {
    filters,
    sort,
    setSort,
    toggleFilter,
    setSearch,
    clearAll,
    activeFilterCount,
    chipDefs,
  };
}
