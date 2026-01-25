/**
 * App Reducer Hook
 *
 * Centralized state management using useReducer pattern.
 * Replaces 21 individual useState hooks with a single, predictable state tree.
 */

import { useReducer, useMemo } from 'react';
import type { AppState, AppAction, AIOverlayState } from '../types/appState';
import { createInitialState } from '../types/appState';
import type { StructuredIdea, ApiStatus, Page } from '../types/idea';
import type { Filters } from '../components/SearchFilterBar';
import type { InputMode } from '../components/CommandCenter';

/**
 * App Reducer
 * Pure function that handles all state transitions
 */
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // Navigation
    case 'SET_PAGE':
      return { ...state, currentPage: action.payload };

    // Ideas CRUD
    case 'SET_IDEAS':
      return { ...state, ideas: action.payload };

    case 'ADD_IDEA':
      return { ...state, ideas: [action.payload, ...state.ideas] };

    case 'REMOVE_IDEA':
      return {
        ...state,
        ideas: state.ideas.filter((i) => i.id !== action.payload),
      };

    case 'MERGE_IDEAS': {
      const { serverIdeas, recentCutoff } = action.payload;
      const serverIdeaIds = new Set(serverIdeas.map((i) => i.id));
      const recentLocalIdeas = state.ideas.filter(
        (localIdea) =>
          !serverIdeaIds.has(localIdea.id) &&
          localIdea.created_at > recentCutoff
      );
      return {
        ...state,
        ideas:
          recentLocalIdeas.length > 0
            ? [...recentLocalIdeas, ...serverIdeas]
            : serverIdeas,
      };
    }

    // Archived ideas
    case 'SET_ARCHIVED_IDEAS':
      return { ...state, archivedIdeas: action.payload };

    case 'SET_ARCHIVED_COUNT':
      return { ...state, archivedCount: action.payload };

    case 'INCREMENT_ARCHIVED_COUNT':
      return { ...state, archivedCount: state.archivedCount + 1 };

    case 'DECREMENT_ARCHIVED_COUNT':
      return { ...state, archivedCount: Math.max(0, state.archivedCount - 1) };

    case 'ARCHIVE_IDEA':
      return {
        ...state,
        ideas: state.ideas.filter((i) => i.id !== action.payload),
        archivedCount: state.archivedCount + 1,
      };

    case 'RESTORE_IDEA': {
      const restored = state.archivedIdeas.find((i) => i.id === action.payload);
      if (!restored) return state;
      return {
        ...state,
        ideas: [restored, ...state.ideas],
        archivedIdeas: state.archivedIdeas.filter(
          (i) => i.id !== action.payload
        ),
        archivedCount: Math.max(0, state.archivedCount - 1),
      };
    }

    // Loading states
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_PROCESSING':
      return { ...state, processing: action.payload };

    case 'SET_IS_SEARCHING':
      return { ...state, isSearching: action.payload };

    case 'SET_IS_RECORDING':
      return { ...state, isRecording: action.payload };

    // Error handling
    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    // API Status
    case 'SET_API_STATUS':
      return { ...state, apiStatus: action.payload };

    // User input
    case 'SET_TEXT_INPUT':
      return { ...state, textInput: action.payload };

    case 'SET_INPUT_MODE':
      return { ...state, inputMode: action.payload };

    case 'CLEAR_TEXT_INPUT':
      return { ...state, textInput: '' };

    // Search & Filter
    case 'SET_SEARCH_RESULTS':
      return { ...state, searchResults: action.payload };

    case 'SET_FILTERS':
      return { ...state, filters: action.payload };

    case 'CLEAR_SEARCH':
      return { ...state, searchResults: null };

    case 'TOGGLE_FILTER': {
      const { filterType, value } = action.payload;
      return {
        ...state,
        filters: {
          ...state.filters,
          [filterType]: state.filters[filterType] === value ? null : value,
        },
      };
    }

    // UI State
    case 'SET_SELECTED_IDEA':
      return { ...state, selectedIdea: action.payload };

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'SET_SHOW_ONBOARDING':
      return { ...state, showOnboarding: action.payload };

    // AI Overlay
    case 'SET_AI_OVERLAY':
      return { ...state, aiOverlay: action.payload };

    case 'UPDATE_AI_OVERLAY_STEP':
      if (!state.aiOverlay) return state;
      return {
        ...state,
        aiOverlay: { ...state.aiOverlay, step: action.payload },
      };

    // Batch actions
    case 'IDEA_SUBMITTED_SUCCESS':
      return {
        ...state,
        ideas: [action.payload, ...state.ideas],
        textInput: '',
        processing: false,
        aiOverlay: null,
      };

    case 'RESET_STATE':
      return createInitialState();

    default:
      return state;
  }
}

