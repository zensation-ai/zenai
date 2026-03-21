/**
 * Phase 75: Extension System Routes
 *
 * CRUD + marketplace API for the plugin/extension system.
 * Supports listing available extensions, installing/uninstalling,
 * enabling/disabling, and executing extension actions.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import { getExtensionRegistry, type ExtensionType, type ExtensionCategory } from '../services/extensions/extension-registry';
import { getExtensionSandbox } from '../services/extensions/extension-sandbox';
import { logger } from '../utils/logger';

const router = Router();

// ===========================================
// Type Guards
// ===========================================

const VALID_EXTENSION_TYPES: readonly ExtensionType[] = ['tool', 'widget', 'theme', 'integration', 'agent'];
const VALID_EXTENSION_CATEGORIES: readonly ExtensionCategory[] = ['productivity', 'developer', 'ai', 'appearance', 'communication'];

function isValidExtensionType(value: unknown): value is ExtensionType {
  return typeof value === 'string' && VALID_EXTENSION_TYPES.includes(value as ExtensionType);
}

function isValidExtensionCategory(value: unknown): value is ExtensionCategory {
  return typeof value === 'string' && VALID_EXTENSION_CATEGORIES.includes(value as ExtensionCategory);
}

// All extension routes require authentication
router.use(apiKeyAuth);

// ===========================================
// List Available Extensions (Catalog)
// ===========================================

/**
 * GET /api/extensions
 * List all available extensions with optional filters.
 * Query params: type, category, search
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { type, category, search } = req.query;

    const registry = getExtensionRegistry();
    const extensions = await registry.listExtensions(userId, {
      type: isValidExtensionType(type) ? type : undefined,
      category: isValidExtensionCategory(category) ? category : undefined,
      search: search as string,
    });

    res.json({
      success: true,
      data: extensions,
      total: extensions.length,
    });
  })
);

// ===========================================
// List Installed Extensions
// ===========================================

/**
 * GET /api/extensions/installed
 * List user's installed extensions.
 */
router.get(
  '/installed',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const registry = getExtensionRegistry();
    const extensions = await registry.getInstalledExtensions(userId);

    res.json({
      success: true,
      data: extensions,
      total: extensions.length,
    });
  })
);

// ===========================================
// Get Extension Details
// ===========================================

/**
 * GET /api/extensions/:id
 * Get a single extension's details.
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getExtensionRegistry();
    const extension = await registry.getExtension(req.params.id);

    if (!extension) {
      res.status(404).json({
        success: false,
        error: 'Extension not found',
      });
      return;
    }

    res.json({
      success: true,
      data: extension,
    });
  })
);

// ===========================================
// Install Extension
// ===========================================

/**
 * POST /api/extensions/:id/install
 * Install an extension for the current user.
 * Body: { permissions: string[] }
 */
router.post(
  '/:id/install',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const extensionId = req.params.id;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      res.status(400).json({
        success: false,
        error: 'permissions must be an array of strings',
      });
      return;
    }

    const registry = getExtensionRegistry();

    try {
      const userExtension = await registry.installExtension(userId, extensionId, permissions);

      logger.info('Extension installed via API', {
        operation: 'extensions',
        extensionId,
        userId,
      });

      res.status(201).json({
        success: true,
        data: userExtension,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Install failed';
      const status = message.includes('not found') ? 404 : message.includes('already installed') ? 409 : 400;

      logger.warn('Extension install failed', { error, operation: 'extensions.install', extensionId, userId });
      res.status(status).json({
        success: false,
        error: message,
      });
    }
  })
);

// ===========================================
// Uninstall Extension
// ===========================================

/**
 * POST /api/extensions/:id/uninstall
 * Uninstall an extension for the current user.
 */
router.post(
  '/:id/uninstall',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const extensionId = req.params.id;

    const registry = getExtensionRegistry();

    try {
      await registry.uninstallExtension(userId, extensionId);

      res.json({
        success: true,
        message: 'Extension uninstalled',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Uninstall failed';
      logger.warn('Extension uninstall failed', { error, operation: 'extensions.uninstall', extensionId, userId });
      res.status(404).json({
        success: false,
        error: message,
      });
    }
  })
);

// ===========================================
// Enable Extension
// ===========================================

/**
 * POST /api/extensions/:id/enable
 * Enable an installed extension.
 */
router.post(
  '/:id/enable',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const extensionId = req.params.id;

    const registry = getExtensionRegistry();

    try {
      const userExtension = await registry.enableExtension(userId, extensionId);

      res.json({
        success: true,
        data: userExtension,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enable failed';
      logger.warn('Extension enable failed', { error, operation: 'extensions.enable', extensionId, userId });
      res.status(404).json({
        success: false,
        error: message,
      });
    }
  })
);

// ===========================================
// Disable Extension
// ===========================================

/**
 * POST /api/extensions/:id/disable
 * Disable an installed extension.
 */
router.post(
  '/:id/disable',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const extensionId = req.params.id;

    const registry = getExtensionRegistry();

    try {
      const userExtension = await registry.disableExtension(userId, extensionId);

      res.json({
        success: true,
        data: userExtension,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Disable failed';
      logger.warn('Extension disable failed', { error, operation: 'extensions.disable', extensionId, userId });
      res.status(404).json({
        success: false,
        error: message,
      });
    }
  })
);

// ===========================================
// Execute Extension Action
// ===========================================

/**
 * POST /api/extensions/:id/execute
 * Execute an extension action in the sandbox.
 * Body: { action: string, params: object }
 */
router.post(
  '/:id/execute',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const extensionId = req.params.id;
    const { action, params } = req.body;

    if (!action || typeof action !== 'string') {
      res.status(400).json({
        success: false,
        error: 'action is required and must be a string',
      });
      return;
    }

    // Check extension is installed and enabled
    const registry = getExtensionRegistry();
    const installed = await registry.getInstalledExtensions(userId);
    const userExt = installed.find(e => e.id === extensionId);

    if (!userExt) {
      res.status(404).json({
        success: false,
        error: 'Extension not installed',
      });
      return;
    }

    if (!userExt.enabled) {
      res.status(403).json({
        success: false,
        error: 'Extension is disabled',
      });
      return;
    }

    const sandbox = getExtensionSandbox();
    const result = await sandbox.executeExtension({
      extensionId,
      action,
      params: params || {},
      userId,
      permissionsGranted: userExt.permissions_granted || [],
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
        duration_ms: result.duration_ms,
      });
      return;
    }

    res.json({
      success: true,
      data: result.data,
      duration_ms: result.duration_ms,
    });
  })
);

export { router as extensionsRouter };
