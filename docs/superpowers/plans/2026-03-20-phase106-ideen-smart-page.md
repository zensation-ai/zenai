# Phase 106: Ideen Smart Page — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current tab-based IdeasPage with a view-switching Smart Page that uses filter chips, three views (Grid/List/Graph), and a slide-out AI panel — establishing the Smart Page pattern reused by Phases 107-110.

**Architecture:** The Smart Page keeps the same React Query data layer and mutations but replaces the UI shell. The 4-tab structure (Ideas/Incubator/Archive/Triage) becomes a single filterable surface with a ViewMode toggle (Grid/List/Graph). Incubator and Triage become accessible via filter chips (`status:incubating`, `status:triage`). Archive is a filter chip (`status:archived`). An AI Panel slides in from the right for idea detail, smart content, and chat — replacing the current modal. All new components live under `frontend/src/components/IdeasPage/` (directory), keeping the old `IdeasPage.tsx` as `IdeasPage-legacy.tsx` for reference during migration.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest + @testing-library/react, TanStack Query v5, TanStack Virtual, CSS custom properties (Calm Neurodesign tokens from Phase 102), DS components from Phase 103, Lucide icons

---

## File Structure

### New Files (Phase 106)

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/components/IdeasPage/types.ts` | Smart Page types: ViewMode, IdeaFilter, FilterChip, IdeaPanelState |
| Create | `frontend/src/components/IdeasPage/useIdeaFilters.ts` | Filter state management hook: chips, toggle, clear, URL sync |
| Create | `frontend/src/components/IdeasPage/FilterChipBar.tsx` | Horizontal scrollable chip bar with DS Chip component |
| Create | `frontend/src/components/IdeasPage/FilterChipBar.css` | Chip bar layout and scroll styles |
| Create | `frontend/src/components/IdeasPage/ViewToggle.tsx` | Grid/List/Graph segmented control |
| Create | `frontend/src/components/IdeasPage/ViewToggle.css` | View toggle styles |
| Create | `frontend/src/components/IdeasPage/IdeaGridView.tsx` | Grid view using TanStack Virtual (replaces VirtualizedIdeaList grid mode) |
| Create | `frontend/src/components/IdeasPage/IdeaListView.tsx` | Compact list view using TanStack Virtual (replaces VirtualizedIdeaList list mode) |
| Create | `frontend/src/components/IdeasPage/IdeaGraphView.tsx` | Placeholder canvas/SVG graph view (Phase 106 = skeleton, full graph in later phase) |
| Create | `frontend/src/components/IdeasPage/IdeaCard2.tsx` | Redesigned idea card using DS Card + Badge + Chip |
| Create | `frontend/src/components/IdeasPage/IdeaCard2.css` | Card styles (grid + list variants via data-view attribute) |
| Create | `frontend/src/components/IdeasPage/IdeaPanel.tsx` | Right slide-out panel for idea detail + smart content + chat |
| Create | `frontend/src/components/IdeasPage/IdeaPanel.css` | Panel styles (400px desktop, full-screen mobile) |
| Create | `frontend/src/components/IdeasPage/IdeasToolbar.tsx` | Top toolbar: search input + view toggle + sort dropdown + batch toggle |
| Create | `frontend/src/components/IdeasPage/IdeasToolbar.css` | Toolbar layout styles |
| Create | `frontend/src/components/IdeasPage/IdeasSmartPage.tsx` | Assembly: FilterChipBar + Toolbar + View + Panel |
| Create | `frontend/src/components/IdeasPage/IdeasSmartPage.css` | Page layout (CSS Grid: chips / toolbar / content / panel) |
| Create | `frontend/src/components/IdeasPage/index.ts` | Barrel export |
| Create | `frontend/src/components/IdeasPage/__tests__/useIdeaFilters.test.ts` | Filter hook tests |
| Create | `frontend/src/components/IdeasPage/__tests__/FilterChipBar.test.tsx` | Chip bar rendering + interaction tests |
| Create | `frontend/src/components/IdeasPage/__tests__/ViewToggle.test.tsx` | View toggle tests |
| Create | `frontend/src/components/IdeasPage/__tests__/IdeaCard2.test.tsx` | Card rendering tests |
| Create | `frontend/src/components/IdeasPage/__tests__/IdeaViews.test.tsx` | Grid/List/Graph view tests |
| Create | `frontend/src/components/IdeasPage/__tests__/IdeaPanel.test.tsx` | Panel open/close + content tests |
| Create | `frontend/src/components/IdeasPage/__tests__/IdeasToolbar.test.tsx` | Toolbar interaction tests |
| Create | `frontend/src/components/IdeasPage/__tests__/IdeasSmartPage.test.tsx` | Integration test: filter → view → panel flow |
| Rename | `frontend/src/components/IdeasPage.tsx` → `frontend/src/components/IdeasPage-legacy.tsx` | Preserve for reference |
| Rename | `frontend/src/components/IdeasPage.css` → `frontend/src/components/IdeasPage-legacy.css` | Preserve for reference |

### Modified Files

| Action | Path | Change |
|--------|------|--------|
| Modify | `frontend/src/App.tsx` | Import IdeasSmartPage from new directory, replace IdeasPage in route |
| Modify | `frontend/src/routes/index.tsx` | Update PAGE_PATHS if sub-routes change |
| Modify | `frontend/src/hooks/queries/useIdeas.ts` | Add `useIdeasByFilter` hook that accepts filter params |
| Modify | `frontend/src/lib/query-keys.ts` | Add `ideas.filtered(context, filters)` key |

### Preserved Files (NOT touched)

| Path | Reason |
|------|--------|
| `frontend/src/components/IdeaDetail.tsx` | Reused inside IdeaPanel (lazy-loaded) |
| `frontend/src/components/InboxTriage.tsx` | Reused when triage filter active |
| `frontend/src/components/IncubatorPage.tsx` | Reused when incubator filter active |
| `frontend/src/hooks/queries/useIdeas.ts` | Extended, not replaced |

---

## Chunk 1: Types, Filter Hook, and Filter Chip Bar

### Task 1: Define Smart Page types

**Files:**
- Create: `frontend/src/components/IdeasPage/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
import type { AIContext } from '../ContextSwitcher';

export type ViewMode = 'grid' | 'list' | 'graph';

export type IdeaStatus = 'active' | 'incubating' | 'archived' | 'triage';

export type SortField = 'created_at' | 'updated_at' | 'priority' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface IdeaSort {
  field: SortField;
  direction: SortDirection;
}

export interface IdeaFilters {
  status: Set<IdeaStatus>;
  types: Set<string>;
  categories: Set<string>;
  priorities: Set<string>;
  favoritesOnly: boolean;
  search: string;
}

export const DEFAULT_FILTERS: IdeaFilters = {
  status: new Set<IdeaStatus>(['active']),
  types: new Set<string>(),
  categories: new Set<string>(),
  priorities: new Set<string>(),
  favoritesOnly: false,
  search: '',
};

export const DEFAULT_SORT: IdeaSort = {
  field: 'created_at',
  direction: 'desc',
};

