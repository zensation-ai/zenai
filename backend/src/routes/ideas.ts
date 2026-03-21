/**
 * Ideas Routes
 *
 * Route definitions for idea CRUD, search, triage, and batch operations.
 * Handler implementations are in ideas-handlers.ts.
 *
 * @module routes/ideas
 */

import { Router, Request, Response, NextFunction } from 'express';
import { isValidUUID } from '../utils/database-context';
import { validateContextParam } from '../utils/validation';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import {
  getContext,
  handleTriageGet,
  handleTriagePost,
  handleListIdeas,
  handleArchivedList,
  handleArchiveIdea,
  handleRestoreIdea,
  handleDeleteIdea,
  handleStatsSummary,
  handleStatsSummaryContext,
  handleRecommendations,
  handleGetIdea,
  handleSearch,
  handleProgressiveSearch,
  handleSimilarIdeas,
  handleUpdateIdea,
  handlePriorityUpdate,
  handleSwipeAction,
  handleCheckDuplicates,
  handleMergeIdeas,
  handleMoveIdea,
  handleToggleFavorite,
  handleBatchArchive,
  handleBatchDelete,
  handleBatchFavorite,
} from './ideas-handlers';

export const ideasRouter = Router();

// Context-aware router for routes like /api/:context/ideas/*
export const ideasContextRouter = Router();

/**
 * Middleware to validate UUID parameter
 */
function validateUUID(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id;
  if (id && !isValidUUID(id)) {
    throw new ValidationError('Invalid ID format. Must be a valid UUID.');
  }
  next();
}

// ===========================================
// Legacy Router (ideasRouter) — uses header/query context
// ===========================================

// NOTE: /stats/summary must be defined BEFORE /:id route
ideasRouter.get('/stats/summary', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleStatsSummary(getContext(req), req, res);
}));

ideasRouter.get('/triage', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleTriageGet(getContext(req), req, res);
}));

ideasRouter.post('/:id/triage', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleTriagePost(getContext(req), req, res);
}));

ideasRouter.get('/', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleListIdeas(getContext(req), req, res);
}));

// NOTE: /recommendations must be defined BEFORE /:id route
ideasRouter.get('/recommendations', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleRecommendations(getContext(req), req, res);
}));

ideasRouter.get('/:id', apiKeyAuth, validateUUID, asyncHandler(async (req, res) => {
  await handleGetIdea(getContext(req), req, res);
}));

ideasRouter.post('/search', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleSearch(getContext(req), req, res);
}));

ideasRouter.post('/search/progressive', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleProgressiveSearch(getContext(req), req, res);
}));

ideasRouter.get('/:id/similar', apiKeyAuth, validateUUID, asyncHandler(async (req, res) => {
  await handleSimilarIdeas(getContext(req), req, res);
}));

ideasRouter.put('/:id', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleUpdateIdea(getContext(req), req, res);
}));

ideasRouter.delete('/:id', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleDeleteIdea(getContext(req), req, res);
}));

ideasRouter.put('/:id/priority', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handlePriorityUpdate(getContext(req), req, res);
}));

ideasRouter.post('/:id/swipe', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleSwipeAction(getContext(req), req, res);
}));

ideasRouter.get('/archived/list', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleArchivedList(getContext(req), req, res);
}));

ideasRouter.put('/:id/restore', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleRestoreIdea(getContext(req), req, res);
}));

ideasRouter.put('/:id/archive', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleArchiveIdea(getContext(req), req, res);
}));

// Duplicate Detection
ideasRouter.post('/check-duplicates', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleCheckDuplicates(getContext(req), req, res);
}));

ideasRouter.post('/:id/merge', apiKeyAuth, requireScope('write'), validateUUID, asyncHandler(async (req, res) => {
  await handleMergeIdeas(getContext(req), req, res);
}));

// ===========================================
// Context-Aware Routes (for /api/:context/ideas/*)
// ===========================================

ideasContextRouter.get('/:context/ideas/triage', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleTriageGet(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.post('/:context/ideas/:id/triage', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleTriagePost(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.get('/:context/ideas/stats/summary', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleStatsSummaryContext(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.put('/:context/ideas/:id/archive', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleArchiveIdea(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.put('/:context/ideas/:id/restore', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleRestoreIdea(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.get('/:context/ideas', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleListIdeas(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.get('/:context/ideas/archived', apiKeyAuth, asyncHandler(async (req, res) => {
  await handleArchivedList(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.delete('/:context/ideas/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleDeleteIdea(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.post('/:context/ideas/:id/move', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleMoveIdea(req, res);
}));

ideasContextRouter.put('/:context/ideas/:id/favorite', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleToggleFavorite(validateContextParam(req.params.context), req, res);
}));

// Batch Operations
ideasContextRouter.post('/:context/ideas/batch/archive', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleBatchArchive(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.post('/:context/ideas/batch/delete', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleBatchDelete(validateContextParam(req.params.context), req, res);
}));

ideasContextRouter.post('/:context/ideas/batch/favorite', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  await handleBatchFavorite(validateContextParam(req.params.context), req, res);
}));
