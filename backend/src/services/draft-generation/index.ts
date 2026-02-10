/**
 * Draft Generation Service
 *
 * Re-exports all draft-related functionality from sub-modules.
 *
 * Sub-modules:
 * - draft-detection: Types + detection logic for identifying writing tasks
 * - draft-content: Generation, context gathering, DB operations, draft management
 * - draft-feedback: Enhanced feedback system, analytics, pattern effectiveness
 */

// Types & Detection
export {
  DraftTrigger,
  GeneratedDraft,
  DraftType,
  DetectedDraftNeed,
  detectDraftNeed,
} from './draft-detection';

// Content Generation & Management
export {
  generateProactiveDraft,
  getDraftForIdea,
  markDraftViewed,
  saveDraftFeedback,
  discardDraft,
  listDrafts,
} from './draft-content';

// Feedback & Analytics
export {
  DetailedFeedback,
  EditCategory,
  FeedbackSource,
  QualityAspects,
  FeedbackAnalytics,
  PatternEffectiveness,
  submitDetailedFeedback,
  recordDraftCopy,
  getFeedbackAnalytics,
  getPatternEffectiveness,
  getDraftsNeedingFeedback,
  getDraftFeedbackHistory,
  getLearningSuggestions,
  updateLearningSuggestion,
  quickFeedback,
} from './draft-feedback';