/**
 * Action Creators
 * Type-safe action creators for cleaner code
 */
export const actions = {
  // Navigation
  setPage: (page: Page): AppAction => ({ type: 'SET_PAGE', payload: page }),

  // Ideas
  setIdeas: (ideas: StructuredIdea[]): AppAction => ({
    type: 'SET_IDEAS',
    payload: ideas,
  }),
  addIdea: (idea: StructuredIdea): AppAction => ({
    type: 'ADD_IDEA',
    payload: idea,
  }),
  removeIdea: (id: string): AppAction => ({ type: 'REMOVE_IDEA', payload: id }),
  mergeIdeas: (
    serverIdeas: StructuredIdea[],
    recentCutoff: string
  ): AppAction => ({
    type: 'MERGE_IDEAS',
    payload: { serverIdeas, recentCutoff },
  }),

  // Archive
  setArchivedIdeas: (ideas: StructuredIdea[]): AppAction => ({
    type: 'SET_ARCHIVED_IDEAS',
    payload: ideas,
  }),
  setArchivedCount: (count: number): AppAction => ({
    type: 'SET_ARCHIVED_COUNT',
    payload: count,
  }),
  archiveIdea: (id: string): AppAction => ({
    type: 'ARCHIVE_IDEA',
    payload: id,
  }),
  restoreIdea: (id: string): AppAction => ({
    type: 'RESTORE_IDEA',
    payload: id,
  }),

  // Loading
  setLoading: (loading: boolean): AppAction => ({
    type: 'SET_LOADING',
    payload: loading,
  }),
  setProcessing: (processing: boolean): AppAction => ({
    type: 'SET_PROCESSING',
    payload: processing,
  }),
  setIsSearching: (searching: boolean): AppAction => ({
    type: 'SET_IS_SEARCHING',
    payload: searching,
  }),
  setIsRecording: (recording: boolean): AppAction => ({
    type: 'SET_IS_RECORDING',
    payload: recording,
  }),

  // Error
  setError: (error: string | null): AppAction => ({
    type: 'SET_ERROR',
    payload: error,
  }),
  clearError: (): AppAction => ({ type: 'CLEAR_ERROR' }),

  // API
  setApiStatus: (status: ApiStatus | null): AppAction => ({
    type: 'SET_API_STATUS',
    payload: status,
  }),

  // Input
  setTextInput: (text: string): AppAction => ({
    type: 'SET_TEXT_INPUT',
    payload: text,
  }),
  setInputMode: (mode: InputMode): AppAction => ({
    type: 'SET_INPUT_MODE',
    payload: mode,
  }),
  clearTextInput: (): AppAction => ({ type: 'CLEAR_TEXT_INPUT' }),

  // Search & Filter
  setSearchResults: (results: StructuredIdea[] | null): AppAction => ({
    type: 'SET_SEARCH_RESULTS',
    payload: results,
  }),
  setFilters: (filters: Filters): AppAction => ({
    type: 'SET_FILTERS',
    payload: filters,
  }),
  clearSearch: (): AppAction => ({ type: 'CLEAR_SEARCH' }),
  toggleFilter: (
    filterType: keyof Filters,
    value: string | null
  ): AppAction => ({
    type: 'TOGGLE_FILTER',
    payload: { filterType, value },
  }),

  // UI
  setSelectedIdea: (idea: StructuredIdea | null): AppAction => ({
    type: 'SET_SELECTED_IDEA',
    payload: idea,
  }),
  setViewMode: (mode: 'grid' | 'list'): AppAction => ({
    type: 'SET_VIEW_MODE',
    payload: mode,
  }),
  setShowOnboarding: (show: boolean): AppAction => ({
    type: 'SET_SHOW_ONBOARDING',
    payload: show,
  }),

  // AI Overlay
  setAIOverlay: (overlay: AIOverlayState | null): AppAction => ({
    type: 'SET_AI_OVERLAY',
    payload: overlay,
  }),
  updateAIOverlayStep: (step: number): AppAction => ({
    type: 'UPDATE_AI_OVERLAY_STEP',
    payload: step,
  }),

  // Batch
  ideaSubmittedSuccess: (idea: StructuredIdea): AppAction => ({
    type: 'IDEA_SUBMITTED_SUCCESS',
    payload: idea,
  }),
};

