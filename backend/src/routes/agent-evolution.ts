/**
 * Agent Evolution API Routes
 *
 * Endpoints for agent feedback, performance analytics,
 * auto-tuning, and specialization profiles.
 *
 * @module routes/agent-evolution
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { apiKeyAuth } from '../middleware/auth';
import {
  recordFeedback,
  recordUserRating,
  getStrategyPerformance,
  getAgentPerformance,
  getBestStrategy,
} from '../services/agents/agent-feedback';
import {
  generateRecommendations,
  applyRecommendation,
  getOptimizedConfig,
} from '../services/agents/agent-auto-tuner';
import {
  getProfile,
  listProfiles,
} from '../services/agents/agent-specialization';

export const agentEvolutionRouter = Router();

// ===========================================
// Feedback Endpoints
// ===========================================

/**
 * POST /api/agents/feedback
 * Record execution feedback
 */
agentEvolutionRouter.post(
  '/agents/feedback',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      execution_id,
      strategy,
      agents_used,
      completion_score,
      user_rating,
      token_count,
      execution_time_ms,
      error_count,
      task_type,
      metadata,
    } = req.body;

    if (!execution_id || !strategy) {
      throw new ValidationError('execution_id and strategy are required');
    }

    const id = await recordFeedback({
      execution_id,
      strategy,
      agents_used: agents_used ?? [],
      completion_score: completion_score ?? 0,
      user_rating: user_rating ?? undefined,
      token_count: token_count ?? 0,
      execution_time_ms: execution_time_ms ?? 0,
      error_count: error_count ?? 0,
      task_type,
      metadata,
    });

    res.status(201).json({ success: true, data: { id } });
  })
);

/**
 * POST /api/agents/feedback/:executionId/rate
 * User rates an execution (body: { rating: 1-5 })
 */
agentEvolutionRouter.post(
  '/agents/feedback/:executionId/rate',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { executionId } = req.params;
    const { rating } = req.body;

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      throw new ValidationError('rating must be an integer between 1 and 5');
    }

    const updated = await recordUserRating(executionId, Math.round(rating));

    if (!updated) {
      res.status(404).json({ success: false, error: 'Execution not found' });
      return;
    }

    res.json({ success: true });
  })
);

// ===========================================
// Performance Endpoints
// ===========================================

/**
 * GET /api/agents/performance
 * Strategy performance stats
 */
agentEvolutionRouter.get(
  '/agents/performance',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string, 10) || 30;
    const performances = await getStrategyPerformance(days);

    res.json({ success: true, data: performances });
  })
);

/**
 * GET /api/agents/performance/:role
 * Per-agent performance
 */
agentEvolutionRouter.get(
  '/agents/performance/:role',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { role } = req.params;
    const days = parseInt(req.query.days as string, 10) || 30;

    const performance = await getAgentPerformance(role, days);

    if (!performance) {
      res.status(404).json({ success: false, error: 'No data for this agent role' });
      return;
    }

    res.json({ success: true, data: performance });
  })
);

/**
 * GET /api/agents/best-strategy
 * Recommend best strategy for a task type
 */
agentEvolutionRouter.get(
  '/agents/best-strategy',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const taskType = req.query.taskType as string;

    if (!taskType) {
      throw new ValidationError('taskType query parameter is required');
    }

    const strategy = await getBestStrategy(taskType);

    res.json({ success: true, data: { strategy } });
  })
);

// ===========================================
// Tuning Endpoints
// ===========================================

/**
 * GET /api/agents/tuning/recommendations
 * Get tuning recommendations
 */
agentEvolutionRouter.get(
  '/agents/tuning/recommendations',
  apiKeyAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const recommendations = await generateRecommendations();
    res.json({ success: true, data: recommendations });
  })
);

/**
 * POST /api/agents/tuning/apply
 * Apply a recommendation (body: { agent_role })
 */
agentEvolutionRouter.post(
  '/agents/tuning/apply',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { agent_role } = req.body;

    if (!agent_role) {
      throw new ValidationError('agent_role is required');
    }

    // Generate fresh recommendations and find the one for this role
    const recommendations = await generateRecommendations();
    const rec = recommendations.find((r) => r.agent_role === agent_role);

    if (!rec) {
      res.status(404).json({
        success: false,
        error: `No recommendation found for agent role: ${agent_role}`,
      });
      return;
    }

    await applyRecommendation(rec);

    const newConfig = await getOptimizedConfig(agent_role);

    res.json({ success: true, data: { applied: rec, config: newConfig } });
  })
);

// ===========================================
// Profile Endpoints
// ===========================================

/**
 * GET /api/agents/profiles
 * List specialization profiles
 */
agentEvolutionRouter.get(
  '/agents/profiles',
  apiKeyAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const profiles = await listProfiles();
    res.json({ success: true, data: profiles });
  })
);

/**
 * GET /api/agents/profiles/:role
 * Single specialization profile
 */
agentEvolutionRouter.get(
  '/agents/profiles/:role',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { role } = req.params;
    const profile = await getProfile(role);
    res.json({ success: true, data: profile });
  })
);
