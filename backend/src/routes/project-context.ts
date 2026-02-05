/**
 * Project Context Routes
 *
 * API endpoints for project/workspace context analysis.
 * Enables AI to understand the current codebase being discussed.
 *
 * @module routes/project-context
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import {
  generateProjectContext,
  getQuickProjectSummary,
  scanProjectStructure,
  formatProjectContext,
} from '../services/project-context';

const router = Router();

/**
 * POST /analyze
 * Analyze a project and return comprehensive context
 */
router.post('/analyze', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { projectPath } = req.body;

  if (!projectPath || typeof projectPath !== 'string') {
    throw new ValidationError('projectPath is required');
  }

  logger.info('Analyzing project', { path: projectPath });

  const context = await generateProjectContext(projectPath);

  return res.json({
    success: true,
    projectInfo: context.projectInfo,
    summary: context.summary,
    keyFiles: context.keyFiles,
    techStack: context.techStack,
    focusAreas: context.focusAreas,
    formatted: formatProjectContext(context),
  });
}));

/**
 * POST /summary
 * Get a quick project summary
 */
router.post('/summary', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { projectPath } = req.body;

  if (!projectPath || typeof projectPath !== 'string') {
    throw new ValidationError('projectPath is required');
  }

  const summary = await getQuickProjectSummary(projectPath);

  return res.json({
    success: true,
    summary,
  });
}));

/**
 * POST /structure
 * Get project file structure
 */
router.post('/structure', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { projectPath, maxDepth = 3 } = req.body;

  if (!projectPath || typeof projectPath !== 'string') {
    throw new ValidationError('projectPath is required');
  }

  const structure = await scanProjectStructure(projectPath, maxDepth);

  return res.json({
    success: true,
    structure: {
      rootPath: structure.rootPath,
      totalFiles: structure.totalFiles,
      totalDirectories: structure.totalDirectories,
      files: structure.files.slice(0, 200), // Limit for response size
      directories: structure.directories.slice(0, 50),
    },
  });
}));

/**
 * GET /health
 * Check project context service availability
 */
router.get('/health', (_req: Request, res: Response) => {
  return res.json({
    available: true,
    service: 'project-context',
  });
});

export default router;
