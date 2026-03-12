/**
 * Phase 51: Plugin & Extension System Routes
 *
 * REST API for managing plugins: install, activate, deactivate,
 * configure, and uninstall. Includes a hardcoded marketplace listing.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { validateContextParam } from '../utils/validation';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { isValidContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import {
  installPlugin,
  activatePlugin,
  deactivatePlugin,
  uninstallPlugin,
  getPlugin,
  listPlugins,
  updatePluginConfig,
} from '../services/plugins/plugin-registry';
import { PluginStatus } from '../services/plugins/plugin-types';

export const pluginsRouter = Router();

// All routes require API key auth
pluginsRouter.use(apiKeyAuth);

const VALID_STATUSES: PluginStatus[] = ['active', 'inactive', 'error', 'installing'];

const MARKETPLACE_PLUGINS = [
  {
    id: 'pomodoro-timer',
    name: 'Pomodoro Timer',
    version: '1.0.0',
    description: 'Focus timer with task integration',
    author: 'ZenAI',
    permissions: ['read_tasks', 'send_notifications'],
  },
  {
    id: 'markdown-export',
    name: 'Markdown Export',
    version: '1.0.0',
    description: 'Export ideas and documents as Markdown',
    author: 'ZenAI',
    permissions: ['read_ideas'],
  },
  {
    id: 'daily-digest',
    name: 'Daily Digest',
    version: '1.0.0',
    description: 'AI-generated daily summary email',
    author: 'ZenAI',
    permissions: ['read_ideas', 'read_tasks', 'use_ai', 'send_notifications'],
  },
  {
    id: 'github-sync',
    name: 'GitHub Sync',
    version: '1.0.0',
    description: 'Sync tasks with GitHub Issues',
    author: 'ZenAI',
    permissions: ['read_tasks', 'write_tasks', 'web_access'],
  },
  {
    id: 'voice-notes',
    name: 'Voice Notes',
    version: '1.0.0',
    description: 'Quick voice memos with AI transcription',
    author: 'ZenAI',
    permissions: ['write_ideas', 'use_ai'],
  },
];

/**
 * GET /api/:context/plugins
 * List installed plugins with optional status filter
 */
pluginsRouter.get(
  '/:context/plugins',
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const statusFilter = req.query.status as string | undefined;
    if (statusFilter && !VALID_STATUSES.includes(statusFilter as PluginStatus)) {
      throw new ValidationError('Invalid status filter', {
        status: `Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const plugins = await listPlugins(
      context,
      statusFilter as PluginStatus | undefined
    );

    return res.json({ success: true, data: plugins });
  })
);

/**
 * GET /api/:context/plugins/marketplace
 * List available plugins from the marketplace
 */
pluginsRouter.get(
  '/:context/plugins/marketplace',
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    return res.json({ success: true, data: MARKETPLACE_PLUGINS });
  })
);

/**
 * GET /api/:context/plugins/:id
 * Get a single installed plugin
 */
pluginsRouter.get(
  '/:context/plugins/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const plugin = await getPlugin(context, req.params.id);
    if (!plugin) {
      return res.status(404).json({ success: false, error: 'Plugin not found' });
    }

    return res.json({ success: true, data: plugin });
  })
);

/**
 * POST /api/:context/plugins
 * Install a new plugin from manifest
 */
pluginsRouter.post(
  '/:context/plugins',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { manifest, config } = req.body;
    if (!manifest || !manifest.id || !manifest.name || !manifest.version) {
      throw new ValidationError('Invalid manifest', {
        manifest: 'Must include id, name, and version',
      });
    }

    // Check if already installed
    const existing = await getPlugin(context, manifest.id);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Plugin "${manifest.id}" is already installed`,
      });
    }

    const plugin = await installPlugin(context, manifest, config);
    return res.status(201).json({ success: true, data: plugin });
  })
);

/**
 * PUT /api/:context/plugins/:id/activate
 * Activate an installed plugin
 */
pluginsRouter.put(
  '/:context/plugins/:id/activate',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    try {
      const plugin = await activatePlugin(context, req.params.id);
      return res.json({ success: true, data: plugin });
    } catch (err) {
      logger.error(
        `Failed to activate plugin ${req.params.id}`,
        err instanceof Error ? err : undefined
      );
      return res.status(404).json({
        success: false,
        error: err instanceof Error ? err.message : 'Plugin not found or already active',
      });
    }
  })
);

/**
 * PUT /api/:context/plugins/:id/deactivate
 * Deactivate an active plugin
 */
pluginsRouter.put(
  '/:context/plugins/:id/deactivate',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    try {
      const plugin = await deactivatePlugin(context, req.params.id);
      return res.json({ success: true, data: plugin });
    } catch (err) {
      logger.error(
        `Failed to deactivate plugin ${req.params.id}`,
        err instanceof Error ? err : undefined
      );
      return res.status(404).json({
        success: false,
        error: err instanceof Error ? err.message : 'Plugin not found or not active',
      });
    }
  })
);

/**
 * PUT /api/:context/plugins/:id/config
 * Update plugin configuration
 */
pluginsRouter.put(
  '/:context/plugins/:id/config',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { config } = req.body;
    if (!config || typeof config !== 'object') {
      throw new ValidationError('Invalid config', {
        config: 'Must be a JSON object',
      });
    }

    try {
      const plugin = await updatePluginConfig(context, req.params.id, config);
      return res.json({ success: true, data: plugin });
    } catch (err) {
      logger.error(
        `Failed to update plugin config ${req.params.id}`,
        err instanceof Error ? err : undefined
      );
      return res.status(404).json({
        success: false,
        error: err instanceof Error ? err.message : 'Plugin not found',
      });
    }
  })
);

/**
 * DELETE /api/:context/plugins/:id
 * Uninstall a plugin
 */
pluginsRouter.delete(
  '/:context/plugins/:id',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    try {
      await uninstallPlugin(context, req.params.id);
      return res.json({ success: true, message: 'Plugin uninstalled' });
    } catch (err) {
      logger.error(
        `Failed to uninstall plugin ${req.params.id}`,
        err instanceof Error ? err : undefined
      );
      return res.status(404).json({
        success: false,
        error: err instanceof Error ? err.message : 'Plugin not found',
      });
    }
  })
);
