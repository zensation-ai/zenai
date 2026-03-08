/**
 * Screen Memory Routes - Phase 5
 *
 * REST API for querying and managing screen captures.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { AIContext } from '../utils/database-context';
import { isValidUUID } from '../utils/validation';
import * as screenMemoryService from '../services/screen-memory';

const router = Router();

router.use(apiKeyAuth);

function getContext(req: Request): AIContext {
  return req.params.context as AIContext;
}

// ============================================================
// Captures
// ============================================================

router.get('/:context/screen-memory', asyncHandler(async (req: Request, res: Response) => {
  const filters: screenMemoryService.ScreenMemoryFilters = {
    search: req.query.search as string | undefined,
    app_name: req.query.app_name as string | undefined,
    date_from: req.query.date_from as string | undefined,
    date_to: req.query.date_to as string | undefined,
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0,
  };
  const result = await screenMemoryService.getCaptures(getContext(req), filters);
  res.json({ success: true, data: result.captures, total: result.total });
}));

router.get('/:context/screen-memory/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await screenMemoryService.getStats(getContext(req));
  res.json({ success: true, data: stats });
}));

router.get('/:context/screen-memory/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUUID(req.params.id)) {
    res.status(400).json({ success: false, error: 'Invalid ID format' });
    return;
  }
  const capture = await screenMemoryService.getCapture(getContext(req), req.params.id);
  if (!capture) {
    res.status(404).json({ success: false, error: 'Capture not found' });
    return;
  }
  res.json({ success: true, data: capture });
}));

router.post('/:context/screen-memory', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const capture = await screenMemoryService.storeCapture(getContext(req), req.body);
  res.status(201).json({ success: true, data: capture });
}));

router.delete('/:context/screen-memory/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUUID(req.params.id)) {
    res.status(400).json({ success: false, error: 'Invalid ID format' });
    return;
  }
  const deleted = await screenMemoryService.deleteCapture(getContext(req), req.params.id);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Capture not found' });
    return;
  }
  res.json({ success: true });
}));

router.post('/:context/screen-memory/cleanup', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const retentionDays = parseInt(req.body.retention_days) || 30;
  const deleted = await screenMemoryService.cleanupOldCaptures(getContext(req), retentionDays);
  res.json({ success: true, deleted });
}));

export { router as screenMemoryRouter };
