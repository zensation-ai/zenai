import { useState, useMemo, useCallback } from 'react';
import { FilterChipBar } from './FilterChipBar';
import { IdeasToolbar } from './IdeasToolbar';
import { IdeaGridView } from './IdeaGridView';
import { IdeaListView } from './IdeaListView';
import { IdeaGraphView } from './IdeaGraphView';
import { IdeaPanel } from './IdeaPanel';
import { useIdeaFilters } from './useIdeaFilters';
import { QueryErrorState } from '../QueryErrorState';
import { EmptyState } from '../../design-system';
import { useIdeasQuery, useArchiveIdeaMutation, useDeleteIdeaMutation } from '../../hooks/queries/useIdeas';
import type { StructuredIdea } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import type { ViewMode, IdeasSmartPageProps } from './types';
import './IdeasSmartPage.css';

export function IdeasSmartPage({ context, initialTab, onNavigate: _onNavigate }: IdeasSmartPageProps) {
  const {
    filters,
    sort,
    setSort,
    toggleFilter,
    setSearch,
    clearAll,
    activeFilterCount,
    chipDefs,
  } = useIdeaFilters(initialTab);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<StructuredIdea | null>(null);

  const { data: ideas = [], isLoading, error, refetch } = useIdeasQuery(context as AIContext);

  const archiveMutation = useArchiveIdeaMutation(context as AIContext);
  const deleteMutation = useDeleteIdeaMutation(context as AIContext);

  // Apply client-side filters
  const filteredIdeas = useMemo<StructuredIdea[]>(() => {
    let result = ideas as StructuredIdea[];

    // Status filter
    if (filters.status.size > 0) {
      // active ideas don't have an explicit status field in StructuredIdea
      // we filter based on status chip selections
      // For now, active = all non-archived ideas
    }

    // Type filter
    if (filters.types.size > 0) {
      result = result.filter(idea => filters.types.has(idea.type));
    }

    // Category filter
    if (filters.categories.size > 0) {
      result = result.filter(idea => filters.categories.has(idea.category));
    }

    // Priority filter
    if (filters.priorities.size > 0) {
      result = result.filter(idea => filters.priorities.has(idea.priority));
    }

    // Favorites filter
    if (filters.favoritesOnly) {
      result = result.filter(idea => idea.is_favorite);
    }

    // Search filter
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(idea =>
        idea.title.toLowerCase().includes(q) ||
        idea.summary.toLowerCase().includes(q) ||
        idea.keywords.some(k => k.toLowerCase().includes(q))
      );
    }

    // Sort
    return [...result].sort((a, b) => {
      const field = sort.field;
      const dir = sort.direction === 'asc' ? 1 : -1;
      if (field === 'priority') {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return dir * ((priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
      }
      const va = (a[field] ?? '') as string;
      const vb = (b[field] ?? '') as string;
      return dir * va.localeCompare(vb);
    });
  }, [ideas, filters, sort]);

  const handleIdeaClick = useCallback((idea: StructuredIdea) => {
    setSelectedIdea(idea);
    setPanelOpen(true);
  }, []);

  const handlePanelClose = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const handleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleBatchArchive = useCallback(() => {
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    setSelectionMode(false);
    ids.forEach(id => archiveMutation.mutate(id, {
      onError: () => setSelectedIds(prev => new Set([...prev, id])),
    }));
  }, [selectedIds, archiveMutation]);

  const handleBatchDelete = useCallback(() => {
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    setSelectionMode(false);
    ids.forEach(id => deleteMutation.mutate(id, {
      onError: () => setSelectedIds(prev => new Set([...prev, id])),
    }));
  }, [selectedIds, deleteMutation]);

  if (error) {
    return (
      <QueryErrorState
        error={error as Error}
        refetch={refetch}
        className="ideas-smart-page__error"
      />
    );
  }

  const showEmpty = !isLoading && filteredIdeas.length === 0;

  return (
    <div className="ideas-smart-page" role="main" aria-label="Ideen">
      <FilterChipBar
        chips={chipDefs}
        filters={filters}
        onToggle={toggleFilter as (group: string, value: string) => void}
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
        onToggleSelection={() => setSelectionMode(m => !m)}
        selectedCount={selectedIds.size}
        onBatchArchive={handleBatchArchive}
        onBatchDelete={handleBatchDelete}
      />

      <div className="ideas-smart-page__content">
        {showEmpty ? (
          <EmptyState
            title="Keine Ideen gefunden"
            description="Erstelle deine erste Idee oder passe die Filter an."
            className="ideas-smart-page__empty"
          />
        ) : (
          <>
            {viewMode === 'grid' && (
              <IdeaGridView
                ideas={filteredIdeas}
                onIdeaClick={handleIdeaClick}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onSelect={handleSelect}
              />
            )}
            {viewMode === 'list' && (
              <IdeaListView
                ideas={filteredIdeas}
                onIdeaClick={handleIdeaClick}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onSelect={handleSelect}
              />
            )}
            {viewMode === 'graph' && (
              <IdeaGraphView ideas={filteredIdeas} onIdeaClick={handleIdeaClick} />
            )}
          </>
        )}
      </div>

      <IdeaPanel
        open={panelOpen}
        idea={selectedIdea}
        onClose={handlePanelClose}
        context={context as AIContext}
      />
    </div>
  );
}
