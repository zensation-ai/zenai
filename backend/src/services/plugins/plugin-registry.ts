/**
 * Phase 51: Plugin Registry
 *
 * Manages plugin lifecycle: install, activate, deactivate, uninstall.
 * Keeps an in-memory map of active plugins for fast lookups.
 * Persists plugin state to the `plugins` table per context schema.
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import {
  PluginInstance,
  PluginManifest,
  PluginPermission,
  PluginStatus,
} from './plugin-types';

// In-memory cache of active plugins keyed by `${context}:${pluginId}`
const activePlugins = new Map<string, PluginInstance>();

/**
 * Map a database row to a PluginInstance object.
 */
function mapRowToPlugin(row: Record<string, unknown>): PluginInstance {
  return {
    id: row.id as string,
    pluginId: row.plugin_id as string,
    name: row.name as string,
    version: row.version as string,
    status: row.status as PluginStatus,
    config: (row.config as Record<string, unknown>) || {},
    permissions: ((row.permissions as string[]) || []) as PluginPermission[],
    installedAt: row.installed_at as string,
    updatedAt: row.updated_at as string,
    errorMessage: row.error_message as string | undefined,
  };
}

/**
 * Install a new plugin from its manifest.
 */
export async function installPlugin(
  context: AIContext,
  manifest: PluginManifest,
  config?: Record<string, unknown>
): Promise<PluginInstance> {
  const pluginConfig = config || {};

  // Apply defaults from manifest config schema
  if (manifest.config) {
    for (const schema of manifest.config) {
      if (schema.default !== undefined && !(schema.key in pluginConfig)) {
        pluginConfig[schema.key] = schema.default;
      }
    }
  }

  const result = await queryContext(
    context,
    `INSERT INTO plugins (plugin_id, name, version, status, config, manifest, permissions)
     VALUES ($1, $2, $3, 'inactive', $4, $5, $6)
     RETURNING *`,
    [
      manifest.id,
      manifest.name,
      manifest.version,
      JSON.stringify(pluginConfig),
      JSON.stringify(manifest),
      manifest.permissions,
    ]
  );

  const plugin = mapRowToPlugin(result.rows[0]);
  logger.info(`Plugin installed: ${manifest.name} (${manifest.id}) in ${context}`);
  return plugin;
}

/**
 * Activate an installed plugin.
 */
export async function activatePlugin(
  context: AIContext,
  pluginId: string
): Promise<PluginInstance> {
  const result = await queryContext(
    context,
    `UPDATE plugins SET status = 'active', error_message = NULL, updated_at = NOW()
     WHERE plugin_id = $1 AND status != 'active'
     RETURNING *`,
    [pluginId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Plugin not found or already active: ${pluginId}`);
  }

  const plugin = mapRowToPlugin(result.rows[0]);
  activePlugins.set(`${context}:${pluginId}`, plugin);
  logger.info(`Plugin activated: ${plugin.name} (${pluginId}) in ${context}`);
  return plugin;
}

/**
 * Deactivate an active plugin.
 */
export async function deactivatePlugin(
  context: AIContext,
  pluginId: string
): Promise<PluginInstance> {
  const result = await queryContext(
    context,
    `UPDATE plugins SET status = 'inactive', updated_at = NOW()
     WHERE plugin_id = $1 AND status = 'active'
     RETURNING *`,
    [pluginId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Plugin not found or not active: ${pluginId}`);
  }

  const plugin = mapRowToPlugin(result.rows[0]);
  activePlugins.delete(`${context}:${pluginId}`);
  logger.info(`Plugin deactivated: ${plugin.name} (${pluginId}) in ${context}`);
  return plugin;
}

/**
 * Uninstall a plugin completely.
 */
export async function uninstallPlugin(
  context: AIContext,
  pluginId: string
): Promise<void> {
  const result = await queryContext(
    context,
    `DELETE FROM plugins WHERE plugin_id = $1 RETURNING plugin_id, name`,
    [pluginId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  activePlugins.delete(`${context}:${pluginId}`);
  logger.info(`Plugin uninstalled: ${result.rows[0].name} (${pluginId}) from ${context}`);
}

/**
 * Get a single plugin by its plugin_id.
 */
export async function getPlugin(
  context: AIContext,
  pluginId: string
): Promise<PluginInstance | null> {
  const result = await queryContext(
    context,
    `SELECT * FROM plugins WHERE plugin_id = $1`,
    [pluginId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToPlugin(result.rows[0]);
}

/**
 * List all plugins, optionally filtered by status.
 */
export async function listPlugins(
  context: AIContext,
  status?: PluginStatus
): Promise<PluginInstance[]> {
  let sql = 'SELECT * FROM plugins';
  const params: (string | number | boolean | null)[] = [];

  if (status) {
    sql += ' WHERE status = $1';
    params.push(status);
  }

  sql += ' ORDER BY installed_at DESC';

  const result = await queryContext(context, sql, params);
  return result.rows.map(mapRowToPlugin);
}

/**
 * Update the configuration of an installed plugin.
 */
export async function updatePluginConfig(
  context: AIContext,
  pluginId: string,
  config: Record<string, unknown>
): Promise<PluginInstance> {
  const result = await queryContext(
    context,
    `UPDATE plugins SET config = $1, updated_at = NOW()
     WHERE plugin_id = $2
     RETURNING *`,
    [JSON.stringify(config), pluginId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  const plugin = mapRowToPlugin(result.rows[0]);

  // Update in-memory cache if active
  const cacheKey = `${context}:${pluginId}`;
  if (activePlugins.has(cacheKey)) {
    activePlugins.set(cacheKey, plugin);
  }

  logger.info(`Plugin config updated: ${plugin.name} (${pluginId}) in ${context}`);
  return plugin;
}

/**
 * Get all active plugins from the in-memory cache.
 */
export function getActivePlugins(): Map<string, PluginInstance> {
  return new Map(activePlugins);
}

/**
 * Load active plugins from the database into the in-memory cache.
 * Called during startup to restore state.
 */
export async function loadActivePlugins(context: AIContext): Promise<number> {
  const result = await queryContext(
    context,
    `SELECT * FROM plugins WHERE status = 'active'`,
    []
  );

  let count = 0;
  for (const row of result.rows) {
    const plugin = mapRowToPlugin(row);
    activePlugins.set(`${context}:${plugin.pluginId}`, plugin);
    count++;
  }

  if (count > 0) {
    logger.info(`Loaded ${count} active plugins for context: ${context}`);
  }

  return count;
}
