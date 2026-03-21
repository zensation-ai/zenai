/**
 * Ideas Route Handlers — Re-export Barrel
 *
 * Split into two sub-modules for maintainability (Phase 122):
 * - ideas-crud-handlers.ts: list, get, update, delete, stats, recommendations
 * - ideas-advanced-handlers.ts: triage, search, archive, restore, merge, duplicates,
 *   batch ops, favorites, move, priority, swipe
 *
 * The main ideas.ts file imports all handlers from this barrel.
 *
 * @module routes/ideas-handlers
 */

import { Request } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { ValidationError } from '../middleware/errorHandler';

/**
 * Get context from request header or query param, default to 'personal'
 */
export function getContext(req: Request): AIContext {
  const context = (req.headers['x-ai-context'] as string) || (req.query.context as string) || 'personal';
  if (!isValidContext(context)) {
    throw new ValidationError(`Invalid context: ${context}. Must be one of: personal, work, learning, creative`);
  }
  return context;
}

// Re-export CRUD handlers
export {
  handleListIdeas,
  handleGetIdea,
  handleUpdateIdea,
  handleDeleteIdea,
  handleStatsSummary,
  handleStatsSummaryContext,
  handleRecommendations,
} from './ideas-crud-handlers';

// Re-export advanced handlers
export {
  handleTriageGet,
  handleTriagePost,
  handleArchivedList,
  handleArchiveIdea,
  handleRestoreIdea,
  handleSearch,
  handleProgressiveSearch,
  handleSimilarIdeas,
  handlePriorityUpdate,
  handleSwipeAction,
  handleCheckDuplicates,
  handleMergeIdeas,
  handleMoveIdea,
  handleToggleFavorite,
  validateBatchIds,
  handleBatchArchive,
  handleBatchDelete,
  handleBatchFavorite,
} from './ideas-advanced-handlers';
