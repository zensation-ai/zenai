/**
 * Context Rules API Routes
 *
 * CRUD for programmatic context engineering rules.
 * Rules define how context is built per domain (finance, email, code, learning, general).
 *
 * IMPORTANT: /performance and /test routes are registered BEFORE /:id
 * to prevent Express from matching them as UUID params.
 */

import { Router } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import {
  buildContext,
  classifyDomain,
  createContextRule,
  updateContextRule,
  deleteContextRule,
  listContextRules,
  getRulePerformance,
  type ContextDomain,
} from '../services/context-engine';

export const contextRulesRouter = Router();

const VALID_DOMAINS: ContextDomain[] = ['finance', 'email', 'code', 'learning', 'general'];

// ─── List context rules ───────────────────────────────────
contextRulesRouter.get(
  '/:context/context-rules',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const domain = req.query.domain as ContextDomain | undefined;
    if (domain && !VALID_DOMAINS.includes(domain)) {
      throw new ValidationError(`Invalid domain. Must be one of: ${VALID_DOMAINS.join(', ')}`);
    }

    const rules = await listContextRules(context, domain);
    res.json({ success: true, data: rules });
  })
);

// ─── Rule performance metrics (BEFORE /:id to avoid shadowing) ───
contextRulesRouter.get(
  '/:context/context-rules/performance',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const ruleId = req.query.ruleId as string | undefined;
    const perf = await getRulePerformance(context, ruleId);
    res.json({ success: true, data: perf });
  })
);

// ─── Test rule against sample query (BEFORE /:id to avoid shadowing) ───
contextRulesRouter.post(
  '/:context/context-rules/test',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const { query } = req.body;
    if (!query || typeof query !== 'string') {throw new ValidationError('query is required');}

    const domain = classifyDomain(query);
    const result = await buildContext(query, context, { maxTokens: req.body.maxTokens || 4000 });

    res.json({
      success: true,
      data: {
        classifiedDomain: domain,
        ...result,
      },
    });
  })
);

// ─── Get single rule ──────────────────────────────────────
contextRulesRouter.get(
  '/:context/context-rules/:id',
  apiKeyAuth,
  requireScope('read'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const rules = await listContextRules(context);
    const rule = rules.find(r => r.id === req.params.id);
    if (!rule) {throw new NotFoundError('Context rule not found');}

    res.json({ success: true, data: rule });
  })
);

// ─── Create rule ──────────────────────────────────────────
contextRulesRouter.post(
  '/:context/context-rules',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const { name, description, domain, priority, conditions, dataSources, contextTemplate, tokenBudget, isActive } = req.body;

    if (!name || typeof name !== 'string') {throw new ValidationError('name is required');}
    if (!domain || !VALID_DOMAINS.includes(domain)) {
      throw new ValidationError(`domain must be one of: ${VALID_DOMAINS.join(', ')}`);
    }
    if (!dataSources || !Array.isArray(dataSources) || dataSources.length === 0) {
      throw new ValidationError('dataSources must be a non-empty array');
    }

    const rule = await createContextRule(context, {
      context,
      name,
      description: description || null,
      domain,
      priority: priority ?? 50,
      conditions: conditions || [],
      dataSources,
      contextTemplate: contextTemplate || null,
      tokenBudget: tokenBudget ?? 2000,
      isActive: isActive !== false,
    });

    if (!rule) {throw new ValidationError('Failed to create context rule');}
    res.status(201).json({ success: true, data: rule });
  })
);

// ─── Update rule ──────────────────────────────────────────
contextRulesRouter.put(
  '/:context/context-rules/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    if (req.body.domain && !VALID_DOMAINS.includes(req.body.domain)) {
      throw new ValidationError(`domain must be one of: ${VALID_DOMAINS.join(', ')}`);
    }

    const rule = await updateContextRule(context, req.params.id, req.body);
    if (!rule) {throw new NotFoundError('Context rule not found');}

    res.json({ success: true, data: rule });
  })
);

// ─── Delete rule ──────────────────────────────────────────
contextRulesRouter.delete(
  '/:context/context-rules/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const deleted = await deleteContextRule(context, req.params.id);
    if (!deleted) {throw new NotFoundError('Context rule not found');}

    res.json({ success: true, message: 'Context rule deleted' });
  })
);
