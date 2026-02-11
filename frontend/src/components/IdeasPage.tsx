/**
 * IdeasPage - Main Ideas View
 *
 * Extracted from App.tsx to separate rendering from state management.
 * Contains: Hero section, CommandCenter, search/filters, ideas list, detail modal.
 */

import { lazy, Suspense, useMemo, memo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { SkeletonLoader } from './SkeletonLoader';
import { ErrorBoundary } from './ErrorBoundary';
import { GeneralChat } from './GeneralChat';
import { AIProcessingOverlay } from './AIProcessingOverlay';
import { CommandCenter } from './CommandCenter';
import { RateLimitBanner } from './RateLimitBanner';
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
  const navigate = useNavigate();
  const [activeIdeasTab, setActiveIdeasTab] = useState<IdeasTab>(initialTab || 'ideas');

  useEffect(() => {
    const VALID_TABS: IdeasTab[] = ['ideas', 'incubator', 'archive', 'triage'];
    setActiveIdeasTab(VALID_TABS.includes(initialTab as IdeasTab) ? initialTab as IdeasTab : 'ideas');
  }, [initialTab]);

  const handleTabChange = useCallback((tab: IdeasTab) => {
    setActiveIdeasTab(tab);
    if (tab === 'ideas') {
      navigate('/ideas', { replace: true });
    } else {
      navigate(`/ideas/${tab}`, { replace: true });
    }
  }, [navigate]);
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

  // Apply filters
  const filteredIdeas = useMemo(() => {
    let result = searchResults || ideas;

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

  return (
    <div className="ideas-page" data-context={context}>
      {/* Animated Organic Background */}
      <div className="ambient-background" aria-hidden="true">
        <div className="blob-1" />
        <div className="blob-2" />
        <div className="blob-3" />
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />
        <div className="particle particle-5" />
      </div>

      {/* Ideas Tab Navigation */}
      <div className="ideas-tab-bar" role="tablist" aria-label="Gedanken-Ansicht">
        <button
          type="button"
          role="tab"
          aria-current={activeIdeasTab === 'ideas' ? 'true' : undefined}
          className={`ideas-tab ${activeIdeasTab === 'ideas' ? 'active' : ''}`}
          onClick={() => handleTabChange('ideas')}
        >
          <span>💭</span> Gedanken
        </button>
        <button
          type="button"
          role="tab"
          aria-current={activeIdeasTab === 'incubator' ? 'true' : undefined}
          className={`ideas-tab ${activeIdeasTab === 'incubator' ? 'active' : ''}`}
          onClick={() => handleTabChange('incubator')}
        >
          <span>🧫</span> Inkubator
        </button>
        <button
          type="button"
          role="tab"
          aria-current={activeIdeasTab === 'archive' ? 'true' : undefined}
          className={`ideas-tab ${activeIdeasTab === 'archive' ? 'active' : ''}`}
          onClick={() => handleTabChange('archive')}
        >
          <span>📥</span> Archiv
          {archivedCount > 0 && <span className="ideas-tab-badge">{archivedCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-current={activeIdeasTab === 'triage' ? 'true' : undefined}
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
            <SmartIdeaList
              ideas={filteredIdeas}
              viewMode={viewMode}
              onIdeaClick={onIdeaClick}
              onDelete={onDeleteIdea}
              onArchive={onArchiveIdea}
              onMove={onMoveIdea}
              context={context}
            />
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
