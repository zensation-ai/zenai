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
import {
  analyzeProject,
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
router.post('/analyze', async (req: Request, res: Response) => {
  const { projectPath, includeReadme = true } = req.body;

  if (!projectPath || typeof projectPath !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'projectPath is required',
    });
  }

  logger.info('Analyzing project', { path: projectPath });

  try {
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
  } catch (error) {
    logger.error('Project analysis failed', error instanceof Error ? error : undefined);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
});

/**
 * POST /summary
 * Get a quick project summary
 */
router.post('/summary', async (req: Request, res: Response) => {
  const { projectPath } = req.body;

  if (!projectPath || typeof projectPath !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'projectPath is required',
    });
  }

  try {
    const summary = await getQuickProjectSummary(projectPath);

    return res.json({
      success: true,
      summary,
    });
  } catch (error) {
    logger.error('Quick summary failed', error instanceof Error ? error : undefined);

    return res.status(500).json({
      success: false,
      error: 'Summary generation failed',
    });
  }
});

/**
 * POST /structure
 * Get project file structure
 */
router.post('/structure', async (req: Request, res: Response) => {
  const { projectPath, maxDepth = 3 } = req.body;

  if (!projectPath || typeof projectPath !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'projectPath is required',
    });
  }

  try {
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
  } catch (error) {
    logger.error('Structure scan failed', error instanceof Error ? error : undefined);

    return res.status(500).json({
      success: false,
      error: 'Structure scan failed',
    });
  }
});

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
