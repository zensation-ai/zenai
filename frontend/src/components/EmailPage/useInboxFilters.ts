/**
 * useInboxFilters - Inbox filter state management hook
 *
 * Manages Set-based filter state for folders, statuses, categories.
 * Follows the same pattern as PlannerPage/usePlannerFilters.
 */
import { useState, useMemo, useCallback } from 'react';
import type { InboxFilters, InboxFilterChipDef, EmailTab, EmailCategory } from './types';
import {
  createDefaultInboxFilters,
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
  const [filters, setFilters] = useState<InboxFilters>(createDefaultInboxFilters);
  const [sort, setSort] = useState<InboxSort>(DEFAULT_SORT);

  const toggleFilter = useCallback((chip: InboxFilterChipDef) => {
    setFilters(prev => {
      const next = { ...prev };
      if (chip.group === 'folder') {
        const s = new Set(prev.folders);
        const v = chip.value as EmailTab;
        if (s.has(v)) s.delete(v); else s.add(v);
        next.folders = s;
      } else if (chip.group === 'status') {
        const s = new Set(prev.statuses);
        const v = chip.value as 'unread' | 'starred';
        if (s.has(v)) s.delete(v); else s.add(v);
        next.statuses = s;
      } else if (chip.group === 'category') {
        const s = new Set(prev.categories);
        const v = chip.value as EmailCategory;
        if (s.has(v)) s.delete(v); else s.add(v);
        next.categories = s;
      }
      return next;
    });
  }, []);

  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({ ...prev, search }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters(createDefaultInboxFilters());
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
