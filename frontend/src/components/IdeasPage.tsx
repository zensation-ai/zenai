/**
 * IdeasPage - Main Ideas View
 *
 * Extracted from App.tsx to separate rendering from state management.
 * Contains: Hero section, CommandCenter, search/filters, ideas list, detail modal.
 */

import { lazy, Suspense, useMemo, memo, useState, useEffect, useCallback } from 'react';
import { useTabNavigation } from '../hooks/useTabNavigation';
import axios from 'axios';
import type { StructuredIdea } from '../types';
import type { AIContext } from './ContextSwitcher';
import type { AdvancedFilters } from './SearchFilterBar';
import type { ProcessType } from './AIProcessingOverlay';
import type { InputMode } from './CommandCenter';

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
// AIProcessingOverlay is now rendered globally in App.tsx
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
import './IdeasPage.css';

const IdeaDetail = lazy(() => import('./IdeaDetail').then(m => ({ default: m.IdeaDetail })));
const InboxTriage = lazy(() => import('./InboxTriage').then(m => ({ default: m.InboxTriage })));
const IncubatorPage = lazy(() => import('./IncubatorPage').then(m => ({ default: m.IncubatorPage })));

interface IdeasPageProps {
  context: AIContext;
  selectedPersona: string | null;
  ideas: StructuredIdea[];
  loading: boolean;
  error: string | null;
  processing: boolean;
  isSearching: boolean;
  isAIActive: boolean;
  aiActivityType: 'transcribing' | 'searching' | 'thinking' | 'processing';
  aiOverlay: { visible: boolean; type: ProcessType; step: number } | null;
  textInput: string;
  onTextChange: (text: string) => void;
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  onSubmitText: () => void;
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  onDeleteIdea: (id: string) => void;
  onArchiveIdea: (id: string) => void;
  onMoveIdea?: (id: string, targetContext: AIContext) => void;
  onRecordingChange: (recording: boolean) => void;
  onRecordProcessed: (result: {
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
  }) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  searchResults: StructuredIdea[] | null;
  filters: AdvancedFilters;
  onFilterChange: (filters: AdvancedFilters) => void;
  onSetError: (error: string | null) => void;
  selectedIdea: StructuredIdea | null;
  onIdeaClick: (idea: StructuredIdea) => void;
  onCloseDetail: () => void;
  onNavigateToIdea: (ideaId: string) => void;
  // Archive integration
  archivedIdeas?: StructuredIdea[];
  archivedCount?: number;
  onRestore?: (id: string) => void;
  // Triage integration
  onTriageComplete?: () => void;
  initialTab?: IdeasTab;
  onIdeaCreated?: () => void;
}

type IdeasTab = 'ideas' | 'incubator' | 'archive' | 'triage';