export interface FilterChipDef {
  id: string;
  label: string;
  group: 'status' | 'type' | 'category' | 'priority';
  value: string;
  icon?: string;
  count?: number;
}

export interface IdeaPanelState {
  open: boolean;
  ideaId: string | null;
  mode: 'detail' | 'chat' | 'triage';
}

export interface IdeasSmartPageProps {
  context: AIContext;
  initialTab?: string;
  onNavigate?: (page: string) => void;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors (or only pre-existing ones)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/IdeasPage/types.ts
git commit -m "feat(phase106-T1): Smart Page type definitions"
```

---

### Task 2: Create useIdeaFilters hook

**Files:**
- Create: `frontend/src/components/IdeasPage/useIdeaFilters.ts`
- Test: `frontend/src/components/IdeasPage/__tests__/useIdeaFilters.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useIdeaFilters } from '../useIdeaFilters';
import type { IdeaStatus } from '../types';

// Mock useNavigate
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
    act(() => {
      result.current.toggleFilter('status', 'archived');
    });
    expect(result.current.filters.status.has('archived')).toBe(true);
    expect(result.current.filters.status.has('active')).toBe(true);
  });

  it('toggles off an active filter', () => {
    const { result } = renderHook(() => useIdeaFilters());
    // active is on by default
    act(() => {
      result.current.toggleFilter('status', 'active');
    });
    expect(result.current.filters.status.has('active')).toBe(false);
  });

  it('toggles type filter', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => {
      result.current.toggleFilter('type', 'task');
    });
    expect(result.current.filters.types.has('task')).toBe(true);
    act(() => {
      result.current.toggleFilter('type', 'task');
    });
    expect(result.current.filters.types.has('task')).toBe(false);
  });

  it('sets search query', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => {
      result.current.setSearch('hello');
    });
    expect(result.current.filters.search).toBe('hello');
  });

  it('clears all filters to defaults', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => {
      result.current.toggleFilter('status', 'archived');
      result.current.toggleFilter('type', 'task');
      result.current.setSearch('test');
    });
    act(() => {
      result.current.clearAll();
    });
    expect(result.current.filters.status.has('active')).toBe(true);
    expect(result.current.filters.status.size).toBe(1);
    expect(result.current.filters.types.size).toBe(0);
    expect(result.current.filters.search).toBe('');
  });

  it('toggles favorites only', () => {
    const { result } = renderHook(() => useIdeaFilters());
    act(() => {
      result.current.toggleFavorites();
    });
    expect(result.current.filters.favoritesOnly).toBe(true);
    act(() => {
      result.current.toggleFavorites();
    });
    expect(result.current.filters.favoritesOnly).toBe(false);
  });

  it('computes active filter count', () => {
    const { result } = renderHook(() => useIdeaFilters());
    // Default: status=active counts as 0 (it's the default)
    expect(result.current.activeFilterCount).toBe(0);
    act(() => {
      result.current.toggleFilter('type', 'task');
      result.current.toggleFilter('status', 'archived');
    });
    // type:task + status:archived = 2 extra
    expect(result.current.activeFilterCount).toBe(2);
  });

  it('computes chipDefs from current state', () => {
    const { result } = renderHook(() => useIdeaFilters());
    const chips = result.current.chipDefs;
    // Should have status chips: active, incubating, archived, triage
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
    act(() => {
      result.current.setSort({ field: 'priority', direction: 'asc' });
    });
    expect(result.current.sort.field).toBe('priority');
    expect(result.current.sort.direction).toBe('asc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/useIdeaFilters.test.ts 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook implementation**

```typescript
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
    // Count non-default status selections
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/useIdeaFilters.test.ts 2>&1 | tail -5`
Expected: PASS — 12 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/IdeasPage/useIdeaFilters.ts frontend/src/components/IdeasPage/__tests__/useIdeaFilters.test.ts
git commit -m "feat(phase106-T2): useIdeaFilters hook with chip-based filtering"
```

---

### Task 3: Create FilterChipBar component

**Files:**
- Create: `frontend/src/components/IdeasPage/FilterChipBar.tsx`
- Create: `frontend/src/components/IdeasPage/FilterChipBar.css`
- Test: `frontend/src/components/IdeasPage/__tests__/FilterChipBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterChipBar } from '../FilterChipBar';
import type { FilterChipDef, IdeaFilters, IdeaStatus } from '../types';
import { DEFAULT_FILTERS } from '../types';

const mockChips: FilterChipDef[] = [
  { id: 'status-active', label: 'Aktiv', group: 'status', value: 'active' },
  { id: 'status-archived', label: 'Archiv', group: 'status', value: 'archived' },
  { id: 'type-task', label: 'Aufgabe', group: 'type', value: 'task' },
];

const activeFilters: IdeaFilters = {
  ...DEFAULT_FILTERS,
  status: new Set<IdeaStatus>(['active']),
};

describe('FilterChipBar', () => {
  it('renders all chip definitions', () => {
    render(
      <FilterChipBar
        chips={mockChips}
        filters={activeFilters}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(screen.getByText('Archiv')).toBeInTheDocument();
    expect(screen.getByText('Aufgabe')).toBeInTheDocument();
  });

  it('marks active chips with aria-pressed', () => {
    render(
      <FilterChipBar
        chips={mockChips}
        filters={activeFilters}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />
    );
    const activeChip = screen.getByText('Aktiv').closest('button');
    expect(activeChip).toHaveAttribute('aria-pressed', 'true');
    const archiveChip = screen.getByText('Archiv').closest('button');
    expect(archiveChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onToggle with group and value when clicked', () => {
    const onToggle = vi.fn();
    render(
      <FilterChipBar
        chips={mockChips}
        filters={activeFilters}
        onToggle={onToggle}
        onClear={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Archiv'));
    expect(onToggle).toHaveBeenCalledWith('status', 'archived');
  });

  it('shows clear button when activeCount > 0', () => {
    render(
      <FilterChipBar
        chips={mockChips}
        filters={activeFilters}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        activeCount={2}
      />
    );
    expect(screen.getByLabelText(/filter/i)).toBeInTheDocument();
  });

  it('does not show clear button when activeCount is 0', () => {
    render(
      <FilterChipBar
        chips={mockChips}
        filters={activeFilters}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        activeCount={0}
      />
    );
    expect(screen.queryByLabelText(/filter/i)).not.toBeInTheDocument();
  });

  it('has horizontal scrollable container with role', () => {
    render(
      <FilterChipBar
        chips={mockChips}
        filters={activeFilters}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />
    );
    const bar = screen.getByRole('toolbar');
    expect(bar).toBeInTheDocument();
  });

  it('groups chips visually with separators between groups', () => {
    const { container } = render(
      <FilterChipBar
        chips={mockChips}
        filters={activeFilters}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />
    );
    const separators = container.querySelectorAll('.filter-chip-bar__separator');
    // Between status group and type group = 1 separator
    expect(separators.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/FilterChipBar.test.tsx 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Write FilterChipBar implementation**

```tsx
import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { FilterChipDef, IdeaFilters } from './types';
import './FilterChipBar.css';

interface FilterChipBarProps {
  chips: FilterChipDef[];
  filters: IdeaFilters;
  onToggle: (group: string, value: string) => void;
  onClear: () => void;
  activeCount?: number;
}

function isChipActive(chip: FilterChipDef, filters: IdeaFilters): boolean {
  switch (chip.group) {
    case 'status': return filters.status.has(chip.value as any);
    case 'type': return filters.types.has(chip.value);
    case 'category': return filters.categories.has(chip.value);
    case 'priority': return filters.priorities.has(chip.value);
    default: return false;
  }
}

export function FilterChipBar({ chips, filters, onToggle, onClear, activeCount = 0 }: FilterChipBarProps) {
  const grouped = useMemo(() => {
    const groups: { group: string; chips: FilterChipDef[] }[] = [];
    let currentGroup = '';
    for (const chip of chips) {
      if (chip.group !== currentGroup) {
        groups.push({ group: chip.group, chips: [] });
        currentGroup = chip.group;
      }
      groups[groups.length - 1].chips.push(chip);
    }
    return groups;
  }, [chips]);

  return (
    <div className="filter-chip-bar" role="toolbar" aria-label="Filter">
      <div className="filter-chip-bar__scroll">
        {grouped.map((g, gi) => (
          <div key={g.group} className="filter-chip-bar__group">
            {gi > 0 && <div className="filter-chip-bar__separator" />}
            {g.chips.map(chip => {
              const active = isChipActive(chip, filters);
              return (
                <button
                  key={chip.id}
                  className={`filter-chip-bar__chip ${active ? 'filter-chip-bar__chip--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => onToggle(chip.group, chip.value)}
                >
                  {chip.label}
                  {chip.count != null && <span className="filter-chip-bar__count">{chip.count}</span>}
                </button>
              );
            })}
          </div>
        ))}
        {activeCount > 0 && (
          <button
            className="filter-chip-bar__clear"
            onClick={onClear}
            aria-label={`${activeCount} Filter entfernen`}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write FilterChipBar CSS**

```css
.filter-chip-bar {
  padding: 0 var(--spacing-4, 16px);
  overflow: hidden;
}

.filter-chip-bar__scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding: 4px 0;
}

.filter-chip-bar__scroll::-webkit-scrollbar {
  display: none;
}

.filter-chip-bar__group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.filter-chip-bar__separator {
  width: 1px;
  height: 20px;
  background: var(--border, rgba(255,255,255,0.1));
  margin: 0 4px;
  flex-shrink: 0;
}

.filter-chip-bar__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 16px;
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  background: transparent;
  color: var(--text-secondary, #8a919e);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.filter-chip-bar__chip:hover {
  background: var(--calmGlass-bg, rgba(255,255,255,0.06));
  color: var(--text, #e0e6ed);
}

.filter-chip-bar__chip--active {
  background: var(--accent, #6c8ebf);
  color: #fff;
  border-color: var(--accent, #6c8ebf);
}

.filter-chip-bar__chip--active:hover {
  background: var(--accent-hover, #5a7dab);
  color: #fff;
}

.filter-chip-bar__count {
  font-size: 0.6875rem;
  opacity: 0.7;
}

.filter-chip-bar__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border, rgba(255,255,255,0.12));
  background: transparent;
  color: var(--text-secondary, #8a919e);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.filter-chip-bar__clear:hover {
  background: var(--danger, #e74c3c);
  color: #fff;
  border-color: var(--danger, #e74c3c);
}

@media (pointer: coarse) {
  .filter-chip-bar__chip {
    min-height: 36px;
    padding: 8px 14px;
  }
  .filter-chip-bar__clear {
    width: 36px;
    height: 36px;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/FilterChipBar.test.tsx 2>&1 | tail -5`
Expected: PASS — 7 tests

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IdeasPage/FilterChipBar.tsx frontend/src/components/IdeasPage/FilterChipBar.css frontend/src/components/IdeasPage/__tests__/FilterChipBar.test.tsx
git commit -m "feat(phase106-T3): FilterChipBar component with group separators"
```

---

### Task 4: Create ViewToggle component

**Files:**
- Create: `frontend/src/components/IdeasPage/ViewToggle.tsx`
- Test: `frontend/src/components/IdeasPage/__tests__/ViewToggle.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ViewToggle } from '../ViewToggle';

describe('ViewToggle', () => {
  it('renders three view buttons', () => {
    render(<ViewToggle active="grid" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Rasteransicht')).toBeInTheDocument();
    expect(screen.getByLabelText('Listenansicht')).toBeInTheDocument();
    expect(screen.getByLabelText('Graphansicht')).toBeInTheDocument();
  });

  it('marks active view with aria-pressed', () => {
    render(<ViewToggle active="list" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Listenansicht')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Rasteransicht')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with view mode on click', () => {
    const onChange = vi.fn();
    render(<ViewToggle active="grid" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Listenansicht'));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('has role group', () => {
    render(<ViewToggle active="grid" onChange={vi.fn()} />);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/ViewToggle.test.tsx 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Write ViewToggle implementation**

```tsx
import { LayoutGrid, List, GitBranch } from 'lucide-react';
import type { ViewMode } from './types';
import './ViewToggle.css';

interface ViewToggleProps {
  active: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const VIEWS: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'grid', icon: LayoutGrid, label: 'Rasteransicht' },
  { mode: 'list', icon: List, label: 'Listenansicht' },
  { mode: 'graph', icon: GitBranch, label: 'Graphansicht' },
];

export function ViewToggle({ active, onChange }: ViewToggleProps) {
  return (
    <div className="view-toggle" role="group" aria-label="Ansicht">
      {VIEWS.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          className={`view-toggle__btn ${active === mode ? 'view-toggle__btn--active' : ''}`}
          aria-label={label}
          aria-pressed={active === mode}
          onClick={() => onChange(mode)}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write ViewToggle CSS**

```css
.view-toggle {
  display: flex;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 8px;
  overflow: hidden;
}

.view-toggle__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #8a919e);
  cursor: pointer;
  transition: all 0.15s ease;
}

.view-toggle__btn:not(:last-child) {
  border-right: 1px solid var(--border, rgba(255,255,255,0.1));
}

.view-toggle__btn:hover {
  background: var(--calmGlass-bg, rgba(255,255,255,0.06));
}

.view-toggle__btn--active {
  background: var(--accent, #6c8ebf);
  color: #fff;
}

.view-toggle__btn--active:hover {
  background: var(--accent-hover, #5a7dab);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/ViewToggle.test.tsx 2>&1 | tail -5`
Expected: PASS — 4 tests

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IdeasPage/ViewToggle.tsx frontend/src/components/IdeasPage/ViewToggle.css frontend/src/components/IdeasPage/__tests__/ViewToggle.test.tsx
git commit -m "feat(phase106-T4): ViewToggle segmented control (grid/list/graph)"
```

---

### Task 5: Verify Chunk 1

- [ ] **Step 1: Run all new tests together**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/ 2>&1 | tail -10`
Expected: All 23+ tests pass

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 new errors

---

## Chunk 2: IdeasToolbar, IdeaCard2, Grid/List/Graph Views

### Task 6: Create IdeasToolbar

**Files:**
- Create: `frontend/src/components/IdeasPage/IdeasToolbar.tsx`
- Create: `frontend/src/components/IdeasPage/IdeasToolbar.css`
- Test: `frontend/src/components/IdeasPage/__tests__/IdeasToolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeasToolbar } from '../IdeasToolbar';

describe('IdeasToolbar', () => {
  const defaultProps = {
    viewMode: 'grid' as const,
    onViewChange: vi.fn(),
    search: '',
    onSearchChange: vi.fn(),
    sort: { field: 'created_at' as const, direction: 'desc' as const },
    onSortChange: vi.fn(),
    selectionMode: false,
    onToggleSelection: vi.fn(),
    selectedCount: 0,
    onBatchArchive: vi.fn(),
    onBatchDelete: vi.fn(),
  };

  it('renders search input', () => {
    render(<IdeasToolbar {...defaultProps} />);
    expect(screen.getByPlaceholderText(/suchen/i)).toBeInTheDocument();
  });

  it('renders view toggle', () => {
    render(<IdeasToolbar {...defaultProps} />);
    expect(screen.getByRole('group', { name: /ansicht/i })).toBeInTheDocument();
  });

  it('fires search change on input', () => {
    render(<IdeasToolbar {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText(/suchen/i), { target: { value: 'test' } });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('test');
  });

  it('shows batch actions when selectionMode is true', () => {
    render(<IdeasToolbar {...defaultProps} selectionMode={true} selectedCount={3} />);
    expect(screen.getByText(/3 ausgewaehlt/i)).toBeInTheDocument();
  });

  it('hides batch actions when selectionMode is false', () => {
    render(<IdeasToolbar {...defaultProps} />);
    expect(screen.queryByText(/ausgewaehlt/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeasToolbar.test.tsx 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Write IdeasToolbar implementation**

```tsx
import { Search, CheckSquare, Archive, Trash2 } from 'lucide-react';
import { ViewToggle } from './ViewToggle';
import type { ViewMode, IdeaSort } from './types';
import './IdeasToolbar.css';

interface IdeasToolbarProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  search: string;
  onSearchChange: (query: string) => void;
  sort?: IdeaSort;
  onSortChange?: (sort: IdeaSort) => void;
  selectionMode: boolean;
  onToggleSelection: () => void;
  selectedCount: number;
  onBatchArchive: () => void;
  onBatchDelete: () => void;
}

export function IdeasToolbar({
  viewMode,
  onViewChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  selectionMode,
  onToggleSelection,
  selectedCount,
  onBatchArchive,
  onBatchDelete,
}: IdeasToolbarProps) {
  return (
    <div className="ideas-toolbar">
      {selectionMode ? (
        <div className="ideas-toolbar__batch">
          <span className="ideas-toolbar__count">{selectedCount} ausgewaehlt</span>
          <button className="ideas-toolbar__batch-btn" onClick={onBatchArchive} aria-label="Archivieren">
            <Archive size={16} />
          </button>
          <button className="ideas-toolbar__batch-btn ideas-toolbar__batch-btn--danger" onClick={onBatchDelete} aria-label="Loeschen">
            <Trash2 size={16} />
          </button>
          <button className="ideas-toolbar__cancel" onClick={onToggleSelection}>
            Abbrechen
          </button>
        </div>
      ) : (
        <>
          <div className="ideas-toolbar__search" role="search">
            <Search size={16} className="ideas-toolbar__search-icon" />
            <input
              className="ideas-toolbar__input"
              type="text"
              placeholder="Ideen suchen..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
          <div className="ideas-toolbar__actions">
            <button
              className="ideas-toolbar__select-btn"
              onClick={onToggleSelection}
              aria-label="Auswaehlen"
            >
              <CheckSquare size={16} />
            </button>
            <ViewToggle active={viewMode} onChange={onViewChange} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write IdeasToolbar CSS**

```css
.ideas-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 var(--spacing-4, 16px);
}

.ideas-toolbar__search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--calmGlass-bg, rgba(255,255,255,0.04));
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 10px;
  padding: 8px 12px;
  transition: border-color 0.15s ease;
}

.ideas-toolbar__search:focus-within {
  border-color: var(--accent, #6c8ebf);
}

.ideas-toolbar__search-icon {
  color: var(--text-secondary, #8a919e);
  flex-shrink: 0;
}

.ideas-toolbar__input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text, #e0e6ed);
  font-size: 0.875rem;
}

.ideas-toolbar__input::placeholder {
  color: var(--text-secondary, #8a919e);
}

.ideas-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ideas-toolbar__select-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: transparent;
  color: var(--text-secondary, #8a919e);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ideas-toolbar__select-btn:hover {
  background: var(--calmGlass-bg, rgba(255,255,255,0.06));
  color: var(--text, #e0e6ed);
}

.ideas-toolbar__batch {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.ideas-toolbar__count {
  font-size: 0.875rem;
  color: var(--text, #e0e6ed);
  margin-right: auto;
}

.ideas-toolbar__batch-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: transparent;
  color: var(--text-secondary, #8a919e);
  cursor: pointer;
}

.ideas-toolbar__batch-btn--danger:hover {
  background: var(--danger, #e74c3c);
  color: #fff;
  border-color: var(--danger, #e74c3c);
}

.ideas-toolbar__cancel {
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #8a919e);
  cursor: pointer;
  font-size: 0.8125rem;
}

.ideas-toolbar__cancel:hover {
  color: var(--text, #e0e6ed);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeasToolbar.test.tsx 2>&1 | tail -5`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IdeasPage/IdeasToolbar.tsx frontend/src/components/IdeasPage/IdeasToolbar.css frontend/src/components/IdeasPage/__tests__/IdeasToolbar.test.tsx
git commit -m "feat(phase106-T6): IdeasToolbar with search, view toggle, batch actions"
```

---

### Task 7: Create IdeaCard2 component

**Files:**
- Create: `frontend/src/components/IdeasPage/IdeaCard2.tsx`
- Create: `frontend/src/components/IdeasPage/IdeaCard2.css`
- Test: `frontend/src/components/IdeasPage/__tests__/IdeaCard2.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeaCard2 } from '../IdeaCard2';
import type { StructuredIdea } from '../../../types';

const mockIdea: StructuredIdea = {
  id: '1',
  title: 'Test Idea',
  type: 'idea',
  category: 'business',
  priority: 'high',
  summary: 'A test idea summary',
  next_steps: ['Step 1'],
  context_needed: [],
  keywords: ['test', 'idea'],
  is_favorite: false,
  created_at: new Date().toISOString(),
};

describe('IdeaCard2', () => {
  it('renders title and summary', () => {
    render(<IdeaCard2 idea={mockIdea} onClick={vi.fn()} />);
    expect(screen.getByText('Test Idea')).toBeInTheDocument();
    expect(screen.getByText('A test idea summary')).toBeInTheDocument();
  });

  it('renders priority badge', () => {
    render(<IdeaCard2 idea={mockIdea} onClick={vi.fn()} />);
    expect(screen.getByText(/hoch/i)).toBeInTheDocument();
  });

  it('renders keyword chips', () => {
    render(<IdeaCard2 idea={mockIdea} onClick={vi.fn()} />);
    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText('idea')).toBeInTheDocument();
  });

  it('calls onClick with idea when clicked', () => {
    const onClick = vi.fn();
    render(<IdeaCard2 idea={mockIdea} onClick={onClick} />);
    fireEvent.click(screen.getByText('Test Idea'));
    expect(onClick).toHaveBeenCalledWith(mockIdea);
  });

  it('shows selection checkbox when selectionMode', () => {
    render(
      <IdeaCard2
        idea={mockIdea}
        onClick={vi.fn()}
        selectionMode
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('adapts layout for list view via data-view', () => {
    const { container } = render(<IdeaCard2 idea={mockIdea} onClick={vi.fn()} view="list" />);
    expect(container.firstChild).toHaveAttribute('data-view', 'list');
  });

  it('shows favorite indicator when is_favorite', () => {
    const favIdea = { ...mockIdea, is_favorite: true };
    render(<IdeaCard2 idea={favIdea} onClick={vi.fn()} />);
    expect(screen.getByLabelText(/favorit/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeaCard2.test.tsx 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Write IdeaCard2 implementation**

```tsx
import { memo } from 'react';
import { Star, Lightbulb, CheckCircle, Zap, HelpCircle, AlertTriangle } from 'lucide-react';
import type { StructuredIdea } from '../../types';
import type { ViewMode } from './types';
import './IdeaCard2.css';

interface IdeaCard2Props {
  idea: StructuredIdea;
  onClick: (idea: StructuredIdea) => void;
  view?: ViewMode;
  selectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}

const TYPE_ICONS: Record<string, typeof Lightbulb> = {
  idea: Lightbulb,
  task: CheckCircle,
  insight: Zap,
  problem: AlertTriangle,
  question: HelpCircle,
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

export const IdeaCard2 = memo(function IdeaCard2({
  idea,
  onClick,
  view = 'grid',
  selectionMode,
  isSelected,
  onSelect,
}: IdeaCard2Props) {
  const TypeIcon = TYPE_ICONS[idea.type] ?? Lightbulb;

  return (
    <article
      className={`idea-card2 ${isSelected ? 'idea-card2--selected' : ''}`}
      data-view={view}
      onClick={() => selectionMode && onSelect ? onSelect(idea.id, !isSelected) : onClick(idea)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(idea);
        }
      }}
    >
      {selectionMode && (
        <input
          type="checkbox"
          className="idea-card2__checkbox"
          checked={isSelected}
          onChange={e => onSelect?.(idea.id, e.target.checked)}
          onClick={e => e.stopPropagation()}
        />
      )}
      <div className="idea-card2__header">
        <TypeIcon size={16} className="idea-card2__type-icon" />
        <h3 className="idea-card2__title">{idea.title}</h3>
        {idea.is_favorite && (
          <Star size={14} className="idea-card2__fav" fill="currentColor" aria-label="Favorit" />
        )}
      </div>
      <p className="idea-card2__summary">{idea.summary}</p>
      <div className="idea-card2__footer">
        <span className={`idea-card2__priority idea-card2__priority--${idea.priority}`}>
          {PRIORITY_LABELS[idea.priority] ?? idea.priority}
        </span>
        {idea.keywords?.slice(0, 3).map(kw => (
          <span key={kw} className="idea-card2__keyword">{kw}</span>
        ))}
      </div>
    </article>
  );
});
```

- [ ] **Step 4: Write IdeaCard2 CSS**

```css
.idea-card2 {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: var(--calmSurface-card, rgba(255,255,255,0.03));
  cursor: pointer;
  transition: all 0.2s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  position: relative;
}

.idea-card2:hover {
  border-color: var(--border-hover, rgba(255,255,255,0.15));
  background: var(--calmGlass-bg, rgba(255,255,255,0.05));
  transform: translateY(-1px);
}

.idea-card2:focus-visible {
  outline: 2px solid var(--accent, #6c8ebf);
  outline-offset: 2px;
}

.idea-card2--selected {
  border-color: var(--accent, #6c8ebf);
  background: rgba(108, 142, 191, 0.08);
}

/* List view variant */
.idea-card2[data-view="list"] {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
}

.idea-card2[data-view="list"] .idea-card2__summary {
  display: none;
}

.idea-card2[data-view="list"] .idea-card2__header {
  flex: 1;
  min-width: 0;
}

.idea-card2[data-view="list"] .idea-card2__footer {
  flex-shrink: 0;
}

.idea-card2__checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 18px;
  height: 18px;
  accent-color: var(--accent, #6c8ebf);
}

.idea-card2__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.idea-card2__type-icon {
  color: var(--text-secondary, #8a919e);
  flex-shrink: 0;
}

.idea-card2__title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text, #e0e6ed);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.idea-card2__fav {
  color: var(--warning, #f39c12);
  flex-shrink: 0;
}

.idea-card2__summary {
  font-size: 0.8125rem;
  color: var(--text-secondary, #8a919e);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}

.idea-card2__footer {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.idea-card2__priority {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.idea-card2__priority--high {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}

.idea-card2__priority--medium {
  background: rgba(243, 156, 18, 0.15);
  color: #f39c12;
}

.idea-card2__priority--low {
  background: rgba(108, 142, 191, 0.15);
  color: #6c8ebf;
}

.idea-card2__keyword {
  font-size: 0.6875rem;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--calmGlass-bg, rgba(255,255,255,0.04));
  color: var(--text-secondary, #8a919e);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeaCard2.test.tsx 2>&1 | tail -5`
Expected: PASS — 7 tests

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IdeasPage/IdeaCard2.tsx frontend/src/components/IdeasPage/IdeaCard2.css frontend/src/components/IdeasPage/__tests__/IdeaCard2.test.tsx
git commit -m "feat(phase106-T7): IdeaCard2 with grid/list variants, DS tokens"
```

---

### Task 8: Create IdeaGridView, IdeaListView, and IdeaGraphView

**Files:**
- Create: `frontend/src/components/IdeasPage/IdeaGridView.tsx`
- Create: `frontend/src/components/IdeasPage/IdeaListView.tsx`
- Create: `frontend/src/components/IdeasPage/IdeaGraphView.tsx`
- Test: `frontend/src/components/IdeasPage/__tests__/IdeaViews.test.tsx`

- [ ] **Step 1: Write failing tests for all three views**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeaGridView } from '../IdeaGridView';
import { IdeaListView } from '../IdeaListView';
import { IdeaGraphView } from '../IdeaGraphView';

const mockIdea = {
  id: '1',
  title: 'Test Idee',
  summary: 'Eine Zusammenfassung',
  type: 'idea',
  priority: 'medium',
  status: 'active',
  is_favorite: false,
  keywords: ['test'],
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

describe('IdeaGridView', () => {
  it('returns null when ideas array is empty', () => {
    const { container } = render(
      <IdeaGridView ideas={[]} onIdeaClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders ideas when provided', () => {
    render(
      <IdeaGridView ideas={[mockIdea as any]} onIdeaClick={vi.fn()} />
    );
    expect(screen.getByText('Test Idee')).toBeInTheDocument();
  });
});

describe('IdeaListView', () => {
  it('returns null when ideas array is empty', () => {
    const { container } = render(
      <IdeaListView ideas={[]} onIdeaClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders ideas when provided', () => {
    render(
      <IdeaListView ideas={[mockIdea as any]} onIdeaClick={vi.fn()} />
    );
    expect(screen.getByText('Test Idee')).toBeInTheDocument();
  });
});

describe('IdeaGraphView', () => {
  it('renders placeholder text', () => {
    render(<IdeaGraphView />);
    expect(screen.getByText('Graph-Ansicht')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeaViews.test.tsx 2>&1 | tail -5`
Expected: FAIL — modules not found

- [ ] **Step 3: Write IdeaGridView**

```tsx
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { IdeaCard2 } from './IdeaCard2';
import type { StructuredIdea } from '../../types';

interface IdeaGridViewProps {
  ideas: StructuredIdea[];
  onIdeaClick: (idea: StructuredIdea) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
}

const COLUMNS = 3;
const ROW_HEIGHT = 220;
const GAP = 12;

export function IdeaGridView({ ideas, onIdeaClick, selectionMode, selectedIds, onSelect }: IdeaGridViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(ideas.length / COLUMNS);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT + GAP,
    overscan: 3,
  });

  if (ideas.length === 0) {
    return null;
  }

  return (
    <div ref={parentRef} className="idea-grid-view" style={{ overflow: 'auto', flex: 1 }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(row => {
          const startIdx = row.index * COLUMNS;
          const rowIdeas = ideas.slice(startIdx, startIdx + COLUMNS);
          return (
            <div
              key={row.key}
              style={{
                position: 'absolute',
                top: row.start,
                left: 0,
                right: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
                gap: `${GAP}px`,
                padding: '0 var(--spacing-4, 16px)',
              }}
            >
              {rowIdeas.map(idea => (
                <IdeaCard2
                  key={idea.id}
                  idea={idea}
                  onClick={onIdeaClick}
                  view="grid"
                  selectionMode={selectionMode}
                  isSelected={selectedIds?.has(idea.id)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write IdeaListView**

```tsx
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { IdeaCard2 } from './IdeaCard2';
import type { StructuredIdea } from '../../types';

interface IdeaListViewProps {
  ideas: StructuredIdea[];
  onIdeaClick: (idea: StructuredIdea) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
}

const ROW_HEIGHT = 64;
const GAP = 4;

export function IdeaListView({ ideas, onIdeaClick, selectionMode, selectedIds, onSelect }: IdeaListViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: ideas.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT + GAP,
    overscan: 5,
  });

  if (ideas.length === 0) {
    return null;
  }

  return (
    <div ref={parentRef} className="idea-list-view" style={{ overflow: 'auto', flex: 1 }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(row => {
          const idea = ideas[row.index];
          return (
            <div
              key={row.key}
              style={{
                position: 'absolute',
                top: row.start,
                left: 0,
                right: 0,
                padding: '0 var(--spacing-4, 16px)',
              }}
            >
              <IdeaCard2
                idea={idea}
                onClick={onIdeaClick}
                view="list"
                selectionMode={selectionMode}
                isSelected={selectedIds?.has(idea.id)}
                onSelect={onSelect}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create IdeaGraphView placeholder**

```tsx
import { GitBranch } from 'lucide-react';
import { EmptyState } from '../../design-system';

export function IdeaGraphView() {
  return (
    <div className="idea-graph-view" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EmptyState
        icon={<GitBranch size={48} />}
        title="Graph-Ansicht"
        description="Die visuelle Darstellung der Ideenverbindungen kommt bald."
      />
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeaViews.test.tsx 2>&1 | tail -5`
Expected: PASS — 5 tests

- [ ] **Step 7: TypeScript check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 new errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/IdeasPage/IdeaGridView.tsx frontend/src/components/IdeasPage/IdeaListView.tsx frontend/src/components/IdeasPage/IdeaGraphView.tsx frontend/src/components/IdeasPage/__tests__/IdeaViews.test.tsx
git commit -m "feat(phase106-T8): Grid, List, Graph views with TanStack Virtual"
```

---

### Task 9: Verify Chunk 2

- [ ] **Step 1: Run all tests**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/ 2>&1 | tail -10`
Expected: All tests pass (35+)

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 new errors

---

## Chunk 3: IdeaPanel, Assembly, and Routing Integration

### Task 10: Create IdeaPanel slide-out

**Files:**
- Create: `frontend/src/components/IdeasPage/IdeaPanel.tsx`
- Create: `frontend/src/components/IdeasPage/IdeaPanel.css`
- Test: `frontend/src/components/IdeasPage/__tests__/IdeaPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeaPanel } from '../IdeaPanel';

// Mock IdeaDetail since it's lazy loaded
vi.mock('../../IdeaDetail', () => ({
  IdeaDetail: ({ idea, onClose }: any) => (
    <div data-testid="idea-detail">
      <span>{idea.title}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

const mockIdea = {
  id: '1',
  title: 'Test',
  type: 'idea',
  category: 'business',
  priority: 'high',
  summary: 'Test summary',
  next_steps: [],
  context_needed: [],
  keywords: [],
  created_at: new Date().toISOString(),
};

describe('IdeaPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <IdeaPanel open={false} idea={null} onClose={vi.fn()} context="personal" />
    );
    expect(container.querySelector('.idea-panel--open')).toBeNull();
  });

  it('renders idea detail when open with idea', () => {
    render(
      <IdeaPanel open={true} idea={mockIdea as any} onClose={vi.fn()} context="personal" />
    );
    expect(screen.getByTestId('idea-detail')).toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(
      <IdeaPanel open={true} idea={mockIdea as any} onClose={onClose} context="personal" />
    );
    const backdrop = screen.getByTestId('idea-panel-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <IdeaPanel open={true} idea={mockIdea as any} onClose={onClose} context="personal" />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('has aria-label on panel', () => {
    render(
      <IdeaPanel open={true} idea={mockIdea as any} onClose={vi.fn()} context="personal" />
    );
    expect(screen.getByRole('complementary')).toHaveAttribute('aria-label');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeaPanel.test.tsx 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Write IdeaPanel implementation**

```tsx
import { lazy, Suspense, useEffect } from 'react';
import { X } from 'lucide-react';
import { SkeletonLoader } from '../SkeletonLoader';
import type { StructuredIdea } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import './IdeaPanel.css';

const IdeaDetail = lazy(() => import('../IdeaDetail').then(m => ({ default: m.IdeaDetail })));

interface IdeaPanelProps {
  open: boolean;
  idea: StructuredIdea | null;
  onClose: () => void;
  context: AIContext;
}

export function IdeaPanel({ open, idea, onClose, context }: IdeaPanelProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="idea-panel__backdrop"
          onClick={onClose}
          data-testid="idea-panel-backdrop"
        />
      )}
      <aside
        className={`idea-panel ${open ? 'idea-panel--open' : ''}`}
        role="complementary"
        aria-label="Idee-Details"
      >
        <div className="idea-panel__header">
          <button className="idea-panel__close" onClick={onClose} aria-label="Schliessen">
            <X size={20} />
          </button>
        </div>
        <div className="idea-panel__content">
          {open && idea && (
            <Suspense fallback={<SkeletonLoader />}>
              <IdeaDetail idea={idea as any} onClose={onClose} />
            </Suspense>
          )}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 4: Write IdeaPanel CSS**

```css
.idea-panel__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 90;
  backdrop-filter: blur(2px);
}

.idea-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 440px;
  max-width: 100vw;
  background: var(--calmSurface-page, #0f1923);
  border-left: 1px solid var(--border, rgba(255,255,255,0.08));
  z-index: 100;
  transform: translateX(100%);
  transition: transform 0.3s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.idea-panel--open {
  transform: translateX(0);
}

.idea-panel__header {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}

.idea-panel__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #8a919e);
  cursor: pointer;
}

.idea-panel__close:hover {
  background: var(--calmGlass-bg, rgba(255,255,255,0.06));
  color: var(--text, #e0e6ed);
}

.idea-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

@media (max-width: 768px) {
  .idea-panel {
    width: 100vw;
  }
}

@media (prefers-reduced-motion: reduce) {
  .idea-panel {
    transition: none;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeaPanel.test.tsx 2>&1 | tail -5`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IdeasPage/IdeaPanel.tsx frontend/src/components/IdeasPage/IdeaPanel.css frontend/src/components/IdeasPage/__tests__/IdeaPanel.test.tsx
git commit -m "feat(phase106-T10): IdeaPanel slide-out with backdrop, Escape close"
```

---

### Task 11: Create IdeasSmartPage assembly

**Files:**
- Create: `frontend/src/components/IdeasPage/IdeasSmartPage.tsx`
- Create: `frontend/src/components/IdeasPage/IdeasSmartPage.css`
- Create: `frontend/src/components/IdeasPage/index.ts`
- Test: `frontend/src/components/IdeasPage/__tests__/IdeasSmartPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeasSmartPage } from '../IdeasSmartPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the hooks
vi.mock('../../../hooks/queries/useIdeas', () => ({
  useIdeasQuery: () => ({ data: [], isLoading: false, error: null }),
  useArchivedIdeasQuery: () => ({ data: { ideas: [], total: 0 } }),
  useDeleteIdeaMutation: () => ({ mutate: vi.fn() }),
  useArchiveIdeaMutation: () => ({ mutate: vi.fn() }),
  useRestoreIdeaMutation: () => ({ mutate: vi.fn() }),
  useToggleFavoriteMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('IdeasSmartPage', () => {
  it('renders filter chip bar', () => {
    renderWithProviders(<IdeasSmartPage context="personal" />);
    expect(screen.getByRole('toolbar', { name: /filter/i })).toBeInTheDocument();
  });

  it('renders search in toolbar', () => {
    renderWithProviders(<IdeasSmartPage context="personal" />);
    expect(screen.getByPlaceholderText(/suchen/i)).toBeInTheDocument();
  });

  it('renders view toggle', () => {
    renderWithProviders(<IdeasSmartPage context="personal" />);
    expect(screen.getByRole('group', { name: /ansicht/i })).toBeInTheDocument();
  });

  it('renders empty state when no ideas', () => {
    renderWithProviders(<IdeasSmartPage context="personal" />);
    // Should show some kind of empty message or the grid with 0 items
    // The grid/list returns null with 0 items, so we check for no cards
    expect(screen.queryByRole('button', { name: /test/i })).not.toBeInTheDocument();
  });

  it('accepts initialTab prop for filter preset', () => {
    renderWithProviders(<IdeasSmartPage context="personal" initialTab="archive" />);
    // Archive chip should be active
    const archiveChip = screen.getByText('Archiv').closest('button');
    expect(archiveChip).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeasSmartPage.test.tsx 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Write IdeasSmartPage implementation**

```tsx
import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useIdeasQuery, useArchiveIdeaMutation, useDeleteIdeaMutation, useToggleFavoriteMutation } from '../../hooks/queries/useIdeas';
import { useIdeaFilters } from './useIdeaFilters';
import { FilterChipBar } from './FilterChipBar';
import { IdeasToolbar } from './IdeasToolbar';
import { IdeaGridView } from './IdeaGridView';
import { IdeaListView } from './IdeaListView';
import { IdeaGraphView } from './IdeaGraphView';
import { IdeaPanel } from './IdeaPanel';
import { SkeletonLoader } from '../SkeletonLoader';
import { QueryErrorState } from '../QueryErrorState';
import { EmptyState } from '../../design-system';
import { Lightbulb } from 'lucide-react';
import type { StructuredIdea } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import type { ViewMode } from './types';
import './IdeasSmartPage.css';

const InboxTriage = lazy(() => import('../InboxTriage').then(m => ({ default: m.InboxTriage })));
const IncubatorPage = lazy(() => import('../IncubatorPage').then(m => ({ default: m.IncubatorPage })));

interface IdeasSmartPageProps {
  context: AIContext;
  initialTab?: string;
  onNavigate?: (page: string) => void;
}

export function IdeasSmartPage({ context, initialTab, onNavigate }: IdeasSmartPageProps) {
  const { filters, sort, setSort, toggleFilter, setSearch, toggleFavorites, clearAll, activeFilterCount, chipDefs } = useIdeaFilters(initialTab);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [panelIdea, setPanelIdea] = useState<StructuredIdea | null>(null);

  const { data: ideas = [], isLoading, error, refetch } = useIdeasQuery(context);
  const archiveMutation = useArchiveIdeaMutation(context);
  const deleteMutation = useDeleteIdeaMutation(context);

  // Check if special mode is active
  const isTriageMode = filters.status.size === 1 && filters.status.has('triage');
  const isIncubatorMode = filters.status.size === 1 && filters.status.has('incubating');

  // Filter ideas client-side
  const filteredIdeas = useMemo(() => {
    let result = ideas;

    // Status filter
    if (filters.status.size > 0 && !filters.status.has('active') && !isTriageMode && !isIncubatorMode) {
      // If archived is selected, we'd need archived data — for now show active
    }

    // Type filter
    if (filters.types.size > 0) {
      result = result.filter(i => filters.types.has(i.type));
    }

    // Category filter
    if (filters.categories.size > 0) {
      result = result.filter(i => filters.categories.has(i.category));
    }

    // Priority filter
    if (filters.priorities.size > 0) {
      result = result.filter(i => filters.priorities.has(i.priority));
    }

    // Favorites
    if (filters.favoritesOnly) {
      result = result.filter(i => i.is_favorite);
    }

    // Search (client-side simple match)
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.summary?.toLowerCase().includes(q) ||
        i.keywords?.some(k => k.toLowerCase().includes(q))
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      const dir = sort.direction === 'asc' ? 1 : -1;
      if (sort.field === 'title') return dir * a.title.localeCompare(b.title);
      if (sort.field === 'priority') {
        const order = { high: 3, medium: 2, low: 1 };
        return dir * ((order[a.priority] ?? 0) - (order[b.priority] ?? 0));
      }
      const aDate = sort.field === 'updated_at' ? a.updated_at : a.created_at;
      const bDate = sort.field === 'updated_at' ? b.updated_at : b.created_at;
      return dir * (new Date(aDate).getTime() - new Date(bDate).getTime());
    });

    return result;
  }, [ideas, filters, sort, isTriageMode, isIncubatorMode]);

  const handleIdeaClick = useCallback((idea: StructuredIdea) => {
    setPanelIdea(idea);
  }, []);

  const handleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const handleBatchArchive = useCallback(() => {
    selectedIds.forEach(id => archiveMutation.mutate(id));
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [selectedIds, archiveMutation]);

  const handleBatchDelete = useCallback(() => {
    selectedIds.forEach(id => deleteMutation.mutate(id));
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [selectedIds, deleteMutation]);

  // Special modes render their dedicated components
  if (isTriageMode) {
    return (
      <div className="ideas-smart-page">
        <FilterChipBar chips={chipDefs} filters={filters} onToggle={toggleFilter} onClear={clearAll} activeCount={activeFilterCount} />
        <Suspense fallback={<SkeletonLoader />}>
          <InboxTriage
            context={context}
            apiBase=""
            onBack={() => toggleFilter('status', 'triage')}
            onComplete={() => toggleFilter('status', 'triage')}
            showToast={() => {}}
          />
        </Suspense>
      </div>
    );
  }

  if (isIncubatorMode) {
    return (
      <div className="ideas-smart-page">
        <FilterChipBar chips={chipDefs} filters={filters} onToggle={toggleFilter} onClear={clearAll} activeCount={activeFilterCount} />
        <Suspense fallback={<SkeletonLoader />}>
          <IncubatorPage
            onBack={() => toggleFilter('status', 'incubating')}
            embedded
          />
        </Suspense>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ideas-smart-page">
        <FilterChipBar chips={chipDefs} filters={filters} onToggle={toggleFilter} onClear={clearAll} activeCount={activeFilterCount} />
        <QueryErrorState error={error} refetch={refetch} />
      </div>
    );
  }

  const renderView = () => {
    if (isLoading) return <SkeletonLoader />;

    if (filteredIdeas.length === 0) {
      return (
        <EmptyState
          icon={<Lightbulb size={48} />}
          title="Keine Ideen gefunden"
          description={filters.search ? 'Versuche andere Suchbegriffe.' : 'Erstelle deine erste Idee im Chat Hub.'}
        />
      );
    }

    switch (viewMode) {
      case 'grid':
        return <IdeaGridView ideas={filteredIdeas} onIdeaClick={handleIdeaClick} selectionMode={selectionMode} selectedIds={selectedIds} onSelect={handleSelect} />;
      case 'list':
        return <IdeaListView ideas={filteredIdeas} onIdeaClick={handleIdeaClick} selectionMode={selectionMode} selectedIds={selectedIds} onSelect={handleSelect} />;
      case 'graph':
        return <IdeaGraphView />;
    }
  };

  return (
    <div className="ideas-smart-page">
      <FilterChipBar
        chips={chipDefs}
        filters={filters}
        onToggle={toggleFilter}
        onClear={clearAll}
        activeCount={activeFilterCount}
      />
      <IdeasToolbar
        viewMode={viewMode}
        onViewChange={setViewMode}
        search={filters.search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        selectionMode={selectionMode}
        onToggleSelection={() => { setSelectionMode(s => !s); setSelectedIds(new Set()); }}
        selectedCount={selectedIds.size}
        onBatchArchive={handleBatchArchive}
        onBatchDelete={handleBatchDelete}
      />
      <div className="ideas-smart-page__content">
        {renderView()}
      </div>
      <IdeaPanel
        open={panelIdea !== null}
        idea={panelIdea}
        onClose={() => setPanelIdea(null)}
        context={context}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write IdeasSmartPage CSS**

```css
.ideas-smart-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  padding-top: 12px;
}

.ideas-smart-page__content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 5: Write barrel export**

```typescript
// frontend/src/components/IdeasPage/index.ts
export { IdeasSmartPage } from './IdeasSmartPage';
export type { IdeasSmartPageProps, ViewMode, IdeaFilters } from './types';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/IdeasPage/__tests__/IdeasSmartPage.test.tsx 2>&1 | tail -5`
Expected: PASS — 5 tests

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/IdeasPage/IdeasSmartPage.tsx frontend/src/components/IdeasPage/IdeasSmartPage.css frontend/src/components/IdeasPage/index.ts frontend/src/components/IdeasPage/__tests__/IdeasSmartPage.test.tsx
git commit -m "feat(phase106-T11): IdeasSmartPage assembly with filter+view+panel"
```

---

### Task 12: Integrate into App.tsx routing

**Files:**
- Modify: `frontend/src/App.tsx`
- Rename: `frontend/src/components/IdeasPage.tsx` → `frontend/src/components/IdeasPage-legacy.tsx`
- Rename: `frontend/src/components/IdeasPage.css` → `frontend/src/components/IdeasPage-legacy.css`

- [ ] **Step 1: Rename legacy files**

```bash
cd frontend/src/components
mv IdeasPage.tsx IdeasPage-legacy.tsx
mv IdeasPage.css IdeasPage-legacy.css
```

- [ ] **Step 2: Update App.tsx import**

In `frontend/src/App.tsx`, find the IdeasPage import and replace it:

Change:
```typescript
// Old: import { IdeasPage } from somewhere (or lazy load)
```

To:
```typescript
import { IdeasSmartPage } from './components/IdeasPage';
```

Then in the route rendering, replace `<IdeasPage` with `<IdeasSmartPage` — keeping the same props (`context`, `initialTab`, `onNavigate`).

The `initialTab` prop is derived from the URL tab parameter. The Smart Page handles tab→filter mapping internally via `useIdeaFilters(initialTab)`.

- [ ] **Step 3: Update any other imports of IdeasPage**

Search for other files importing from `./IdeasPage` or `../IdeasPage`:

Run: `cd frontend && grep -r "from.*['\"].*IdeasPage['\"]" src/ --include="*.tsx" --include="*.ts" | grep -v legacy | grep -v __tests__ | grep -v node_modules`

Update each to import from `./IdeasPage` (directory barrel) or `./IdeasPage-legacy` as needed.

- [ ] **Step 4: Run full test suite**

Run: `cd frontend && npx vitest run 2>&1 | tail -10`
Expected: All tests pass (some old IdeasPage tests may need path updates)

- [ ] **Step 5: TypeScript check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(phase106-T12): Route IdeasSmartPage into App.tsx, preserve legacy"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run full frontend test suite**

Run: `cd frontend && npx vitest run 2>&1 | tail -15`
Expected: All tests pass (957+ existing + ~40 new = ~997+)

- [ ] **Step 2: TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors

- [ ] **Step 3: Build check**

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Milestone commit**

```bash
git add -A
git commit -m "milestone(phase106): Ideen Smart Page complete — filter chips, 3 views, AI panel"
```
