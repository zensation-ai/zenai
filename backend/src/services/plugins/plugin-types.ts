/**
 * Phase 51: Plugin & Extension System - Shared Types
 *
 * Type definitions for the plugin system including manifests,
 * permissions, entry points, and plugin instances.
 */

export type PluginStatus = 'active' | 'inactive' | 'error' | 'installing';

export type PluginPermission =
  | 'read_ideas'
  | 'write_ideas'
  | 'read_tasks'
  | 'write_tasks'
  | 'read_memory'
  | 'write_memory'
  | 'use_ai'
  | 'web_access'
  | 'send_notifications';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: PluginPermission[];
  entryPoints: PluginEntryPoint[];
  config?: PluginConfigSchema[];
}

export type PluginEntryPoint =
  | { type: 'tool'; toolName: string; description: string }
  | { type: 'automation_action'; actionName: string }
  | { type: 'event_listener'; events: string[] }
  | { type: 'api_route'; basePath: string };

export interface PluginConfigSchema {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  label: string;
  default?: unknown;
  options?: { value: string; label: string }[];
  required?: boolean;
}

export interface PluginInstance {
  id: string;
  pluginId: string;
  name: string;
  version: string;
  status: PluginStatus;
  config: Record<string, unknown>;
  permissions: PluginPermission[];
  installedAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface PluginEvent {
  type: string;
  source: string;
  data: Record<string, unknown>;
  timestamp: string;
  context?: string;
}
