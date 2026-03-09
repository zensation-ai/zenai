/**
 * Phase 51: Plugin Sandbox
 *
 * Permission-based execution sandbox that controls what tables
 * and operations a plugin can access based on its declared permissions.
 */

import { logger } from '../../utils/logger';
import { PluginInstance, PluginPermission } from './plugin-types';

export interface SandboxContext {
  pluginId: string;
  pluginName: string;
  context: string;
  permissions: PluginPermission[];
  allowedReads: Set<string>;
  allowedWrites: Set<string>;
}

/**
 * Permission-to-table access mapping.
 * Each permission grants read and/or write access to specific tables.
 */
const PERMISSION_TABLE_MAP: Record<
  PluginPermission,
  { read: string[]; write: string[] }
> = {
  read_ideas: { read: ['ideas'], write: [] },
  write_ideas: { read: ['ideas'], write: ['ideas'] },
  read_tasks: { read: ['tasks'], write: [] },
  write_tasks: { read: ['tasks'], write: ['tasks'] },
  read_memory: {
    read: ['memory', 'long_term_memory', 'working_memory', 'episodic_memories'],
    write: [],
  },
  write_memory: {
    read: ['memory', 'long_term_memory', 'working_memory', 'episodic_memories'],
    write: ['memory', 'long_term_memory'],
  },
  use_ai: { read: [], write: [] },
  web_access: { read: [], write: [] },
  send_notifications: { read: [], write: [] },
};

/**
 * Create a sandbox context for a plugin with pre-computed access tables.
 */
export function createSandbox(plugin: PluginInstance, context: string): SandboxContext {
  const allowedReads = new Set<string>();
  const allowedWrites = new Set<string>();

  for (const permission of plugin.permissions) {
    const mapping = PERMISSION_TABLE_MAP[permission];
    if (mapping) {
      for (const table of mapping.read) {
        allowedReads.add(table);
      }
      for (const table of mapping.write) {
        allowedWrites.add(table);
      }
    }
  }

  logger.info(
    `Sandbox created for plugin "${plugin.name}" in ${context}: ` +
      `reads=[${[...allowedReads].join(',')}], writes=[${[...allowedWrites].join(',')}]`
  );

  return {
    pluginId: plugin.pluginId,
    pluginName: plugin.name,
    context,
    permissions: plugin.permissions,
    allowedReads,
    allowedWrites,
  };
}

/**
 * Check if the sandbox has a specific permission.
 */
export function hasPermission(
  sandbox: SandboxContext,
  required: PluginPermission
): boolean {
  return sandbox.permissions.includes(required);
}

/**
 * Require a permission, throwing an error if it's missing.
 */
export function requirePermission(
  sandbox: SandboxContext,
  required: PluginPermission
): void {
  if (!hasPermission(sandbox, required)) {
    throw new Error(
      `Plugin "${sandbox.pluginName}" lacks required permission: ${required}`
    );
  }
}

/**
 * Validate that the sandbox allows the given operation on a table.
 * Throws an error if the operation is not permitted.
 */
export function sandboxQuery(
  sandbox: SandboxContext,
  table: string,
  operation: 'read' | 'write'
): void {
  const allowed =
    operation === 'read' ? sandbox.allowedReads : sandbox.allowedWrites;

  if (!allowed.has(table)) {
    throw new Error(
      `Plugin "${sandbox.pluginName}" is not allowed to ${operation} table "${table}". ` +
        `Granted ${operation} tables: [${[...allowed].join(', ')}]`
    );
  }
}
