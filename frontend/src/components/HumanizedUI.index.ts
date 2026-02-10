/**
 * Humanized UI Components - Export Index
 *
 * Zentrale Export-Datei für alle humanisierten UI-Komponenten.
 *
 * Quick Start:
 * ```tsx
 * import {
 *   // Components
 *   EnhancedTooltip,
 *   TooltipButton,
 *   SaveButton,
 *   SuccessAnimation,
 *   AIStatusIndicator,
 *
 *   // Hooks
 *   useHumanizedFeedback,
 *
 *   // Utilities
 *   getActionFeedback,
 * } from './components/HumanizedUI.index';
 * ```
 */

// ============================================
// CORE COMPONENTS
// ============================================

export {
  EnhancedTooltip,
  ContextualLoader,
  SuccessAnimation,
  AIStatusIndicator,
  HumanizedEmptyState,
  FriendlyError,
  ProgressToast,
  ConnectionStatus,
} from './HumanizedUI';

// ============================================
// BUTTON COMPONENTS
// ============================================

export {
  TooltipButton,
  IconButton,
  ArchiveButton,
  SaveButton,
  DeleteButton,
  ShareButton,
  FavoriteButton,
  VoiceButton,
} from './TooltipButton';

// ============================================
// TYPES - Components
// ============================================

export type {
  EnhancedTooltipProps,
  ContextualLoaderProps,
  SuccessAnimationProps,
  AIStatusIndicatorProps,
  HumanizedEmptyStateProps,
  FriendlyErrorProps,
  ProgressToastProps,
  ConnectionStatusProps,
} from './HumanizedUI';

export type {
  TooltipButtonProps,
  IconButtonProps,
  ActionButtonProps,
} from './TooltipButton';

// ============================================
// HOOKS
// ============================================

export {
  useHumanizedFeedback,
  useKeyboardShortcut,
  formatShortcut,
} from '../hooks/useHumanizedFeedback';

export type {
  SessionStats,
  HumanizedFeedbackConfig,
} from '../hooks/useHumanizedFeedback';

// ============================================
// UTILITIES - Messages & Content
// ============================================

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

  // Micro-copy
  MICRO_COPY,
  CELEBRATION_MESSAGES,
  getCelebrationMessage,

  // Personalization
  getTimeAwareMessage,
  getPersonalizedResponse,

  // Default export
  HumanizedMessages,
} from '../utils/humanizedMessages';

// ============================================
// TYPES - Messages
// ============================================

export type {
  UserProgress,
  Achievement,
  ActionFeedback,
  LoadingContext,
  EmptyStateContent,
  ErrorContent,
  TooltipContent,
  AIStatusMessage,
  MicroCopy,
  ResponseTone,
} from '../utils/humanizedMessages';

// ============================================
// RE-EXPORTS from existing system
// ============================================

// AI Personality (für Kompatibilität)
export {
  AI_PERSONALITY,
  AI_AVATAR,
  getTimeBasedGreeting,
  getIdleMessage,
  getRandomMessage,
  getRandomTip,
  getMoodBasedResponse,
  AI_ACTIVITY_MESSAGES,
  EMPTY_STATE_MESSAGES,
  CONTEXTUAL_TIPS,
  FEEDBACK_REACTIONS,
} from '../utils/aiPersonality';
