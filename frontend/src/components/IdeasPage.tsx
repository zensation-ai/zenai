/**
 * IdeasPage - Main Ideas View
 *
 * Uses React Query hooks internally for data fetching and mutations.
 * Minimal props: only context, initialTab, and onNavigate.
 */

import { lazy, Suspense, useMemo, memo, useState, useEffect, useCallback, useRef } from 'react';
import { useTabNavigation } from '../hooks/useTabNavigation';
import axios from 'axios';
import type { StructuredIdea } from '../types';
import type { AIContext } from './ContextSwitcher';
import type { AdvancedFilters } from './SearchFilterBar';
import type { ProcessType } from './AIProcessingOverlay';
import type { InputMode } from './CommandCenter';
import { usePersonaState } from './PersonaSelector';
import {
  useIdeasQuery,
  useArchivedIdeasQuery,
  useDeleteIdeaMutation,
  useArchiveIdeaMutation,
  useRestoreIdeaMutation,
  useToggleFavoriteMutation,
} from '../hooks/queries/useIdeas';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/query-keys';

import { SmartIdeaList } from './VirtualizedIdeaList';
import { RecordButton } from './RecordButton';
import { SearchFilterBar } from './SearchFilterBar';
import { ActiveFiltersBar } from './ActiveFiltersBar';
import { QuickStats } from './QuickStats';
import { AIBrain } from './AIBrain';
import { RisingBubbles } from './RisingBubbles';
import { SkeletonLoader } from './SkeletonLoader';
import { ErrorBoundary } from './ErrorBoundary';
import { GeneralChat } from './GeneralChat';
import { AIProcessingOverlay } from './AIProcessingOverlay';
import { CommandCenter } from './CommandCenter';
import { RateLimitBanner } from './RateLimitBanner';
import { IdeaBatchActionBar } from './IdeaBatchActionBar';
import { useConfirm } from './ConfirmDialog';
import { showToast } from './Toast';
import {
  AI_PERSONALITY,
  getTimeBasedGreeting,
  EMPTY_STATE_MESSAGES,
  getContextAwareGreeting,
} from '../utils/aiPersonality';
import { getErrorMessage } from '../utils/errors';
import { safeParseResponse, IdeaCreationResponseSchema, SearchResponseSchema, ProgressiveSearchResponseSchema } from '../utils/apiSchemas';
import { AI_PROCESSING_STEP_DELAY_MS, AI_PROCESSING_INITIAL_DELAY_MS } from '../constants';
import { Button, Badge, EmptyState } from '../design-system';
import './IdeasPage.css';

const IdeaDetail = lazy(() => import('./IdeaDetail').then(m => ({ default: m.IdeaDetail })));
const InboxTriage = lazy(() => import('./InboxTriage').then(m => ({ default: m.InboxTriage })));
const IncubatorPage = lazy(() => import('./IncubatorPage').then(m => ({ default: m.IncubatorPage })));

export type IdeasTab = 'ideas' | 'incubator' | 'archive' | 'triage';

export interface IdeasPageProps {
  context: AIContext;
  initialTab?: IdeasTab;
  onNavigate?: (page: string) => void;
}

