/**
 * Phase 143: Blueprint CRUD + Activation Routes
 *
 * All endpoints mounted under /api/agents (via agents module).
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { blueprintRegistry } from '../services/agents/blueprint-registry';
import type { BlueprintType, BlueprintSource } from '../services/agents/blueprint-registry';
import type { AgentCategory } from '../services/agents/built-in-agents';

export const agentBlueprintsRouter = Router();

/**
 * GET /api/agents/blueprints
 * List blueprints with optional filters
 */
agentBlueprintsRouter.get('/blueprints', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const { category, type, source, search } = req.query;
  const data = await blueprintRegistry.listBlueprints({
    category: category as AgentCategory | undefined,
    type: type as BlueprintType | undefined,
    source: source as BlueprintSource | undefined,
    search: search as string | undefined,
  });
  res.json({ data });
}));

/**
 * GET /api/agents/blueprints/:id
 * Get single blueprint
 */
agentBlueprintsRouter.get('/blueprints/:id', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  try {
    const data = await blueprintRegistry.getBlueprint(req.params.id);
    res.json({ data });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    throw err;
  }
}));

/**
 * POST /api/agents/blueprints
 * Create a new blueprint
 */
agentBlueprintsRouter.post('/blueprints', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id, name, type, tools, instructions } = req.body;
  if (!id || !name || !type || !tools || !instructions) {
    return res.status(400).json({ error: 'Missing required fields: id, name, type, tools, instructions' });
  }
  const data = await blueprintRegistry.createBlueprint({
    ...req.body,
    source: 'user_created',
    userId: (req as any).userId,
  });
  res.status(201).json({ data });
}));

/**
 * PUT /api/agents/blueprints/:id
 * Update a blueprint
 */
agentBlueprintsRouter.put('/blueprints/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  try {
    const data = await blueprintRegistry.updateBlueprint(req.params.id, req.body);
    res.json({ data });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    throw err;
  }
}));

/**
 * DELETE /api/agents/blueprints/:id
 * Delete a blueprint (not built-in)
 */
agentBlueprintsRouter.delete('/blueprints/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  try {
    await blueprintRegistry.deleteBlueprint(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.includes('Cannot delete')) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}));

/**
 * POST /api/agents/blueprints/:id/activate
 * Activate a blueprint as a running agent in a context
 */
agentBlueprintsRouter.post('/blueprints/:id/activate', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, config } = req.body;
  if (!context) {
    return res.status(400).json({ error: 'Missing required field: context' });
  }
  const data = await blueprintRegistry.activateBlueprint(req.params.id, context, config);
  res.json({ data });
}));

/**
 * POST /api/agents/blueprints/:id/deactivate
 * Deactivate a running agent by blueprint id
 */
agentBlueprintsRouter.post('/blueprints/:id/deactivate', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.body;
  if (!context) {
    return res.status(400).json({ error: 'Missing required field: context' });
  }
  await blueprintRegistry.deactivateBlueprint(req.params.id, context);
  res.json({ success: true });
}));

/**
 * POST /api/agents/blueprints/export
 * Export a blueprint as JSON
 */
agentBlueprintsRouter.post('/blueprints/export', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing required field: id' });
  }
  const bp = await blueprintRegistry.getBlueprint(id);
  res.json({ version: '1.0', exportedAt: new Date().toISOString(), blueprint: bp });
}));

/**
 * POST /api/agents/blueprints/import
 * Import a blueprint from JSON
 */
agentBlueprintsRouter.post('/blueprints/import', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { blueprint } = req.body;
  if (!blueprint?.id || !blueprint?.tools || !blueprint?.instructions) {
    return res.status(400).json({ error: 'Invalid blueprint format — requires id, tools, instructions' });
  }
  // Force source to user_created on import
  const data = await blueprintRegistry.createBlueprint({
    ...blueprint,
    source: 'user_created',
    userId: (req as any).userId,
  });
  res.status(201).json({ data });
}));
