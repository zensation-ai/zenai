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