const IdeasPageComponent: React.FC<IdeasPageProps> = ({
  context,
  initialTab = 'ideas',
  onNavigate: _onNavigate,
}) => {
  const VALID_TABS = ['ideas', 'incubator', 'archive', 'triage'] as const;
  const { activeTab: activeIdeasTab, handleTabChange } = useTabNavigation<IdeasTab>({
    initialTab,
    validTabs: VALID_TABS,
    defaultTab: 'ideas',
    basePath: '/ideas',
    rootTab: 'ideas',
  });

  // ============================================
  // DATA: React Query hooks
  // ============================================
  const queryClient = useQueryClient();
  const { data: ideas = [], isLoading: loading, error: queryError } = useIdeasQuery(context);
  const { data: archivedData } = useArchivedIdeasQuery(context, activeIdeasTab === 'archive');
  const archivedIdeas = archivedData?.ideas ?? [];
  const archivedCount = archivedData?.total ?? 0;

  const archiveMutation = useArchiveIdeaMutation(context);
  const deleteMutation = useDeleteIdeaMutation(context);
  const restoreMutation = useRestoreIdeaMutation(context);
  const toggleFavoriteMutation = useToggleFavoriteMutation(context);

  const error = queryError ? getErrorMessage(queryError, 'Gedanken konnten nicht geladen werden') : null;

  // ============================================
  // PAGE-LOCAL STATE
  // ============================================
  const [selectedPersona] = usePersonaState(context);
  const [textInput, setTextInput] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchResults, setSearchResults] = useState<StructuredIdea[] | null>(null);
  const [filters, setFilters] = useState<AdvancedFilters>({
    types: new Set(),
    categories: new Set(),
    priorities: new Set(),
  });
  const [selectedIdea, setSelectedIdea] = useState<StructuredIdea | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const [aiOverlay, setAIOverlay] = useState<{
    visible: boolean;
    type: ProcessType;
    step: number;
  } | null>(null);

  const displayError = localError || error;
  const isAIActive = processing || isSearching || isRecording || loading;
  const aiActivityType = isRecording ? 'transcribing' : isSearching ? 'searching' : loading ? 'thinking' : 'processing';

  // Clear search/selection when context changes
  useEffect(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchResults(null);
    setSelectedIdea(null);
    setIsSearching(false);
    setLocalError(null);
  }, [context]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleToggleFavorite = useCallback((id: string) => {
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;
    const newFav = !idea.is_favorite;
    toggleFavoriteMutation.mutate(
      { id, isFavorite: newFav },
      {
        onSuccess: () => showToast(newFav ? 'Favorit gesetzt' : 'Favorit entfernt', 'success'),
        onError: () => showToast('Favorit konnte nicht geaendert werden', 'error'),
      }
    );
  }, [ideas, toggleFavoriteMutation]);

  const handleArchiveIdea = useCallback((id: string) => {
    archiveMutation.mutate(id);
  }, [archiveMutation]);

  const handleDeleteIdea = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  const handleRestoreIdea = useCallback((id: string) => {
    restoreMutation.mutate(id, {
      onSuccess: () => showToast('Gedanke wiederhergestellt', 'success'),
    });
  }, [restoreMutation]);

  const handleMoveIdea = useCallback((id: string) => {
    // Remove from cache optimistically - the move endpoint handles the rest
    queryClient.setQueryData<StructuredIdea[]>(
      queryKeys.ideas.list(context),
      (old) => old?.filter(idea => idea.id !== id) ?? []
    );
    setSelectedIdea(null);
  }, [context, queryClient]);

  const handleIdeaClick = useCallback((idea: StructuredIdea) => {
    setSelectedIdea(idea);
  }, []);

  const navigateToIdea = useCallback((ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (idea) {
      setSelectedIdea(idea);
    }
  }, [ideas]);

  // ============================================
  // TEXT SUBMIT (idea creation)
  // ============================================

  const submitText = useCallback(async () => {
    if (!textInput.trim()) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setProcessing(true);
    setLocalError(null);
    setAIOverlay({ visible: true, type: 'text', step: 0 });

    try {
      await new Promise(resolve => setTimeout(resolve, AI_PROCESSING_INITIAL_DELAY_MS));
      setAIOverlay({ visible: true, type: 'text', step: 1 });

      const response = await axios.post(`/api/${context}/voice-memo`, {
        text: textInput,
        persona: selectedPersona,
      });

      const creationData = safeParseResponse(IdeaCreationResponseSchema, response.data, 'submitText');

      setAIOverlay({ visible: true, type: 'text', step: 2 });
      await new Promise(resolve => setTimeout(resolve, AI_PROCESSING_STEP_DELAY_MS));
      setAIOverlay({ visible: true, type: 'text', step: 3 });
      await new Promise(resolve => setTimeout(resolve, AI_PROCESSING_STEP_DELAY_MS));

      const newIdea: StructuredIdea = {
        id: creationData.ideaId,
        title: creationData.structured?.title ?? textInput.slice(0, 60),
        type: (creationData.structured?.type as StructuredIdea['type']) ?? 'idea',
        category: (creationData.structured?.category as StructuredIdea['category']) ?? 'personal',
        priority: (creationData.structured?.priority as StructuredIdea['priority']) ?? 'medium',
        summary: creationData.structured?.summary ?? '',
        next_steps: creationData.structured?.next_steps ?? [],
        context_needed: creationData.structured?.context_needed ?? [],
        keywords: creationData.structured?.keywords ?? [],
        created_at: new Date().toISOString(),
      };

      // Add to React Query cache optimistically
      queryClient.setQueryData<StructuredIdea[]>(
        queryKeys.ideas.list(context),
        (old) => old ? [newIdea, ...old] : [newIdea]
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.stats(context) });

      setTextInput('');
      showToast('Gedanke erfolgreich strukturiert!', 'success');
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err, 'Verarbeitung fehlgeschlagen');
      setLocalError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setProcessing(false);
      setAIOverlay(null);
      isSubmittingRef.current = false;
    }
  }, [textInput, context, selectedPersona, queryClient]);

  // ============================================
  // SEARCH
  // ============================================

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    try {
      const response = await axios.post(`/api/${context}/ideas/search/progressive`, { query, limit: 15 }, { signal: controller.signal });
      const parsed = safeParseResponse(ProgressiveSearchResponseSchema, response.data, 'progressiveSearch');

      const keywordIdeas = parsed.keyword?.ideas ?? [];
      const semanticIdeas = parsed.semantic?.ideas ?? [];
      const merged: StructuredIdea[] = [...keywordIdeas, ...semanticIdeas] as unknown as StructuredIdea[];
      setSearchResults(merged);
    } catch (progressiveErr) {
      if (axios.isCancel(progressiveErr)) return;
      try {
        const controller2 = new AbortController();
        searchAbortRef.current = controller2;
        const response = await axios.post(`/api/${context}/ideas/search`, { query, limit: 20 }, { signal: controller2.signal });
        const parsed = safeParseResponse(SearchResponseSchema, response.data, 'handleSearch');
        setSearchResults(parsed.ideas as unknown as StructuredIdea[]);
      } catch (err: unknown) {
        if (axios.isCancel(err)) return;
        const errorMessage = getErrorMessage(err, 'Suche fehlgeschlagen');
        setLocalError(errorMessage);
        showToast(errorMessage, 'error');
      }
    } finally {
      setIsSearching(false);
    }
  }, [context]);

  const clearSearch = useCallback(() => {
    setSearchResults(null);
  }, []);

  // ============================================
  // RECORD PROCESSED
  // ============================================

  const handleRecordProcessed = useCallback((result: {
    ideaId: string;
    structured: {
      title?: string;
      type?: string;
      category?: string;
      priority?: string;
      summary?: string;
      next_steps?: string[];
      context_needed?: string[];
      keywords?: string[];
    };
    suggestedContext?: AIContext;
    contextConfidence?: number;
  }) => {
    const newIdea: StructuredIdea = {
      id: result.ideaId,
      ...result.structured,
      next_steps: result.structured.next_steps || [],
      context_needed: result.structured.context_needed || [],
      keywords: result.structured.keywords || [],
      created_at: new Date().toISOString(),
    } as StructuredIdea;

    // Add to React Query cache
    queryClient.setQueryData<StructuredIdea[]>(
      queryKeys.ideas.list(context),
      (old) => old ? [newIdea, ...old] : [newIdea]
    );
    queryClient.invalidateQueries({ queryKey: queryKeys.ideas.stats(context) });

    setTextInput('');
  }, [context, queryClient]);

  // ============================================
  // BATCH ACTIONS (selection mode)
  // ============================================

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const confirm = useConfirm();

  const handleSelectIdea = useCallback((id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const handleBatchArchive = useCallback(async () => {
    if (selectedIds.size === 0 || batchLoading) return;
    setBatchLoading(true);
    try {
      await axios.post(`/api/${context}/ideas/batch/archive`, { ids: Array.from(selectedIds) });
      showToast(`${selectedIds.size} Gedanken archiviert`, 'success');
      // Invalidate to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.list(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.archived(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.stats(context) });
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch {
      showToast('Batch-Archivierung fehlgeschlagen', 'error');
    } finally {
      setBatchLoading(false);
    }
  }, [context, selectedIds, batchLoading, queryClient]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0 || batchLoading) return;
    const confirmed = await confirm({
      title: `${selectedIds.size} Gedanken loeschen`,
      message: `Moechtest du wirklich ${selectedIds.size} Gedanken unwiderruflich loeschen?`,
      confirmText: 'Loeschen',
      cancelText: 'Abbrechen',
      variant: 'danger',
    });
    if (!confirmed) return;
    setBatchLoading(true);
    try {
      await axios.post(`/api/${context}/ideas/batch/delete`, { ids: Array.from(selectedIds) });
      showToast(`${selectedIds.size} Gedanken geloescht`, 'success');
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.list(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.stats(context) });
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch {
      showToast('Batch-Loeschung fehlgeschlagen', 'error');
    } finally {
      setBatchLoading(false);
    }
  }, [context, selectedIds, confirm, batchLoading, queryClient]);

  const handleBatchFavorite = useCallback(async () => {
    if (selectedIds.size === 0 || batchLoading) return;
    setBatchLoading(true);
    try {
      await axios.post(`/api/${context}/ideas/batch/favorite`, { ids: Array.from(selectedIds), isFavorite: true });
      showToast(`${selectedIds.size} Gedanken als Favoriten markiert`, 'success');
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.list(context) });
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch {
      showToast('Batch-Favoriten fehlgeschlagen', 'error');
    } finally {
      setBatchLoading(false);
    }
  }, [context, selectedIds, batchLoading, queryClient]);

  // ============================================
  // DERIVED STATE
  // ============================================

  const timeGreeting = useMemo(() => getTimeBasedGreeting(), []);

  const humanGreeting = useMemo(() => {
    const hasIdeas = ideas.length > 0;

    if (!hasIdeas) {
      return {
        greeting: `${timeGreeting.emoji} ${timeGreeting.greeting}`,
        subtext: `Ich bin ${AI_PERSONALITY.name}. ${timeGreeting.subtext}`,
        mood: timeGreeting.mood,
        energyLevel: timeGreeting.energyLevel,
        suggestedAction: timeGreeting.suggestedAction,
      };
    } else {
      const contextGreeting = getContextAwareGreeting({
        ideasCount: ideas.length,
        lastActivityDays: 0,
        streakDays: 0,
        recentCategories: ideas.slice(0, 5).map(i => i.category),
      });

      if (ideas.length < 10) {
        return {
          greeting: `${timeGreeting.emoji} ${timeGreeting.greeting}`,
          subtext: `${ideas.length} Gedanken warten auf dich`,
          mood: timeGreeting.mood,
          energyLevel: timeGreeting.energyLevel,
          suggestedAction: contextGreeting.callToAction,
        };
      } else if (ideas.length < 50) {
        return {
          greeting: `${timeGreeting.emoji} ${timeGreeting.greeting}`,
          subtext: `Wir haben schon ${ideas.length} Gedanken zusammen!`,
          mood: timeGreeting.mood,
          energyLevel: timeGreeting.energyLevel,
          suggestedAction: 'Bereit fuer den naechsten?',
        };
      } else {
        return {
          greeting: `${timeGreeting.emoji} ${timeGreeting.greeting}`,
          subtext: `${ideas.length} Gedanken – ${AI_PERSONALITY.name} kennt dich gut!`,
          mood: timeGreeting.mood,
          energyLevel: timeGreeting.energyLevel,
          suggestedAction: 'Dein digitales Gehirn waechst',
        };
      }
    }
  }, [ideas.length, timeGreeting]);

  const filterCounts = useMemo(() => {
    const types: Record<string, number> = {};
    const categories: Record<string, number> = {};
    const priorities: Record<string, number> = {};

    ideas.forEach((idea) => {
      types[idea.type] = (types[idea.type] || 0) + 1;
      categories[idea.category] = (categories[idea.category] || 0) + 1;
      priorities[idea.priority] = (priorities[idea.priority] || 0) + 1;
    });

    return { types, categories, priorities };
  }, [ideas]);

  // Apply filters
  const filteredIdeas = useMemo(() => {
    let result = searchResults || ideas;

    if (filters.showFavoritesOnly) {
      result = result.filter((idea) => idea.is_favorite);
    }
    if (filters.types.size > 0) {
      result = result.filter((idea) => filters.types.has(idea.type));
    }
    if (filters.categories.size > 0) {
      result = result.filter((idea) => filters.categories.has(idea.category));
    }
    if (filters.priorities.size > 0) {
      result = result.filter((idea) => filters.priorities.has(idea.priority));
    }

    return result;
  }, [ideas, searchResults, filters]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filteredIdeas.map(i => i.id)));
  }, [filteredIdeas]);

  return (
    <div className={`ideas-page${isAIActive ? ' ai-active' : ''}`} data-context={context}>
      <RisingBubbles variant="full" />

      {/* Ideas Tab Navigation */}
      <div className="ideas-tab-bar" role="tablist" aria-label="Gedanken-Ansicht">
        <button
          type="button"
          role="tab"
          aria-selected={activeIdeasTab === 'ideas'}
          className={`ideas-tab ${activeIdeasTab === 'ideas' ? 'active' : ''}`}
          onClick={() => handleTabChange('ideas')}
        >
          <span>💭</span> Gedanken
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeIdeasTab === 'incubator'}
          className={`ideas-tab ${activeIdeasTab === 'incubator' ? 'active' : ''}`}
          onClick={() => handleTabChange('incubator')}
        >
          <span>🧫</span> Inkubator
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeIdeasTab === 'archive'}
          className={`ideas-tab ${activeIdeasTab === 'archive' ? 'active' : ''}`}
          onClick={() => handleTabChange('archive')}
        >
          <span>📥</span> Archiv
          {archivedCount > 0 && <Badge variant="status" size="sm" color="info" className="ideas-tab-badge">{archivedCount}</Badge>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeIdeasTab === 'triage'}
          className={`ideas-tab ${activeIdeasTab === 'triage' ? 'active' : ''}`}
          onClick={() => handleTabChange('triage')}
        >
          <span>📋</span> Sortieren
        </button>
      </div>

      {/* Incubator Tab */}
      {activeIdeasTab === 'incubator' && (
        <Suspense fallback={<SkeletonLoader type="card" count={3} />}>
          <IncubatorPage onBack={() => handleTabChange('ideas')} embedded />
        </Suspense>
      )}

      {/* Archive Tab */}
      {activeIdeasTab === 'archive' && (
        <div className="ideas-archive-content">
          <div className="archive-header-inline">
            <h2>Archivierte Gedanken</h2>
            <Badge variant="status" size="sm" color="neutral">{archivedCount} archiviert</Badge>
          </div>
          {loading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <SkeletonLoader type="card" count={3} />
            </div>
          ) : archivedIdeas.length === 0 ? (
            <EmptyState
              icon={<span>📭</span>}
              title="Archiv ist leer"
              description="Archivierte Gedanken erscheinen hier."
              action={
                <Button variant="primary" size="sm" onClick={() => handleTabChange('ideas')}>
                  Zu deinen Gedanken
                </Button>
              }
            />
          ) : (
            <SmartIdeaList
              ideas={archivedIdeas}
              viewMode={viewMode}
              onIdeaClick={handleIdeaClick}
              onDelete={handleDeleteIdea}
              onRestore={handleRestoreIdea}
              isArchived={true}
              context={context}
            />
          )}
        </div>
      )}

      {/* Triage Tab */}
      {activeIdeasTab === 'triage' && (
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <InboxTriage
            context={context}
            apiBase="/api"
            onBack={() => handleTabChange('ideas')}
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.ideas.list(context) });
              handleTabChange('ideas');
            }}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* Ideas Tab - Original Content */}
      {activeIdeasTab === 'ideas' && <>
      {/* Hero Section with AI Brain */}
      <section
        className={`hero-section ${loading || ideas.length > 0 ? 'compact' : ''}`}
        data-mood={humanGreeting.mood}
        data-energy={humanGreeting.energyLevel}
      >
        <div className="hero-ambient" aria-hidden="true">
          <div className="hero-sparkle" />
          <div className="hero-sparkle" />
          <div className="hero-sparkle" />
          <div className="hero-sparkle" />
          <div className="hero-micro-sparkle" />
          <div className="hero-micro-sparkle" />
        </div>

        <div className={`hero-energy-ring ${isAIActive ? 'active' : ''}`} aria-hidden="true" />

        <div className="hero-brain">
          <AIBrain
            isActive={isAIActive}
            activityType={aiActivityType}
            ideasCount={ideas.length}
            size="large"
          />
        </div>

        <div className="hero-greeting-container">
          <h2 className="hero-greeting">
            {humanGreeting.greeting}
          </h2>
          {humanGreeting.subtext && (
            <p className="hero-subtext">
              {humanGreeting.subtext}
            </p>
          )}
          {humanGreeting.suggestedAction && ideas.length === 0 && (
            <p className="hero-suggested-action">
              {humanGreeting.suggestedAction}
            </p>
          )}
        </div>

        <CommandCenter
          context={context}
          isAIActive={isAIActive}
          currentStepIndex={aiOverlay?.step ?? null}
          textValue={textInput}
          onTextChange={setTextInput}
          onSubmit={submitText}
          onModeChange={setInputMode}
          inputMode={inputMode}
          isProcessing={processing}
          disabled={false}
          renderRecordButton={() => (
            <RecordButton
              onTranscript={(transcript) => setTextInput(transcript)}
              onProcessed={(result) => {
                handleRecordProcessed(result);
              }}
              onRecordingChange={setIsRecording}
              disabled={processing}
              context={context}
              persona={selectedPersona}
            />
          )}
          renderChat={() => (
            <ErrorBoundary fallback={<div className="chat-error-fallback">Chat nicht verfuegbar. <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>Neu laden</Button></div>}>
              <GeneralChat context={context} isCompact={ideas.length > 0} />
            </ErrorBoundary>
          )}
        />
      </section>

      {/* Main Content */}
      <div className="ideas-main">
        <RateLimitBanner />

        {displayError && (
          <div className="error-banner">
            <span>{displayError}</span>
            <Button variant="ghost" size="sm" onClick={() => setLocalError(null)} aria-label="Fehler ausblenden">×</Button>
          </div>
        )}

        <QuickStats
          ideas={ideas}
          onFilterClick={(filterType, value) => {
            const keyMap: Record<string, 'types' | 'categories' | 'priorities'> = {
              type: 'types',
              category: 'categories',
              priority: 'priorities',
            };
            const key = keyMap[filterType];
            if (key) {
              const newSet = new Set(filters[key]);
              if (newSet.has(value)) {
                newSet.delete(value);
              } else {
                newSet.add(value);
              }
              setFilters({ ...filters, [key]: newSet });
            }
          }}
        />

        <SearchFilterBar
          filters={filters}
          onFilterChange={setFilters}
          onSearch={handleSearch}
          onClearSearch={clearSearch}
          isSearching={isSearching}
          searchResults={searchResults ? searchResults.length : null}
          counts={filterCounts}
        />

        <ActiveFiltersBar
          filters={filters}
          onRemoveFilter={(key, value) => {
            const newSet = new Set(filters[key]);
            newSet.delete(value);
            setFilters({ ...filters, [key]: newSet });
          }}
          onClearAll={() => setFilters({
            types: new Set(),
            categories: new Set(),
            priorities: new Set(),
          })}
        />

        <section className="ideas-section">
          <div className="section-header">
            <h2>
              {searchResults ? 'Suchergebnisse' : 'Deine Gedanken'}
              <Badge variant="status" size="sm" color="neutral" className="count">{filteredIdeas.length}</Badge>
            </h2>
            <div className="view-controls">
              <Button
                variant={selectionMode ? 'primary' : 'ghost'}
                size="sm"
                className={`selection-toggle ${selectionMode ? 'active' : ''}`}
                onClick={toggleSelectionMode}
                title={selectionMode ? 'Auswahl beenden' : 'Auswaehlen'}
                aria-label={selectionMode ? 'Auswahl beenden' : 'Mehrere auswaehlen'}
                aria-pressed={selectionMode}
              >
                ☑
              </Button>
              <div className="view-toggle" role="tablist" aria-label="Ansicht waehlen">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="sm"
                  role="tab"
                  className={viewMode === 'grid' ? 'active' : ''}
                  onClick={() => setViewMode('grid')}
                  title="Rasteransicht"
                  aria-label="Rasteransicht"
                  aria-selected={viewMode === 'grid'}
                  tabIndex={viewMode === 'grid' ? 0 : -1}
                >
                  ⊞
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  role="tab"
                  className={viewMode === 'list' ? 'active' : ''}
                  onClick={() => setViewMode('list')}
                  title="Listenansicht"
                  aria-label="Listenansicht"
                  aria-selected={viewMode === 'list'}
                  tabIndex={viewMode === 'list' ? 0 : -1}
                >
                  ☰
                </Button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <SkeletonLoader type="card" count={3} />
            </div>
          ) : filteredIdeas.length === 0 ? (
            filters.types.size > 0 || filters.categories.size > 0 || filters.priorities.size > 0 ? (
              <EmptyState
                icon={<span>🔍</span>}
                title={EMPTY_STATE_MESSAGES.search.title}
                description={`${EMPTY_STATE_MESSAGES.search.description} ${EMPTY_STATE_MESSAGES.search.encouragement}`}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setFilters({
                      types: new Set(),
                      categories: new Set(),
                      priorities: new Set(),
                    })}
                  >
                    Filter zuruecksetzen
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="Noch keine Gedanken"
                description="Nutze das Eingabefeld oben, um deinen ersten Gedanken festzuhalten."
              />
            )
          ) : (
            <>
              <SmartIdeaList
                ideas={filteredIdeas}
                viewMode={viewMode}
                onIdeaClick={selectionMode ? undefined : handleIdeaClick}
                onDelete={handleDeleteIdea}
                onArchive={handleArchiveIdea}
                onMove={handleMoveIdea}
                onToggleFavorite={handleToggleFavorite}
                context={context}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onSelect={handleSelectIdea}
              />
              <IdeaBatchActionBar
                selectedCount={selectedIds.size}
                totalCount={filteredIdeas.length}
                onSelectAll={handleSelectAll}
                onClear={handleClearSelection}
                onBatchArchive={handleBatchArchive}
                onBatchDelete={handleBatchDelete}
                onBatchFavorite={handleBatchFavorite}
                disabled={batchLoading}
              />
            </>
          )}
        </section>
      </div>

      {/* Detail Modal */}
      {selectedIdea && (
        <Suspense fallback={null}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="idea-detail-title"
            aria-describedby="idea-detail-summary"
          >
            <IdeaDetail
              idea={selectedIdea}
              onClose={() => setSelectedIdea(null)}
              onNavigate={navigateToIdea}
              onMove={handleMoveIdea}
            />
          </div>
        </Suspense>
      )}

      {/* AI Processing Overlay */}
      {aiOverlay?.visible && (
        <AIProcessingOverlay
          isVisible={aiOverlay.visible}
          processType={aiOverlay.type}
          currentStepIndex={aiOverlay.step}
        />
      )}
      </>}
    </div>
  );
};

export const IdeasPage = memo(IdeasPageComponent);
export default IdeasPage;
