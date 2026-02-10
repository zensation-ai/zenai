/**
 * Code Execution Routes
 *
 * Provides secure code execution capabilities via API.
 * Endpoints:
 * - POST /api/code/execute - Execute code from task description (auth required)
 * - POST /api/code/run - Execute pre-written code directly (auth required)
 * - POST /api/code/validate - Validate code safety (auth required)
 * - GET /api/code/health - Check code execution service health (public)
 * - GET /api/code/languages - List supported languages (public)
 *
 * @module routes/code-execution
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  executeCodeFromTask,
  executeCodeDirect,
  checkCodeExecutionHealth,
  isCodeExecutionEnabled,
  validateCode,
  LANGUAGE_CONFIGS,
  isSupportedLanguage,
  SupportedLanguage,
  MAX_CODE_LENGTH,
  MAX_INPUT_DATA_LENGTH,
} from '../services/code-execution';

export const codeExecutionRouter = Router();

// ===========================================
// Execute Code from Task
// ===========================================

/**
 * POST /api/code/execute
 * Generate and execute code from a natural language task description
 *
 * @body task - Natural language task description (required)
 * @body language - Programming language: python, nodejs, bash (required)
 * @body context - Additional context for code generation (optional)
 * @body inputData - Input data for the code to process (optional)
 */
codeExecutionRouter.post(
  '/execute',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { task, language, context, inputData } = req.body;

    // Validate required fields
    if (!task || typeof task !== 'string') {
      throw new ValidationError('Task description is required');
    }

    if (!language || typeof language !== 'string') {
      throw new ValidationError('Language is required');
    }

    if (!isSupportedLanguage(language)) {
      throw new ValidationError(
        `Unsupported language: ${language}. Supported: python, nodejs, bash`
      );
    }

    // Validate lengths
    if (task.length > 5000) {
      throw new ValidationError('Task description is too long (max 5000 characters)');
    }

    if (context && context.length > 2000) {
      throw new ValidationError('Context is too long (max 2000 characters)');
    }

    if (inputData && inputData.length > MAX_INPUT_DATA_LENGTH) {
      throw new ValidationError(
        `Input data is too long (max ${MAX_INPUT_DATA_LENGTH} characters)`
      );
    }

    logger.info('Code execution request', {
      language,
      taskLength: task.length,
      hasContext: !!context,
      hasInputData: !!inputData,
    });

    const result = await executeCodeFromTask({
      task,
      language: language as SupportedLanguage,
      context,
      inputData,
    });

    const status = result.success ? 200 : 400;

    const { success: _success, ...resultFields } = result;
    res.status(status).json({
      success: result.success,
      ...resultFields,
    });
  })
);

// ===========================================
// Execute Pre-written Code
// ===========================================

/**
 * POST /api/code/run
 * Execute pre-written code directly (no generation)
 *
 * @body code - The source code to execute (required)
 * @body language - Programming language: python, nodejs, bash (required)
 */
codeExecutionRouter.post(
  '/run',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { code, language } = req.body;

    // Validate required fields
    if (!code || typeof code !== 'string') {
      throw new ValidationError('Code is required');
    }

    if (!language || typeof language !== 'string') {
      throw new ValidationError('Language is required');
    }

    if (!isSupportedLanguage(language)) {
      throw new ValidationError(
        `Unsupported language: ${language}. Supported: python, nodejs, bash`
      );
    }

    // Validate code length
    if (code.length > MAX_CODE_LENGTH) {
      throw new ValidationError(
        `Code is too long (max ${MAX_CODE_LENGTH} characters)`
      );
    }

    logger.info('Direct code execution request', {
      language,
      codeLength: code.length,
    });

    const result = await executeCodeDirect(code, language as SupportedLanguage);

    const status = result.success ? 200 : 400;

    const { success: _success, ...resultFields } = result;
    res.status(status).json({
      success: result.success,
      ...resultFields,
    });
  })
);

// ===========================================
// Validate Code
// ===========================================

/**
 * POST /api/code/validate
 * Validate code for security without executing
 *
 * @body code - The source code to validate (required)
 * @body language - Programming language (required)
 */
codeExecutionRouter.post(
  '/validate',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { code, language } = req.body;

    // Validate required fields
    if (!code || typeof code !== 'string') {
      throw new ValidationError('Code is required');
    }

    if (!language || typeof language !== 'string') {
      throw new ValidationError('Language is required');
    }

    if (!isSupportedLanguage(language)) {
      throw new ValidationError(
        `Unsupported language: ${language}. Supported: python, nodejs, bash`
      );
    }

    const result = validateCode(code, language as SupportedLanguage);

    res.json({
      success: true,
      safe: result.safe,
      score: result.score,
      violations: result.violations,
      warnings: result.warnings,
    });
  })
);

// ===========================================
// Service Health
// ===========================================

/**
 * GET /api/code/health
 * Check the health of the code execution service
 */
codeExecutionRouter.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response) => {
    const health = await checkCodeExecutionHealth();

    const status = health.available ? 200 : 503;

    res.status(status).json({
      success: health.available,
      ...health,
    });
  })
);

// ===========================================
// List Languages
// ===========================================

/**
 * GET /api/code/languages
 * List supported programming languages and their configurations
 */
codeExecutionRouter.get(
  '/languages',
  asyncHandler(async (_req: Request, res: Response) => {
    const languages = Object.entries(LANGUAGE_CONFIGS).map(([key, config]) => ({
      id: key,
      name: config.displayName,
      extension: config.extension,
      availablePackages: config.availablePackages,
    }));

    res.json({
      success: true,
      languages,
      enabled: isCodeExecutionEnabled(),
    });
  })
);

