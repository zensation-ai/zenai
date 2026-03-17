/**
 * Workspace Automation Routes (Phase 93)
 *
 * REST API for managing AI-driven workflow automations.
 */

import { Router } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import { logger } from '../utils/logger';
import {
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  executeAutomation,
  getExecutionHistory,
  getTemplates,
  createFromTemplate,
  type TriggerType,
} from '../services/workspace-automation';

export const workspaceAutomationRouter = Router();

const VALID_TRIGGER_TYPES: TriggerType[] = ['time', 'event', 'condition', 'manual'];

// ─── List all automations ─────────────────────────────────
workspaceAutomationRouter.get(
  '/:context/workspace-automations',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) throw new ValidationError('Invalid context');
    const userId = getUserId(req);

    try {
      const automations = await listAutomations(context, userId);
      res.json({ success: true, data: automations });
    } catch (error) {
      logger.error('Workspace-Automation: Auflisten fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Automatisierungen konnten nicht geladen werden' });
    }
  }),
);

// ─── List predefined templates ────────────────────────────
workspaceAutomationRouter.get(
  '/:context/workspace-automations/templates',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) throw new ValidationError('Invalid context');

    try {
      const templates = getTemplates();
      res.json({ success: true, data: templates });
    } catch (error) {
      logger.error('Workspace-Automation: Vorlagen fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Automatisierungs-Vorlagen konnten nicht geladen werden' });
    }
  }),
);

// ─── Get single automation ───────────────────────────────
workspaceAutomationRouter.get(
  '/:context/workspace-automations/:id',
  apiKeyAuth,
  requireScope('read'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) throw new ValidationError('Invalid context');
    const userId = getUserId(req);

    try {
      const automation = await getAutomation(context, req.params.id, userId);
      if (!automation) throw new NotFoundError('Automation not found');

      res.json({ success: true, data: automation });
    } catch (error) {
      if (error instanceof NotFoundError) { throw error; }
      logger.error('Workspace-Automation: Abruf fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: req.params.id });
      res.status(500).json({ success: false, error: 'Automatisierung konnte nicht geladen werden' });
    }
  }),
);

// ─── Create custom automation ────────────────────────────
workspaceAutomationRouter.post(
  '/:context/workspace-automations',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) throw new ValidationError('Invalid context');
    const userId = getUserId(req);

    const { name, description, trigger_type, trigger_config, conditions, actions, enabled } = req.body;

    if (!name || typeof name !== 'string') {
      throw new ValidationError('name is required');
    }
    if (!trigger_type || !VALID_TRIGGER_TYPES.includes(trigger_type)) {
      throw new ValidationError(`trigger_type must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`);
    }
    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      throw new ValidationError('actions must be a non-empty array');
    }

    try {
      const automation = await createAutomation(context, userId, {
        name,
        description,
        trigger_type,
        trigger_config: trigger_config ?? {},
        conditions,
        actions,
        enabled,
      });

      res.status(201).json({ success: true, data: automation });
    } catch (error) {
      logger.error('Workspace-Automation: Erstellung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: name });
      res.status(500).json({ success: false, error: 'Automatisierung konnte nicht erstellt werden' });
    }
  }),
);

// ─── Create from template ────────────────────────────────
workspaceAutomationRouter.post(
  '/:context/workspace-automations/from-template',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) throw new ValidationError('Invalid context');
    const userId = getUserId(req);

    const { template_id, name, description } = req.body;
    if (!template_id || typeof template_id !== 'string') {
      throw new ValidationError('template_id is required');
    }

    try {
      const automation = await createFromTemplate(context, userId, template_id, { name, description });
      res.status(201).json({ success: true, data: automation });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Template not found')) {
        throw new NotFoundError(err.message);
      }
      throw err;
    }
  }),
);

// ─── Update automation ───────────────────────────────────
workspaceAutomationRouter.put(
  '/:context/workspace-automations/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) throw new ValidationError('Invalid context');
    const userId = getUserId(req);

    const { name, description, trigger_type, trigger_config, conditions, actions, enabled } = req.body;

    if (trigger_type && !VALID_TRIGGER_TYPES.includes(trigger_type)) {
      throw new ValidationError(`trigger_type must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`);
    }

    try {
      const updated = await updateAutomation(context, req.params.id, userId, {
        name,
        description,
        trigger_type,
        trigger_config,
        conditions,
        actions,
        enabled,
      });

      if (!updated) throw new NotFoundError('Automation not found');
      res.json({ success: true, data: updated });
    } catch (error) {
      if (error instanceof NotFoundError) { throw error; }
      logger.error('Workspace-Automation: Aktualisierung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: req.params.id });
      res.status(500).json({ success: false, error: 'Automatisierung konnte nicht aktualisiert werden' });
    }
  }),
);

// ─── Delete automation ───────────────────────────────────
workspaceAutomationRouter.delete(
  '/:context/workspace-automations/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) throw new ValidationError('Invalid context');
    const userId = getUserId(req);

    try {
      const deleted = await deleteAutomation(context, req.params.id, userId);
      if (!deleted) throw new NotFoundError('Automation not found');

      res.json({ success: true, message: 'Automation deleted' });
    } catch (error) {
      if (error instanceof NotFoundError) { throw error; }
      logger.error('Workspace-Automation: Löschung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: req.params.id });
      res.status(500).json({ success: false, error: 'Automatisierung konnte nicht gelöscht werden' });
    }
  }),
);

// ─── Execute automation manually ─────────────────────────
workspaceAutomationRouter.post(
  '/:context/workspace-automations/:id/execute',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) throw new ValidationError('Invalid context');
    const userId = getUserId(req);

    const triggerData = req.body.trigger_data ?? {};

    try {
      const execution = await executeAutomation(context, req.params.id, userId, triggerData);
      res.json({ success: true, data: execution });
    } catch (err) {
      if (err instanceof Error && err.message === 'Automation not found') {
        throw new NotFoundError('Automation not found');
      }
      throw err;
    }
  }),
);

// ─── Get execution history ──────────────────────────────
workspaceAutomationRouter.get(
  '/:context/workspace-automations/:id/history',
  apiKeyAuth,
  requireScope('read'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) throw new ValidationError('Invalid context');
    const userId = getUserId(req);

    try {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      const history = await getExecutionHistory(context, req.params.id, userId, limit);

      res.json({ success: true, data: history });
    } catch (error) {
      logger.error('Workspace-Automation: Ausführungsverlauf fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: req.params.id });
      res.status(500).json({ success: false, error: 'Ausführungsverlauf konnte nicht geladen werden' });
    }
  }),
);
