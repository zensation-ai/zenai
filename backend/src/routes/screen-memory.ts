/**
 * Screen Memory Routes - Phase 5
 *
 * REST API for querying and managing screen captures.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { AIContext } from '../utils/database-context';
import { isValidUUID, validateContextParam } from '../utils/validation';
import { sendData, sendList, sendMessage, sendNotFound, sendValidationError, parsePagination } from '../utils/response';
import { getUserId } from '../utils/user-context';
import * as screenMemoryService from '../services/screen-memory';

const router = Router();

router.use(apiKeyAuth);

function getContext(req: Request): AIContext {
  return validateContextParam(req.params.context);
}

// ============================================================
// Captures
// ============================================================

router.get('/:context/screen-memory', asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { limit, offset } = parsePagination(req, { defaultLimit: 50 });
  const filters: screenMemoryService.ScreenMemoryFilters = {
    search: req.query.search as string | undefined,
    app_name: req.query.app_name as string | undefined,
    date_from: req.query.date_from as string | undefined,
    date_to: req.query.date_to as string | undefined,
    limit,
    offset,
  };
  const result = await screenMemoryService.getCaptures(getContext(req), filters, userId);
  sendList(res, result.captures, result.total);
}));

router.get('/:context/screen-memory/stats', asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const stats = await screenMemoryService.getStats(getContext(req), userId);
  sendData(res, stats);
}));

router.get('/:context/screen-memory/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUUID(req.params.id)) {
    sendValidationError(res, 'Invalid ID format');
    return;
  }
  const userId = getUserId(req);
  const capture = await screenMemoryService.getCapture(getContext(req), req.params.id, userId);
  if (!capture) {
    sendNotFound(res, 'Capture');
    return;
  }
  sendData(res, capture);
}));

router.post('/:context/screen-memory', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const capture = await screenMemoryService.storeCapture(getContext(req), req.body, userId);
  sendData(res, capture, 201);
}));

router.delete('/:context/screen-memory/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUUID(req.params.id)) {
    sendValidationError(res, 'Invalid ID format');
    return;
  }
  const userId = getUserId(req);
  const deleted = await screenMemoryService.deleteCapture(getContext(req), req.params.id, userId);
  if (!deleted) {
    sendNotFound(res, 'Capture');
    return;
  }
  sendMessage(res, 'Capture deleted');
}));

router.post('/:context/screen-memory/cleanup', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const parsed = parseInt(req.body.retention_days);
  const retentionDays = Number.isNaN(parsed) ? 30 : Math.max(1, Math.min(365, parsed));
  const deleted = await screenMemoryService.cleanupOldCaptures(getContext(req), retentionDays, userId);
  sendMessage(res, `Cleaned up ${deleted} old captures`, { deleted });
}));

export { router as screenMemoryRouter };