const IdeasPageComponent: React.FC<IdeasPageProps> = ({
  context,
  selectedPersona,
  ideas,
  loading,
  error,
  processing,
  isSearching,
  isAIActive,
  aiActivityType,
  aiOverlay,
  textInput,
  onTextChange,
  inputMode,
  onInputModeChange,
  onSubmitText,
  onSearch,
  onClearSearch,
  onDeleteIdea,
  onArchiveIdea,
  onMoveIdea,
  onRecordingChange,
  onRecordProcessed,
  viewMode,
  onViewModeChange,
  searchResults,
  filters,
  onFilterChange,
  onSetError,
  selectedIdea,
  onIdeaClick,
  onCloseDetail,
  onNavigateToIdea,
  archivedIdeas = [],
  archivedCount = 0,
  onRestore,
  onTriageComplete,
  initialTab = 'ideas',
}) => {
  const VALID_TABS = ['ideas', 'incubator', 'archive', 'triage'] as const;
  const { activeTab: activeIdeasTab, handleTabChange } = useTabNavigation<IdeasTab>({
    initialTab,
    validTabs: VALID_TABS,
    defaultTab: 'ideas',
    basePath: '/ideas',
    rootTab: 'ideas',
  });

  // Local favorite overrides for optimistic UI updates
  const [favoriteOverrides, setFavoriteOverrides] = useState<Map<string, boolean>>(new Map());
  const [favoriteInFlight, setFavoriteInFlight] = useState<Set<string>>(new Set());

  // Reset overrides when ideas change (e.g., after refetch)
  useEffect(() => {
    setFavoriteOverrides(new Map());
  }, [ideas]);

  const handleToggleFavorite = useCallback(async (id: string) => {
    // Prevent concurrent requests for the same idea
    if (favoriteInFlight.has(id)) return;

    // Find current state (check override first, then original)
    const idea = ideas.find(i => i.id === id);
    const currentFav = favoriteOverrides.has(id) ? favoriteOverrides.get(id) : idea?.is_favorite;
    const newFav = !currentFav;

    // Mark as in-flight
    setFavoriteInFlight(prev => new Set(prev).add(id));
    // Optimistic update
    setFavoriteOverrides(prev => new Map(prev).set(id, newFav));

    try {
      await axios.put(`/api/${context}/ideas/${id}/favorite`);
      showToast(newFav ? 'Favorit gesetzt' : 'Favorit entfernt', 'success');
    } catch {
      // Revert optimistic update
      setFavoriteOverrides(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      showToast('Favorit konnte nicht geändert werden', 'error');
    } finally {
      setFavoriteInFlight(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [context, ideas, favoriteOverrides, favoriteInFlight]);

  // Selection mode for bulk actions
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
      if (prev) setSelectedIds(new Set()); // Clear on exit
      return !prev;
    });
  }, []);

  const handleBatchArchive = useCallback(async () => {
    if (selectedIds.size === 0 || batchLoading) return;
    setBatchLoading(true);
    try {
      await axios.post(`/api/${context}/ideas/batch/archive`, { ids: Array.from(selectedIds) });
      showToast(`${selectedIds.size} Gedanken archiviert`, 'success');
      selectedIds.forEach(id => onArchiveIdea(id));
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch {
      showToast('Batch-Archivierung fehlgeschlagen', 'error');
    } finally {
      setBatchLoading(false);
    }
  }, [context, selectedIds, onArchiveIdea, batchLoading]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0 || batchLoading) return;
    const confirmed = await confirm({
      title: `${selectedIds.size} Gedanken löschen`,
      message: `Möchtest du wirklich ${selectedIds.size} Gedanken unwiderruflich löschen?`,
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      variant: 'danger',
    });
    if (!confirmed) return;
    setBatchLoading(true);
    try {
      await axios.post(`/api/${context}/ideas/batch/delete`, { ids: Array.from(selectedIds) });
      showToast(`${selectedIds.size} Gedanken gelöscht`, 'success');
      selectedIds.forEach(id => onDeleteIdea(id));
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch {
      showToast('Batch-Löschung fehlgeschlagen', 'error');
    } finally {
      setBatchLoading(false);
    }
  }, [context, selectedIds, confirm, onDeleteIdea, batchLoading]);

  const handleBatchFavorite = useCallback(async () => {
    if (selectedIds.size === 0 || batchLoading) return;
    setBatchLoading(true);
    try {
      await axios.post(`/api/${context}/ideas/batch/favorite`, { ids: Array.from(selectedIds), isFavorite: true });
      showToast(`${selectedIds.size} Gedanken als Favoriten markiert`, 'success');
      setFavoriteOverrides(prev => {
        const next = new Map(prev);
        selectedIds.forEach(id => next.set(id, true));
        return next;
      });
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch {
      showToast('Batch-Favoriten fehlgeschlagen', 'error');
    } finally {
      setBatchLoading(false);
    }
  }, [context, selectedIds, batchLoading]);

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
          suggestedAction: 'Bereit für den nächsten?',
        };
      } else {
        return {
          greeting: `${timeGreeting.emoji} ${timeGreeting.greeting}`,
          subtext: `${ideas.length} Gedanken – ${AI_PERSONALITY.name} kennt dich gut!`,
          mood: timeGreeting.mood,
          energyLevel: timeGreeting.energyLevel,
          suggestedAction: 'Dein digitales Gehirn wächst',
        };
      }
    }
  }, [ideas.length, timeGreeting]);

  // Calculate filter counts
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

  // Apply favorite overrides to ideas for rendering
  const ideasWithFavorites = useMemo(() => {
    if (favoriteOverrides.size === 0) return ideas;
    return ideas.map(idea =>
      favoriteOverrides.has(idea.id)
        ? { ...idea, is_favorite: favoriteOverrides.get(idea.id) }
        : idea
    );
  }, [ideas, favoriteOverrides]);

  // Apply filters
  const filteredIdeas = useMemo(() => {
    let result = searchResults || ideasWithFavorites;

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
  }, [ideasWithFavorites, searchResults, filters]);

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
          {archivedCount > 0 && <span className="ideas-tab-badge">{archivedCount}</span>}
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
            <span className="archive-count-badge">{archivedCount} archiviert</span>
          </div>
          {loading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <SkeletonLoader type="card" count={3} />
            </div>
          ) : archivedIdeas.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <h3>Archiv ist leer</h3>
              <p>Archivierte Gedanken erscheinen hier.</p>
              <button type="button" className="empty-state-cta" onClick={() => handleTabChange('ideas')}>
                Zu deinen Gedanken
              </button>
            </div>
          ) : (
            <SmartIdeaList
              ideas={archivedIdeas}
              viewMode={viewMode}
              onIdeaClick={onIdeaClick}
              onDelete={onDeleteIdea}
              onRestore={onRestore}
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
              if (onTriageComplete) onTriageComplete();
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
          onTextChange={onTextChange}
          onSubmit={onSubmitText}
          onModeChange={onInputModeChange}
          inputMode={inputMode}
          isProcessing={processing}
          disabled={false}
          renderRecordButton={() => (
            <RecordButton
              onTranscript={(transcript) => onTextChange(transcript)}
              onProcessed={(result) => {
                onRecordProcessed(result);
              }}
              onRecordingChange={onRecordingChange}
              disabled={processing}
              context={context}
              persona={selectedPersona}
            />
          )}
          renderChat={() => (
            <ErrorBoundary fallback={<div className="chat-error-fallback">Chat nicht verfügbar. <button type="button" onClick={() => window.location.reload()}>Neu laden</button></div>}>
              <GeneralChat context={context} isCompact={ideas.length > 0} />
            </ErrorBoundary>
          )}
        />
      </section>

      {/* Main Content */}
      <div className="ideas-main">
        <RateLimitBanner />

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button type="button" onClick={() => onSetError(null)}>×</button>
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
              onFilterChange({ ...filters, [key]: newSet });
            }
          }}
        />

        <SearchFilterBar
          filters={filters}
          onFilterChange={onFilterChange}
          onSearch={onSearch}
          onClearSearch={onClearSearch}
          isSearching={isSearching}
          searchResults={searchResults ? searchResults.length : null}
          counts={filterCounts}
        />

        <ActiveFiltersBar
          filters={filters}
          onRemoveFilter={(key, value) => {
            const newSet = new Set(filters[key]);
            newSet.delete(value);
            onFilterChange({ ...filters, [key]: newSet });
          }}
          onClearAll={() => onFilterChange({
            types: new Set(),
            categories: new Set(),
            priorities: new Set(),
          })}
        />

        <section className="ideas-section">
          <div className="section-header">
            <h2>
              {searchResults ? 'Suchergebnisse' : 'Deine Gedanken'}
              <span className="count">{filteredIdeas.length}</span>
            </h2>
            <div className="view-controls">
              <button
                type="button"
                className={`selection-toggle neuro-press-effect neuro-focus-ring ${selectionMode ? 'active' : ''}`}
                onClick={toggleSelectionMode}
                title={selectionMode ? 'Auswahl beenden' : 'Auswählen'}
                aria-label={selectionMode ? 'Auswahl beenden' : 'Mehrere auswählen'}
                aria-pressed={selectionMode}
              >
                ☑
              </button>
              <div className="view-toggle" role="tablist" aria-label="Ansicht wählen">
                <button
                  type="button"
                  role="tab"
                  className={viewMode === 'grid' ? 'active' : ''}
                  onClick={() => onViewModeChange('grid')}
                  title="Rasteransicht"
                  aria-label="Rasteransicht"
                  aria-selected={viewMode === 'grid'}
                  tabIndex={viewMode === 'grid' ? 0 : -1}
                >
                  ⊞
                </button>
                <button
                  type="button"
                  role="tab"
                  className={viewMode === 'list' ? 'active' : ''}
                  onClick={() => onViewModeChange('list')}
                  title="Listenansicht"
                  aria-label="Listenansicht"
                  aria-selected={viewMode === 'list'}
                  tabIndex={viewMode === 'list' ? 0 : -1}
                >
                  ☰
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <SkeletonLoader type="card" count={3} />
            </div>
          ) : filteredIdeas.length === 0 ? (
            <div className="empty-state" role="status">
              {filters.types.size > 0 || filters.categories.size > 0 || filters.priorities.size > 0 ? (
                <>
                  <span className="empty-icon" aria-hidden="true">🔍</span>
                  <h3>{EMPTY_STATE_MESSAGES.search.title}</h3>
                  <p>{EMPTY_STATE_MESSAGES.search.description}</p>
                  <span className="empty-encouragement">{EMPTY_STATE_MESSAGES.search.encouragement}</span>
                  <div className="empty-state-actions">
                    <button
                      type="button"
                      className="empty-state-cta"
                      onClick={() => onFilterChange({
                        types: new Set(),
                        categories: new Set(),
                        priorities: new Set(),
                      })}
                    >
                      Filter zurücksetzen
                    </button>
                  </div>
                </>
              ) : (
                <p className="empty-state-minimal">Nutze das Eingabefeld oben, um deinen ersten Gedanken festzuhalten.</p>
              )}
            </div>
          ) : (
            <>
              <SmartIdeaList
                ideas={filteredIdeas}
                viewMode={viewMode}
                onIdeaClick={selectionMode ? undefined : onIdeaClick}
                onDelete={onDeleteIdea}
                onArchive={onArchiveIdea}
                onMove={onMoveIdea}
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
              onClose={onCloseDetail}
              onNavigate={onNavigateToIdea}
              onMove={onMoveIdea}
            />
          </div>
        </Suspense>
      )}

      {/* AI Processing Overlay is now rendered globally in App.tsx */}
      </>}
    </div>
  );
};

export const IdeasPage = memo(IdeasPageComponent);
export default IdeasPage;
