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
import path from 'path';

const router = Router();

/**
 * Validate and sanitize a project path to prevent path traversal attacks.
 * - Must be an absolute path
 * - Must not contain null bytes
 * - Must not traverse outside the resolved root
 * - Must not access sensitive system directories
 */
function validateProjectPath(inputPath: string): string {
  // Reject null bytes (can bypass checks in some systems)
  if (inputPath.includes('\0')) {
    throw new ValidationError('Invalid path: null bytes not allowed');
  }

  // Must be an absolute path
  if (!path.isAbsolute(inputPath)) {
    throw new ValidationError('projectPath must be an absolute path');
  }

  // Resolve to canonical form (eliminates .., ., symlinks in path string)
  const resolved = path.resolve(inputPath);

  // Block sensitive system directories
  const blockedPrefixes = ['/etc', '/proc', '/sys', '/dev', '/var/run', '/root/.ssh', '/root/.gnupg'];
  for (const blocked of blockedPrefixes) {
    if (resolved.startsWith(blocked)) {
      throw new ValidationError(`Access denied: ${blocked} is a restricted path`);
    }
  }

  return resolved;
}

/**
 * POST /analyze
 * Analyze a project and return comprehensive context
 */
router.post('/analyze', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { projectPath } = req.body;

  if (!projectPath || typeof projectPath !== 'string') {
    throw new ValidationError('projectPath is required');
  }

  const safePath = validateProjectPath(projectPath);

  logger.info('Analyzing project', { path: safePath });

  const context = await generateProjectContext(safePath);

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

  const safePath = validateProjectPath(projectPath);

  const summary = await getQuickProjectSummary(safePath);

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

  const safePath = validateProjectPath(projectPath);

  // Validate maxDepth to prevent excessive recursion
  const safeMaxDepth = Math.min(Math.max(1, Number(maxDepth) || 3), 10);

  const structure = await scanProjectStructure(safePath, safeMaxDepth);

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
