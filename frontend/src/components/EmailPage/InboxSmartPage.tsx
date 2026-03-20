/**
 * InboxSmartPage - Main email inbox container (Phase 108)
 *
 * Assembles FilterChipBar + InboxToolbar + views + InboxPanel.
 * Follows the same pattern as IdeasSmartPage from Phase 107.
 */
import { useState, useMemo, useCallback } from 'react';
import { FilterChipBar } from './FilterChipBar';
import { InboxToolbar } from './InboxToolbar';
import { EmailListView } from './EmailListView';
import { EmailGridView } from './EmailGridView';
import { InboxPanel } from './InboxPanel';
import { useInboxFilters } from './useInboxFilters';
import { useEmailsQuery, useToggleEmailStarMutation } from '../../hooks/queries/useEmail';
import type { Email, InboxViewMode } from './types';
import type { AIContext } from '../ContextSwitcher';
import './InboxSmartPage.css';

interface InboxSmartPageProps {
  context: AIContext | string;
  initialTab?: string;
}

export function InboxSmartPage({ context, initialTab: _initialTab }: InboxSmartPageProps) {
  const {
    filters,
    toggleFilter,
    setSearch,
    clearAll,
    activeFilterCount,
    chipDefs,
  } = useInboxFilters();

  const [viewMode, setViewMode] = useState<InboxViewMode>('list');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<'detail' | 'compose' | 'reply'>('detail');

  // Data fetching
  const queryFilters = useMemo(() => {
    const f: Record<string, unknown> = {};
    if (filters.folders.size > 0) f.folder = [...filters.folders][0];
    if (filters.categories.size > 0) f.category = [...filters.categories][0];
    if (filters.search) f.search = filters.search;
    return f;
  }, [filters]);

  const { data: emails = [], isLoading: _isLoading, error: _error } = useEmailsQuery(
    context as AIContext,
    queryFilters,
  );
  const starMutation = useToggleEmailStarMutation(context as AIContext);

  // Bridge hook Email type to local Email type (API returns full objects)
  const allEmails = emails as unknown as Email[];

  // Client-side filtering for statuses (unread/starred)
  const filteredEmails = useMemo(() => {
    let result = allEmails;
    if (filters.statuses.has('unread')) {
      result = result.filter(e => e.status === 'received');
    }
    if (filters.statuses.has('starred')) {
      result = result.filter(e => e.is_starred);
    }
    return result;
  }, [allEmails, filters.statuses]);

  // Handlers
  const handleEmailSelect = useCallback((id: string) => {
    if (selectionMode) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      setSelectedEmailId(id);
      setPanelMode('detail');
      setPanelOpen(true);
    }
  }, [selectionMode]);

  const handleStar = useCallback((id: string) => {
    const email = allEmails.find(e => e.id === id);
    if (email) {
      starMutation.mutate({ id, starred: !email.is_starred });
    }
  }, [allEmails, starMutation]);

  const handleCompose = useCallback(() => {
    setSelectedEmailId(null);
    setPanelMode('compose');
    setPanelOpen(true);
  }, []);

  const handlePanelClose = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const handleBatchArchive = useCallback(() => {
    // TODO: implement batch archive mutation
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleBatchDelete = useCallback(() => {
    // TODO: implement batch delete mutation
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  return (
    <div className="inbox-smart-page">
      <FilterChipBar
        chips={chipDefs}
        filters={filters}
        onToggle={toggleFilter}
        onClear={clearAll}
        activeCount={activeFilterCount}
      />

      <InboxToolbar
        viewMode={viewMode}
        onViewChange={setViewMode}
        search={filters.search}
        onSearchChange={setSearch}
        onCompose={handleCompose}
        selectionMode={selectionMode}
        onToggleSelection={() => setSelectionMode(m => !m)}
        selectedCount={selectedIds.size}
        onBatchArchive={handleBatchArchive}
        onBatchDelete={handleBatchDelete}
      />

      <div className="inbox-smart-page__content">
        {viewMode === 'list' && (
          <EmailListView
            emails={filteredEmails}
            selectedId={selectedEmailId}
            onSelect={handleEmailSelect}
            onStar={handleStar}
          />
        )}
        {viewMode === 'grid' && (
          <EmailGridView
            emails={filteredEmails}
            selectedId={selectedEmailId}
            onSelect={handleEmailSelect}
            onStar={handleStar}
          />
        )}
        {viewMode === 'conversation' && (
          <EmailListView
            emails={filteredEmails}
            selectedId={selectedEmailId}
            onSelect={handleEmailSelect}
            onStar={handleStar}
          />
        )}
      </div>

      <InboxPanel
        open={panelOpen}
        emailId={selectedEmailId}
        mode={panelMode}
        onClose={handlePanelClose}
        context={context as string}
      />
    </div>
  );
}