/**
 * Custom hook that provides the app reducer with bound action dispatchers
 */
export function useAppReducer(initialShowOnboarding: boolean) {
  const [state, dispatch] = useReducer(
    appReducer,
    createInitialState({ showOnboarding: initialShowOnboarding })
  );

  // Memoized bound action dispatchers
  const boundActions = useMemo(
    () => ({
      setPage: (page: Page) => dispatch(actions.setPage(page)),
      setIdeas: (ideas: StructuredIdea[]) => dispatch(actions.setIdeas(ideas)),
      addIdea: (idea: StructuredIdea) => dispatch(actions.addIdea(idea)),
      removeIdea: (id: string) => dispatch(actions.removeIdea(id)),
      mergeIdeas: (serverIdeas: StructuredIdea[], recentCutoff: string) =>
        dispatch(actions.mergeIdeas(serverIdeas, recentCutoff)),
      setArchivedIdeas: (ideas: StructuredIdea[]) =>
        dispatch(actions.setArchivedIdeas(ideas)),
      setArchivedCount: (count: number) =>
        dispatch(actions.setArchivedCount(count)),
      archiveIdea: (id: string) => dispatch(actions.archiveIdea(id)),
      restoreIdea: (id: string) => dispatch(actions.restoreIdea(id)),
      setLoading: (loading: boolean) => dispatch(actions.setLoading(loading)),
      setProcessing: (processing: boolean) =>
        dispatch(actions.setProcessing(processing)),
      setIsSearching: (searching: boolean) =>
        dispatch(actions.setIsSearching(searching)),
      setIsRecording: (recording: boolean) =>
        dispatch(actions.setIsRecording(recording)),
      setError: (error: string | null) => dispatch(actions.setError(error)),
      clearError: () => dispatch(actions.clearError()),
      setApiStatus: (status: ApiStatus | null) =>
        dispatch(actions.setApiStatus(status)),
      setTextInput: (text: string) => dispatch(actions.setTextInput(text)),
      setInputMode: (mode: InputMode) => dispatch(actions.setInputMode(mode)),
      clearTextInput: () => dispatch(actions.clearTextInput()),
      setSearchResults: (results: StructuredIdea[] | null) =>
        dispatch(actions.setSearchResults(results)),
      setFilters: (filters: Filters) => dispatch(actions.setFilters(filters)),
      clearSearch: () => dispatch(actions.clearSearch()),
      toggleFilter: (filterType: keyof Filters, value: string | null) =>
        dispatch(actions.toggleFilter(filterType, value)),
      setSelectedIdea: (idea: StructuredIdea | null) =>
        dispatch(actions.setSelectedIdea(idea)),
      setViewMode: (mode: 'grid' | 'list') =>
        dispatch(actions.setViewMode(mode)),
      setShowOnboarding: (show: boolean) =>
        dispatch(actions.setShowOnboarding(show)),
      setAIOverlay: (overlay: AIOverlayState | null) =>
        dispatch(actions.setAIOverlay(overlay)),
      updateAIOverlayStep: (step: number) =>
        dispatch(actions.updateAIOverlayStep(step)),
      ideaSubmittedSuccess: (idea: StructuredIdea) =>
        dispatch(actions.ideaSubmittedSuccess(idea)),
    }),
    []
  );

  return { state, dispatch, ...boundActions };
}

export type AppDispatch = ReturnType<typeof useAppReducer>;
