/**
 * Automation API Routes
 *
 * REST API für das Automation-System.
 * Verwaltet Automationen, Vorschläge und Ausführungen.
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { toIntBounded } from '../utils/validation';
import { getUserId } from '../utils/user-context';
import {
  registerAutomation,
  updateAutomation,
  deleteAutomation,
  getAutomation,
  listAutomations,
  executeAutomation,
  generateAutomationSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  getPendingSuggestions,
  getAutomationStats,
  getExecutionHistory,
  TriggerType,
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
} from '../services/automation-registry';

export const automationsRouter = Router();

// ===========================================
// Statistics (MUST be before :id routes!)
// ===========================================

/**
 * GET /api/:context/automations/stats
 * Automation-Statistiken
 */
automationsRouter.get(
  '/:context/automations/stats',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const stats = await getAutomationStats(context as AIContext);

    res.json({
      success: true,
      stats,
    });
  })
);

// ===========================================
// Suggestions (MUST be before :id routes!)
// ===========================================

/**
 * GET /api/:context/automations/suggestions
 * Ausstehende Automation-Vorschläge
 */
automationsRouter.get(
  '/:context/automations/suggestions',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context } = req.params;
    // SECURITY FIX: Use bounded integer parsing to prevent DoS via large limits
    const limit = toIntBounded(req.query.limit as string, 10, 1, 50);

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const suggestions = await getPendingSuggestions(
      context as AIContext,
      Math.min(limit, 50)
    );

    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
    });
  })
);

/**
 * POST /api/:context/automations/suggestions/generate
 * Neue Vorschläge generieren (basierend auf Mustern)
 */
automationsRouter.post(
  '/:context/automations/suggestions/generate',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const suggestions = await generateAutomationSuggestions(context as AIContext);

    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
      message: `${suggestions.length} new suggestions generated`,
    });
  })
);

/**
 * POST /api/:context/automations/suggestions/:id/accept
 * Vorschlag akzeptieren (erstellt Automation)
 */
automationsRouter.post(
  '/:context/automations/suggestions/:id/accept',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const automation = await acceptSuggestion(context as AIContext, id);

    if (!automation) {
      throw new NotFoundError('Suggestion (already processed?)');
    }

    res.json({
      success: true,
      message: 'Suggestion accepted, automation created',
      automation,
    });
  })
);

/**
 * POST /api/:context/automations/suggestions/:id/dismiss
 * Vorschlag ablehnen
 */
automationsRouter.post(
  '/:context/automations/suggestions/:id/dismiss',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    await dismissSuggestion(context as AIContext, id);

    res.json({
      success: true,
      message: 'Suggestion dismissed',
    });
  })
);

// ===========================================
// Automation CRUD
// ===========================================

/**
 * GET /api/:context/automations
 * Liste aller Automationen
 */
automationsRouter.get(
  '/:context/automations',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context } = req.params;
    const { active_only, trigger_type } = req.query;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const automations = await listAutomations(context as AIContext, {
      active_only: active_only === 'true',
      trigger_type: trigger_type as TriggerType | undefined,
    });

    res.json({
      success: true,
      automations,
      count: automations.length,
    });
  })
);

/**
 * GET /api/:context/automations/:id
 * Einzelne Automation abrufen
 */
automationsRouter.get(
  '/:context/automations/:id',
  apiKeyAuth,
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const automation = await getAutomation(context as AIContext, id);

    if (!automation) {
      throw new NotFoundError('Automation');
    }

    res.json({
      success: true,
      automation,
    });
  })
);

/**
 * POST /api/:context/automations
 * Neue Automation erstellen
 */
