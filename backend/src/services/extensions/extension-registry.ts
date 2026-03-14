/**
 * Phase 75: Extension Registry
 *
 * Manages extension metadata, installation, and versioning.
 * Extensions are catalog-based in v1 - no actual user-uploaded code.
 * Built-in catalog of 5 example extensions across different types.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export type ExtensionType = 'tool' | 'widget' | 'theme' | 'integration' | 'agent';

export type ExtensionCategory = 'productivity' | 'developer' | 'ai' | 'appearance' | 'communication';

export interface ExtensionManifest {
  name: string;
  description: string;
  version: string;
  author: string;
  type: ExtensionType;
  category: ExtensionCategory;
  icon: string;
  permissions: string[];
  entry_point: string;
  config_schema?: Record<string, unknown>;
  min_version?: string;
}

export interface Extension {
  id: string;
  name: string;
  version: string;
  type: ExtensionType;
  manifest: ExtensionManifest;
  entry_point: string;
  permissions: string[];
  author: string;
  category: ExtensionCategory;
  created_at: string;
}

export interface UserExtension {
  id: string;
  user_id: string;
  extension_id: string;
  enabled: boolean;
  permissions_granted: string[];
  installed_at: string;
  extension?: Extension;
}

export interface ExtensionWithInstallStatus extends Extension {
  installed: boolean;
  enabled: boolean;
  installed_at?: string;
  permissions_granted?: string[];
}

export interface ListExtensionsFilters {
  type?: ExtensionType;
  category?: ExtensionCategory;
  search?: string;
}

// ===========================================
// Built-in Extension Catalog
// ===========================================

const BUILT_IN_EXTENSIONS: Extension[] = [
  {
    id: 'ext-pomodoro-timer',
    name: 'Pomodoro Timer',
    version: '1.0.0',
    type: 'widget',
    manifest: {
      name: 'Pomodoro Timer',
      description: 'Focus timer with configurable work/break intervals. Integrates with task tracking to log focused time.',
      version: '1.0.0',
      author: 'ZenAI Team',
      type: 'widget',
      category: 'productivity',
      icon: 'timer',
      permissions: ['tasks.read', 'notifications.send'],
      entry_point: 'widgets/pomodoro',
    },
    entry_point: 'widgets/pomodoro',
    permissions: ['tasks.read', 'notifications.send'],
    author: 'ZenAI Team',
    category: 'productivity',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ext-dark-code-theme',
    name: 'Dark Code Theme',
    version: '1.2.0',
    type: 'theme',
    manifest: {
      name: 'Dark Code Theme',
      description: 'A developer-focused dark theme with enhanced syntax highlighting colors optimized for long coding sessions.',
      version: '1.2.0',
      author: 'ZenAI Team',
      type: 'theme',
      category: 'appearance',
      icon: 'palette',
      permissions: ['ui.theme'],
      entry_point: 'themes/dark-code',
    },
    entry_point: 'themes/dark-code',
    permissions: ['ui.theme'],
    author: 'ZenAI Team',
    category: 'appearance',
    created_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 'ext-github-commits',
    name: 'GitHub Commits',
    version: '2.0.0',
    type: 'integration',
    manifest: {
      name: 'GitHub Commits',
      description: 'Display recent GitHub commits in your dashboard. Links commits to tasks and shows contribution analytics.',
      version: '2.0.0',
      author: 'ZenAI Team',
      type: 'integration',
      category: 'developer',
      icon: 'git-commit',
      permissions: ['github.read', 'dashboard.widget'],
      entry_point: 'integrations/github-commits',
    },
    entry_point: 'integrations/github-commits',
    permissions: ['github.read', 'dashboard.widget'],
    author: 'ZenAI Team',
    category: 'developer',
    created_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 'ext-ai-summarizer',
    name: 'AI Summarizer',
    version: '1.1.0',
    type: 'tool',
    manifest: {
      name: 'AI Summarizer',
      description: 'Summarize long documents, emails, and chat threads with one click. Uses Claude for high-quality summaries.',
      version: '1.1.0',
      author: 'ZenAI Team',
      type: 'tool',
      category: 'ai',
      icon: 'sparkles',
      permissions: ['documents.read', 'emails.read', 'ai.invoke'],
      entry_point: 'tools/ai-summarizer',
    },
    entry_point: 'tools/ai-summarizer',
    permissions: ['documents.read', 'emails.read', 'ai.invoke'],
    author: 'ZenAI Team',
    category: 'ai',
    created_at: '2026-02-15T00:00:00Z',
  },
  {
    id: 'ext-research-agent',
    name: 'Research Agent',
    version: '1.0.0',
    type: 'agent',
    manifest: {
      name: 'Research Agent',
      description: 'Autonomous research agent that can search the web, gather information, and compile structured research reports.',
      version: '1.0.0',
      author: 'ZenAI Team',
      type: 'agent',
      category: 'ai',
      icon: 'search',
      permissions: ['web.search', 'documents.write', 'ai.invoke', 'memory.write'],
      entry_point: 'agents/researcher',
    },
    entry_point: 'agents/researcher',
    permissions: ['web.search', 'documents.write', 'ai.invoke', 'memory.write'],
    author: 'ZenAI Team',
    category: 'ai',
    created_at: '2026-03-01T00:00:00Z',
  },
];

// ===========================================
// Extension Registry Service
// ===========================================

class ExtensionRegistry {
  /**
   * List all extensions with optional user install status.
   */
  async listExtensions(
    userId: string,
    filters?: ListExtensionsFilters
  ): Promise<ExtensionWithInstallStatus[]> {
    let catalog = [...BUILT_IN_EXTENSIONS];

    // Also fetch any DB-stored extensions
    try {
      const { pool } = await import('../../utils/database-context');
      const dbResult = await pool.query(
        'SELECT * FROM public.extensions ORDER BY created_at DESC'
      );
      const dbExtensions = dbResult.rows as Extension[];
      // Merge, dedup by id (built-in takes priority)
      const builtInIds = new Set(catalog.map(e => e.id));
      for (const ext of dbExtensions) {
        if (!builtInIds.has(ext.id)) {
          catalog.push(ext);
        }
      }
    } catch {
      // DB may not have the table yet, use built-in only
      logger.debug('Extensions table not available, using built-in catalog only', {
        operation: 'listExtensions',
      });
    }

    // Apply filters
    if (filters?.type) {
      catalog = catalog.filter(e => e.type === filters.type);
    }
    if (filters?.category) {
      catalog = catalog.filter(e => e.category === filters.category);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      catalog = catalog.filter(
        e =>
          e.name.toLowerCase().includes(search) ||
          e.manifest.description.toLowerCase().includes(search)
      );
    }

    // Fetch user installations
    const userInstalls: Map<string, UserExtension> = new Map();
    try {
      const { pool } = await import('../../utils/database-context');
      const installResult = await pool.query(
        'SELECT * FROM public.user_extensions WHERE user_id = $1',
        [userId]
      );
      for (const row of installResult.rows as UserExtension[]) {
        userInstalls.set(row.extension_id, row);
      }
    } catch {
      // Table may not exist yet
    }

    return catalog.map(ext => {
      const install = userInstalls.get(ext.id);
      return {
        ...ext,
        installed: !!install,
        enabled: install?.enabled ?? false,
        installed_at: install?.installed_at,
        permissions_granted: install?.permissions_granted,
      };
    });
  }

  /**
   * Get a single extension by ID.
   */
  async getExtension(id: string): Promise<Extension | null> {
    // Check built-in catalog first
    const builtIn = BUILT_IN_EXTENSIONS.find(e => e.id === id);
    if (builtIn) return builtIn;

    // Check database
    try {
      const { pool } = await import('../../utils/database-context');
      const result = await pool.query(
        'SELECT * FROM public.extensions WHERE id = $1',
        [id]
      );
      if (result.rows.length > 0) {
        return result.rows[0] as Extension;
      }
    } catch {
      // Table may not exist
    }

    return null;
  }

  /**
   * Install an extension for a user.
   */
  async installExtension(
    userId: string,
    extensionId: string,
    permissions: string[]
  ): Promise<UserExtension> {
    const extension = await this.getExtension(extensionId);
    if (!extension) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    // Validate permissions are a subset of available permissions
    const invalidPermissions = permissions.filter(
      p => !extension.permissions.includes(p)
    );
    if (invalidPermissions.length > 0) {
      throw new Error(
        `Invalid permissions requested: ${invalidPermissions.join(', ')}`
      );
    }

    const { pool } = await import('../../utils/database-context');

    // Check if already installed
    const existing = await pool.query(
      'SELECT id FROM public.user_extensions WHERE user_id = $1 AND extension_id = $2',
      [userId, extensionId]
    );
    if (existing.rows.length > 0) {
      throw new Error(`Extension already installed: ${extensionId}`);
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO public.user_extensions (id, user_id, extension_id, enabled, permissions_granted)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, userId, extensionId, true, JSON.stringify(permissions)]
    );

    logger.info('Extension installed', {
      operation: 'installExtension',
      extensionId,
      userId,
    });

    return result.rows[0] as UserExtension;
  }

  /**
   * Uninstall an extension for a user.
   */
  async uninstallExtension(userId: string, extensionId: string): Promise<void> {
    const { pool } = await import('../../utils/database-context');
    const result = await pool.query(
      'DELETE FROM public.user_extensions WHERE user_id = $1 AND extension_id = $2',
      [userId, extensionId]
    );

    if (result.rowCount === 0) {
      throw new Error(`Extension not installed: ${extensionId}`);
    }

    logger.info('Extension uninstalled', {
      operation: 'uninstallExtension',
      extensionId,
      userId,
    });
  }

  /**
   * Enable an installed extension.
   */
  async enableExtension(userId: string, extensionId: string): Promise<UserExtension> {
    const { pool } = await import('../../utils/database-context');
    const result = await pool.query(
      `UPDATE public.user_extensions
       SET enabled = true
       WHERE user_id = $1 AND extension_id = $2
       RETURNING *`,
      [userId, extensionId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Extension not installed: ${extensionId}`);
    }

    return result.rows[0] as UserExtension;
  }

  /**
   * Disable an installed extension.
   */
  async disableExtension(userId: string, extensionId: string): Promise<UserExtension> {
    const { pool } = await import('../../utils/database-context');
    const result = await pool.query(
      `UPDATE public.user_extensions
       SET enabled = false
       WHERE user_id = $1 AND extension_id = $2
       RETURNING *`,
      [userId, extensionId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Extension not installed: ${extensionId}`);
    }

    return result.rows[0] as UserExtension;
  }

  /**
   * Get user's installed extensions.
   */
  async getInstalledExtensions(userId: string): Promise<ExtensionWithInstallStatus[]> {
    const { pool } = await import('../../utils/database-context');

    let userInstalls: UserExtension[] = [];
    try {
      const result = await pool.query(
        'SELECT * FROM public.user_extensions WHERE user_id = $1 ORDER BY installed_at DESC',
        [userId]
      );
      userInstalls = result.rows as UserExtension[];
    } catch {
      return [];
    }

    const extensions: ExtensionWithInstallStatus[] = [];
    for (const install of userInstalls) {
      const ext = await this.getExtension(install.extension_id);
      if (ext) {
        extensions.push({
          ...ext,
          installed: true,
          enabled: install.enabled,
          installed_at: install.installed_at,
          permissions_granted: install.permissions_granted,
        });
      }
    }

    return extensions;
  }
}

// ===========================================
// Singleton
// ===========================================

let instance: ExtensionRegistry | null = null;

export function getExtensionRegistry(): ExtensionRegistry {
  if (!instance) {
    instance = new ExtensionRegistry();
  }
  return instance;
}

/** For testing - reset singleton */
export function resetExtensionRegistry(): void {
  instance = null;
}

/** Export built-in catalog for testing */
export const CATALOG = BUILT_IN_EXTENSIONS;
