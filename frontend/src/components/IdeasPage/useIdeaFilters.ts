import { useState, useCallback, useMemo } from 'react';
import type { IdeaFilters, IdeaSort, IdeaStatus, FilterChipDef } from './types';
import { DEFAULT_FILTERS, DEFAULT_SORT } from './types';

const TAB_TO_STATUS: Record<string, IdeaStatus> = {
  incubator: 'incubating',
  archive: 'archived',
  triage: 'triage',
};

const STATUS_CHIPS: FilterChipDef[] = [
  { id: 'status-active', label: 'Aktiv', group: 'status', value: 'active' },
  { id: 'status-incubating', label: 'Inkubator', group: 'status', value: 'incubating' },
  { id: 'status-archived', label: 'Archiv', group: 'status', value: 'archived' },
  { id: 'status-triage', label: 'Sortieren', group: 'status', value: 'triage' },
];

const TYPE_CHIPS: FilterChipDef[] = [
  { id: 'type-idea', label: 'Idee', group: 'type', value: 'idea' },
  { id: 'type-task', label: 'Aufgabe', group: 'type', value: 'task' },
  { id: 'type-insight', label: 'Erkenntnis', group: 'type', value: 'insight' },
  { id: 'type-problem', label: 'Problem', group: 'type', value: 'problem' },
  { id: 'type-question', label: 'Frage', group: 'type', value: 'question' },
];

const CATEGORY_CHIPS: FilterChipDef[] = [
  { id: 'cat-business', label: 'Business', group: 'category', value: 'business' },
  { id: 'cat-technical', label: 'Technisch', group: 'category', value: 'technical' },
  { id: 'cat-personal', label: 'Persoenlich', group: 'category', value: 'personal' },
  { id: 'cat-learning', label: 'Lernen', group: 'category', value: 'learning' },
];

const PRIORITY_CHIPS: FilterChipDef[] = [
  { id: 'pri-high', label: 'Hoch', group: 'priority', value: 'high' },
  { id: 'pri-medium', label: 'Mittel', group: 'priority', value: 'medium' },
  { id: 'pri-low', label: 'Niedrig', group: 'priority', value: 'low' },
];

type FilterGroup = 'status' | 'type' | 'category' | 'priority';

function getSetForGroup(filters: IdeaFilters, group: FilterGroup): Set<string> {
  switch (group) {
    case 'status': return filters.status as Set<string>;
    case 'type': return filters.types;
    case 'category': return filters.categories;
    case 'priority': return filters.priorities;
  }
}

export function useIdeaFilters(initialTab?: string) {
  const initialStatus = initialTab && TAB_TO_STATUS[initialTab]
    ? new Set<IdeaStatus>([TAB_TO_STATUS[initialTab]])
    : new Set<IdeaStatus>(DEFAULT_FILTERS.status);

  const [filters, setFilters] = useState<IdeaFilters>({
    ...DEFAULT_FILTERS,
    status: initialStatus,
  });
  const [sort, setSort] = useState<IdeaSort>(DEFAULT_SORT);

  const toggleFilter = useCallback((group: FilterGroup, value: string) => {
    setFilters(prev => {
      const set = new Set(getSetForGroup(prev, group));
      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      switch (group) {
        case 'status': return { ...prev, status: set as Set<IdeaStatus> };
        case 'type': return { ...prev, types: set };
        case 'category': return { ...prev, categories: set };
        case 'priority': return { ...prev, priorities: set };
      }
    });
  }, []);

  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({ ...prev, search }));
  }, []);

  const toggleFavorites = useCallback(() => {
    setFilters(prev => ({ ...prev, favoritesOnly: !prev.favoritesOnly }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters({
      ...DEFAULT_FILTERS,
      status: new Set(DEFAULT_FILTERS.status),
      types: new Set(),
      categories: new Set(),
      priorities: new Set(),
    });
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    filters.status.forEach(s => {
      if (!DEFAULT_FILTERS.status.has(s)) count++;
    });
    count += filters.types.size;
    count += filters.categories.size;
    count += filters.priorities.size;
    if (filters.favoritesOnly) count++;
    return count;
  }, [filters]);

  const chipDefs = useMemo<FilterChipDef[]>(() => [
    ...STATUS_CHIPS,
    ...TYPE_CHIPS,
    ...CATEGORY_CHIPS,
    ...PRIORITY_CHIPS,
  ], []);

  return {
    filters,
    sort,
    setSort,
    toggleFilter,
    setSearch,
    toggleFavorites,
    clearAll,
    activeFilterCount,
    chipDefs,
  };
}
