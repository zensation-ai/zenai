/**
 * Sprint 1.2 — Moderation Appeal Routes
 *
 * Public (Token-based): POST /api/moderation/appeals/:token
 * Admin-only:           GET /api/moderation/appeals, POST /appeals/:id/resolve
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { requireJwt } from '../middleware/jwt-auth';
import { requireRole } from '../middleware/rbac';
import {
  submitAppeal,
  listPendingAppeals,
  resolveAppeal,
} from '../services/content-moderation';

export const moderationRouter = Router();

/**
 * POST /api/moderation/appeals/:token
 *
 * User-Appeal gegen einen Block. Der Token kommt aus der 422-Antwort,
 * die der User beim ursprünglichen Block-Event erhalten hat.
 * Der User muss NICHT eingeloggt sein — Appeal soll auch bei
 * anonymen Zugriffen möglich sein (z.B. wenn gerade ausgeloggt).
 */
moderationRouter.post(
  '/appeals/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const token = req.params.token;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';

    if (!token || token.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Ungültiger Appeal-Token',
        code: 'VALIDATION_ERROR',
      });
    }
    if (reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Bitte gib einen aussagekräftigen Grund an (mind. 10 Zeichen).',
        code: 'VALIDATION_ERROR',
      });
    }

    try {
      const appeal = await submitAppeal({
        appealToken: token,
        userId: req.jwtUser?.id || null,
        reason,
      });
      return res.json({
        success: true,
        data: {
          id: appeal.id,
          status: appeal.status,
          sla_deadline: appeal.sla_deadline,
        },
      });
    } catch (err) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode: number }).statusCode)
          : 500;
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      return res.status(statusCode).json({
        success: false,
        error: msg,
        code: statusCode === 404 ? 'NOT_FOUND' : 'APPEAL_FAILED',
      });
    }
  })
);

/**
 * GET /api/moderation/appeals
 * Admin-only: Liste offener Appeals (sortiert nach SLA-Deadline).
 */
moderationRouter.get(
  '/appeals',
  requireJwt,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const appeals = await listPendingAppeals(Number.isFinite(limit) ? limit : 50);
    res.json({ success: true, data: appeals });
  })
);

/**
 * POST /api/moderation/appeals/:id/resolve
 * Admin-only: Appeal upheld (Block bestätigt) oder overturned (Block aufgehoben).
 */
moderationRouter.post(
  '/appeals/:id/resolve',
  requireJwt,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const decision = req.body?.decision;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;

    if (decision !== 'upheld' && decision !== 'overturned') {
      return res.status(400).json({
        success: false,
        error: 'decision muss "upheld" oder "overturned" sein',
        code: 'VALIDATION_ERROR',
      });
    }
    if (!req.jwtUser?.id) {
      return res.status(401).json({
        success: false,
        error: 'Auth required',
        code: 'UNAUTHENTICATED',
      });
    }

    try {
      const appeal = await resolveAppeal({
        appealId: id,
        reviewerId: req.jwtUser.id,
        decision,
        notes,
      });
      return res.json({ success: true, data: appeal });
    } catch (err) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode: number }).statusCode)
          : 500;
      return res.status(statusCode).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown',
        code: statusCode === 404 ? 'NOT_FOUND' : 'RESOLVE_FAILED',
      });
    }
  })
);
