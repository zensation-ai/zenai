/**
 * Humanized UI Components - Export Index
 *
 * Zentrale Export-Datei für alle humanisierten UI-Komponenten.
 * Import: import { EnhancedTooltip, AIStatusIndicator, ... } from './HumanizedUI.index';
 */

// Components
export {
  EnhancedTooltip,
  ContextualLoader,
  SkeletonLoader,
  SuccessAnimation,
  AIStatusIndicator,
  HumanizedEmptyState,
  FriendlyError,
  ProgressToast,
  ConnectionStatus,
} from './HumanizedUI';

// Types
export type {
  EnhancedTooltipProps,
  ContextualLoaderProps,
  SkeletonLoaderProps,
  SuccessAnimationProps,
  AIStatusIndicatorProps,
  HumanizedEmptyStateProps,
  FriendlyErrorProps,
  ProgressToastProps,
  ConnectionStatusProps,
} from './HumanizedUI';

// Utilities from humanizedMessages
export {
  // Progress & Achievements
  getProgressPraise,
  getActionFeedback,
  getSessionEncouragement,
  ACHIEVEMENTS,

  // Loading & Status
  getLoadingMessage,
  getAIStatusMessage,

  // Empty States & Errors
  getEmptyStateContent,
  getErrorContent,

  // Tooltips & Placeholders
  BUTTON_TOOLTIPS,
  getRandomPlaceholder,
  PLACEHOLDER_TEXTS,

  // Default export
  HumanizedMessages,
} from '../utils/humanizedMessages';

// Types from humanizedMessages
export type {
  UserProgress,
  Achievement,
  ActionFeedback,
  LoadingContext,
  EmptyStateContent,
  ErrorContent,
  TooltipContent,
  AIStatusMessage,
} from '../utils/humanizedMessages';