automationsRouter.post(
  '/:context/automations',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context } = req.params;
    const { name, description, trigger, conditions, actions, is_active } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    // Validation
    if (!name || typeof name !== 'string' || name.length < 2) {
      throw new ValidationError('Name is required and must be at least 2 characters');
    }

    if (!trigger || !trigger.type) {
      throw new ValidationError('Trigger with type is required');
    }

    const validTriggerTypes: TriggerType[] = ['webhook', 'schedule', 'event', 'manual', 'pattern'];
    if (!validTriggerTypes.includes(trigger.type)) {
      throw new ValidationError(`Invalid trigger type. Use: ${validTriggerTypes.join(', ')}`);
    }

    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      throw new ValidationError('At least one action is required');
    }

    // Validate actions
    const validatedActions: AutomationAction[] = actions.map((action: AutomationAction, index: number) => {
      if (!action.type) {
        throw new ValidationError(`Action ${index + 1} is missing type`);
      }
      return {
        type: action.type,
        config: action.config || {},
        order: action.order ?? index + 1,
      };
    });

    // Validate conditions if provided
    const validatedConditions: AutomationCondition[] = (conditions || []).map((condition: AutomationCondition) => {
      if (!condition.field || !condition.operator || condition.value === undefined) {
        throw new ValidationError('Each condition requires field, operator, and value');
      }
      return condition;
    });

    const automation = await registerAutomation(context as AIContext, {
      name: name.trim(),
      description: description || '',
      trigger: trigger as AutomationTrigger,
      conditions: validatedConditions,
      actions: validatedActions,
      is_active: is_active !== false,
      is_system: false,
    });

    logger.info('Automation created via API', { automationId: automation.id, context });

    res.status(201).json({
      success: true,
      automation,
    });
  })
);

/**
 * PUT /api/:context/automations/:id
 * Automation aktualisieren
 */
automationsRouter.put(
  '/:context/automations/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;
    const { name, description, trigger, conditions, actions, is_active } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    // Check if exists
    const existing = await getAutomation(context as AIContext, id);
    if (!existing) {
      throw new NotFoundError('Automation');
    }

    if (existing.is_system) {
      throw new ValidationError('System automations cannot be modified');
    }

    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description;
    }
    if (trigger !== undefined) {
      updates.trigger = trigger;
    }
    if (conditions !== undefined) {
      updates.conditions = conditions;
    }
    if (actions !== undefined) {
      updates.actions = actions;
    }
    if (is_active !== undefined) {
      updates.is_active = is_active;
    }

    await updateAutomation(context as AIContext, id, updates);

    const updated = await getAutomation(context as AIContext, id);

    res.json({
      success: true,
      automation: updated,
    });
  })
);

/**
 * DELETE /api/:context/automations/:id
 * Automation löschen
 */
automationsRouter.delete(
  '/:context/automations/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const deleted = await deleteAutomation(context as AIContext, id);

    if (!deleted) {
      throw new NotFoundError('Automation (or system automation)');
    }

    res.json({
      success: true,
      message: 'Automation deleted',
    });
  })
);

// ===========================================
// Execution
// ===========================================

/**
 * POST /api/:context/automations/:id/execute
 * Automation manuell ausführen
 */
automationsRouter.post(
  '/:context/automations/:id/execute',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;
    const { trigger_data } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const execution = await executeAutomation(
      context as AIContext,
      id,
      trigger_data || {}
    );

    res.json({
      success: true,
      execution,
    });
  })
);

/**
 * GET /api/:context/automations/:id/executions
 * Ausführungshistorie einer Automation
 */
automationsRouter.get(
  '/:context/automations/:id/executions',
  apiKeyAuth,
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;
    // SECURITY FIX: Use bounded integer parsing to prevent DoS via large limits
    const limit = toIntBounded(req.query.limit as string, 20, 1, 100);

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const executions = await getExecutionHistory(
      context as AIContext,
      id,
      limit
    );

    res.json({
      success: true,
      executions,
      count: executions.length,
    });
  })
);

// ===========================================
// Toggle Active State
// ===========================================

/**
 * POST /api/:context/automations/:id/toggle
 * Automation aktivieren/deaktivieren
 */
automationsRouter.post(
  '/:context/automations/:id/toggle',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const automation = await getAutomation(context as AIContext, id);
    if (!automation) {
      throw new NotFoundError('Automation');
    }

    await updateAutomation(context as AIContext, id, {
      is_active: !automation.is_active,
    });

    const updated = await getAutomation(context as AIContext, id);

    res.json({
      success: true,
      automation: updated,
      message: updated?.is_active ? 'Automation activated' : 'Automation deactivated',
    });
  })
);
