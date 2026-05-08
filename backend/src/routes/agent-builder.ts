/**
 * Phase 143: NL Agent Builder Routes
 *
 * All endpoints mounted under /api/agents (via agents module).
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { nlAgentBuilder } from '../services/agents/nl-agent-builder';
import { blueprintRegistry } from '../services/agents/blueprint-registry';

export const agentBuilderRouter = Router();

/**
 * POST /api/agents/builder/generate
 * Generate a blueprint from a natural language description
 */
agentBuilderRouter.post('/builder/generate', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { description, context } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'Missing required field: description' });
  }
  const result = await nlAgentBuilder.generateBlueprint(description, context);
  res.json({ data: result });
}));

/**
 * POST /api/agents/builder/refine
 * Refine an existing blueprint with user feedback
 */
agentBuilderRouter.post('/builder/refine', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { blueprint, feedback } = req.body;
  if (!blueprint || !feedback) {
    return res.status(400).json({ error: 'Missing required fields: blueprint, feedback' });
  }
  const refined = await nlAgentBuilder.refineBlueprint(blueprint, feedback);
  res.json({ data: refined });
}));

/**
 * POST /api/agents/builder/validate
 * Validate a blueprint for correctness and safety
 */
agentBuilderRouter.post('/builder/validate', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const { blueprint } = req.body;
  if (!blueprint) {
    return res.status(400).json({ error: 'Missing required field: blueprint' });
  }
  const result = nlAgentBuilder.validateBlueprint(blueprint);
  res.json({ data: result });
}));

/**
 * POST /api/agents/builder/save
 * Validate and save a generated blueprint to the registry
 */
agentBuilderRouter.post('/builder/save', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { blueprint } = req.body;
  if (!blueprint?.id || !blueprint?.name || !blueprint?.tools || !blueprint?.instructions) {
    return res.status(400).json({ error: 'Missing required blueprint fields: id, name, tools, instructions' });
  }

  const validation = nlAgentBuilder.validateBlueprint(blueprint);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Blueprint validation failed', details: validation.errors });
  }

  const data = await blueprintRegistry.createBlueprint({
    ...blueprint,
    source: 'nl_generated',
    userId: (req as any).userId,
  });
  res.status(201).json({ data, validation });
}));
