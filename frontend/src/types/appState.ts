/**
 * App State Types
 *
 * Centralized type definitions for the application state.
 * Used with useReducer for predictable state management.
 */

import type { StructuredIdea, ApiStatus, Page } from './idea';
import type { AdvancedFilters } from '../components/SearchFilterBar';

// Re-export for backwards compatibility
export type Filters = AdvancedFilters;
import type { InputMode } from '../components/CommandCenter';
import type { ProcessType } from '../components/AIProcessingOverlay';

/**
 * AI Overlay State
 * Tracks the visibility and progress of AI processing overlay
 */
export interface AIOverlayState {
  visible: boolean;
  type: ProcessType;
  step: number;
}

/**
 * Main Application State
 * All state that was previously spread across 21 useState hooks
 */
export interface AppState {
  // Navigation
  currentPage: Page;

  // Ideas data
  ideas: StructuredIdea[];
  archivedIdeas: StructuredIdea[];
  archivedCount: number;

  // Loading & Processing states
  loading: boolean;
  processing: boolean;
  isSearching: boolean;
  isRecording: boolean;

  // Error handling
  error: string | null;

  // API status
  apiStatus: ApiStatus | null;

  // User input
  textInput: string;
  inputMode: InputMode;

  // Search & Filter
  searchResults: StructuredIdea[] | null;
  filters: AdvancedFilters;

  // UI state
  selectedIdea: StructuredIdea | null;
  viewMode: 'grid' | 'list';
  showOnboarding: boolean;

  // AI Processing Overlay
  aiOverlay: AIOverlayState | null;
}

/**
 * Initial state factory
 * Creates a fresh initial state with optional overrides
 */
export const createInitialState = (
  overrides?: Partial<AppState>
): AppState => ({
  // Navigation
  currentPage: 'ideas',

  // Ideas data
  ideas: [],
  archivedIdeas: [],
  archivedCount: 0,

  // Loading & Processing states - start with loading=true to prevent layout shift
  loading: true,
  processing: false,
  isSearching: false,
  isRecording: false,

  // Error handling
  error: null,

  // API status
  apiStatus: null,

  // User input
  textInput: '',
  inputMode: 'voice',

  // Search & Filter
  searchResults: null,
  filters: { types: new Set(), categories: new Set(), priorities: new Set() },

  // UI state
  selectedIdea: null,
  viewMode: 'grid',
  showOnboarding: false,

  // AI Processing Overlay
  aiOverlay: null,

  // Apply any overrides
  ...overrides,
});

/**
 * Action Types
 * Discriminated union for type-safe actions
 */
export type AppAction =
  // Navigation
  | { type: 'SET_PAGE'; payload: Page }

  // Ideas CRUD
  | { type: 'SET_IDEAS'; payload: StructuredIdea[] }
  | { type: 'ADD_IDEA'; payload: StructuredIdea }
  | { type: 'REMOVE_IDEA'; payload: string }
  | { type: 'MERGE_IDEAS'; payload: { serverIdeas: StructuredIdea[]; recentCutoff: string } }

  // Archived ideas
  | { type: 'SET_ARCHIVED_IDEAS'; payload: StructuredIdea[] }
  | { type: 'SET_ARCHIVED_COUNT'; payload: number }
  | { type: 'INCREMENT_ARCHIVED_COUNT' }
  | { type: 'DECREMENT_ARCHIVED_COUNT' }
  | { type: 'ARCHIVE_IDEA'; payload: string }
  | { type: 'RESTORE_IDEA'; payload: string }

  // Loading states
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_IS_SEARCHING'; payload: boolean }
  | { type: 'SET_IS_RECORDING'; payload: boolean }

  // Error handling
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }

  // API Status
  | { type: 'SET_API_STATUS'; payload: ApiStatus | null }

  // User input
  | { type: 'SET_TEXT_INPUT'; payload: string }
  | { type: 'SET_INPUT_MODE'; payload: InputMode }
  | { type: 'CLEAR_TEXT_INPUT' }

  // Search & Filter
  | { type: 'SET_SEARCH_RESULTS'; payload: StructuredIdea[] | null }
  | { type: 'SET_FILTERS'; payload: AdvancedFilters }
  | { type: 'CLEAR_SEARCH' }
  | { type: 'TOGGLE_FILTER'; payload: { filterType: keyof AdvancedFilters; value: string } }

  // UI State
  | { type: 'SET_SELECTED_IDEA'; payload: StructuredIdea | null }
  | { type: 'SET_VIEW_MODE'; payload: 'grid' | 'list' }
  | { type: 'SET_SHOW_ONBOARDING'; payload: boolean }

  // AI Overlay
  | { type: 'SET_AI_OVERLAY'; payload: AIOverlayState | null }
  | { type: 'UPDATE_AI_OVERLAY_STEP'; payload: number }

  // Batch actions
  | { type: 'IDEA_SUBMITTED_SUCCESS'; payload: StructuredIdea }
  | { type: 'RESET_STATE' };
