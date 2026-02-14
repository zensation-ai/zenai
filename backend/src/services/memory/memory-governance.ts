/**
 * Memory Governance & GDPR Service
 *
 * Provides DSGVO/GDPR-compliant memory management:
 * - Right to Erasure (Art. 17): Cascade deletion of all user memory
 * - Memory Privacy Controls: Per-layer opt-in/opt-out
 * - Data Export (Art. 20): Machine-readable memory export
 * - Audit Trail: Track what was remembered, when, why
 * - Retention Management: Auto-cleanup based on user preferences
 *
 * Perplexity Recommendation: "Memory Governance must include consent
 * management, right to erasure, audit trail, and data portability."
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export type MemoryLayer = 'working' | 'episodic' | 'short_term' | 'long_term' | 'procedural' | 'reflection';

export interface MemoryPrivacySettings {
  context: AIContext;
  /** Which memory layers are enabled */
  enabledLayers: MemoryLayer[];
  /** Whether implicit feedback tracking is enabled */
  enableImplicitFeedback: boolean;
  /** Whether cross-context sharing is enabled */
  enableCrossContextSharing: boolean;
  /** Whether proactive suggestions are enabled */
  enableProactiveSuggestions: boolean;
  /** Data retention in days (0 = keep forever) */
  retentionDays: number;
  /** Whether to auto-delete after retention period */
  autoDeleteExpired: boolean;
  updatedAt: Date;
}

export interface MemoryDeletionResult {
  context: AIContext;
  factsDeleted: number;
  episodesDeleted: number;
  patternsDeleted: number;
  proceduresDeleted: number;
  reflectionsDeleted: number;
  conversationsDeleted: number;
  totalDeleted: number;
}

export interface MemoryExport {
  exportedAt: string;
  context: AIContext;
  facts: unknown[];
  episodes: unknown[];
  patterns: unknown[];
  procedures: unknown[];
  reflections: unknown[];
  settings: MemoryPrivacySettings;
}

export interface MemoryAuditEntry {
  id: string;
  context: AIContext;
  action: 'created' | 'accessed' | 'updated' | 'deleted' | 'exported';
  memoryLayer: MemoryLayer;
  itemId?: string;
  reason: string;
  createdAt: Date;
}

// ===========================================
// Configuration
// ===========================================

const DEFAULT_PRIVACY_SETTINGS: Omit<MemoryPrivacySettings, 'context' | 'updatedAt'> = {
  enabledLayers: ['working', 'episodic', 'short_term', 'long_term', 'procedural', 'reflection'],
  enableImplicitFeedback: true,
  enableCrossContextSharing: true,
  enableProactiveSuggestions: true,
  retentionDays: 0, // Keep forever by default
  autoDeleteExpired: false,
};

// ===========================================
// Memory Governance Service
// ===========================================

class MemoryGovernanceService {

  // ===========================================
  // Privacy Settings
  // ===========================================

  /**
   * Get privacy settings for a context
   */
  async getPrivacySettings(context: AIContext): Promise<MemoryPrivacySettings> {
    try {
      const result = await queryContext(
        context,
        `SELECT * FROM memory_privacy_settings WHERE context = $1 LIMIT 1`,
        [context]
      );

      if (result.rows.length === 0) {
        return {
          context,
          ...DEFAULT_PRIVACY_SETTINGS,
          updatedAt: new Date(),
        };
      }

      const row = result.rows[0];
      return {
        context: row.context as AIContext,
        enabledLayers: this.parseJsonArray(row.enabled_layers, DEFAULT_PRIVACY_SETTINGS.enabledLayers) as MemoryLayer[],
        enableImplicitFeedback: row.enable_implicit_feedback !== false,
        enableCrossContextSharing: row.enable_cross_context_sharing !== false,
        enableProactiveSuggestions: row.enable_proactive_suggestions !== false,
        retentionDays: Number(row.retention_days) || 0,
        autoDeleteExpired: row.auto_delete_expired === true,
        updatedAt: new Date(row.updated_at as string),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return { context, ...DEFAULT_PRIVACY_SETTINGS, updatedAt: new Date() };
      }
      logger.debug('Failed to get privacy settings', { context, error });
      return { context, ...DEFAULT_PRIVACY_SETTINGS, updatedAt: new Date() };
    }
  }

  /**
   * Update privacy settings for a context
   */
  async updatePrivacySettings(
    context: AIContext,
    settings: Partial<Omit<MemoryPrivacySettings, 'context' | 'updatedAt'>>
  ): Promise<MemoryPrivacySettings> {
    try {
      const current = await this.getPrivacySettings(context);
      const updated = { ...current, ...settings, updatedAt: new Date() };

      await queryContext(
        context,
        `INSERT INTO memory_privacy_settings
         (context, enabled_layers, enable_implicit_feedback, enable_cross_context_sharing,
          enable_proactive_suggestions, retention_days, auto_delete_expired, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (context) DO UPDATE SET
           enabled_layers = $2,
           enable_implicit_feedback = $3,
           enable_cross_context_sharing = $4,
           enable_proactive_suggestions = $5,
           retention_days = $6,
           auto_delete_expired = $7,
           updated_at = NOW()`,
        [
          context,
          JSON.stringify(updated.enabledLayers),
          updated.enableImplicitFeedback,
          updated.enableCrossContextSharing,
          updated.enableProactiveSuggestions,
          updated.retentionDays,
          updated.autoDeleteExpired,
        ]
      );

      await this.logAudit(context, 'updated', 'long_term', undefined, 'Privacy settings updated');

      logger.info('Memory privacy settings updated', { context, settings });
      return updated;
    } catch (error) {
      logger.error('Failed to update privacy settings', error instanceof Error ? error : undefined, { context });
      throw error;
    }
  }

  /**
   * Check if a memory layer is enabled for a context
   */
  async isLayerEnabled(context: AIContext, layer: MemoryLayer): Promise<boolean> {
    const settings = await this.getPrivacySettings(context);
    return settings.enabledLayers.includes(layer);
  }

  // ===========================================
  // Right to Erasure (Art. 17 DSGVO)
  // ===========================================

  /**
   * Delete ALL memory data for a context (full erasure).
   * This is a destructive operation - cannot be undone.
   */
  async eraseAllMemory(context: AIContext): Promise<MemoryDeletionResult> {
    const result: MemoryDeletionResult = {
      context,
      factsDeleted: 0,
      episodesDeleted: 0,
      patternsDeleted: 0,
      proceduresDeleted: 0,
      reflectionsDeleted: 0,
      conversationsDeleted: 0,
      totalDeleted: 0,
    };

    try {
      // 1. Delete learned facts
      const factsRes = await queryContext(
        context,
        `DELETE FROM learned_facts WHERE context = $1`,
        [context]
      );
      result.factsDeleted = factsRes.rowCount || 0;

      // 2. Delete episodic memory
      const episodesRes = await queryContext(
        context,
        `DELETE FROM episodic_memory WHERE context = $1`,
        [context]
      );
      result.episodesDeleted = episodesRes.rowCount || 0;

      // 3. Delete conversation patterns
      const patternsRes = await queryContext(
        context,
        `DELETE FROM conversation_patterns WHERE context = $1`,
        [context]
      );
      result.patternsDeleted = patternsRes.rowCount || 0;

      // 4. Delete procedural memory
      try {
        const procRes = await queryContext(
          context,
          `DELETE FROM procedural_memory WHERE context = $1`,
          [context]
        );
        result.proceduresDeleted = procRes.rowCount || 0;
      } catch {
        // Table might not exist yet
      }

      // 5. Delete reflection insights
      try {
        const reflRes = await queryContext(
          context,
          `DELETE FROM reflection_insights WHERE context = $1`,
          [context]
        );
        result.reflectionsDeleted = reflRes.rowCount || 0;
      } catch {
        // Table might not exist yet
      }

      // 6. Delete conversation memory/sessions
      try {
        const convRes = await queryContext(
          context,
          `DELETE FROM conversation_memory WHERE context = $1`,
          [context]
        );
        result.conversationsDeleted = convRes.rowCount || 0;
      } catch {
        // Table might not exist
      }

      result.totalDeleted =
        result.factsDeleted + result.episodesDeleted + result.patternsDeleted +
        result.proceduresDeleted + result.reflectionsDeleted + result.conversationsDeleted;

      await this.logAudit(
        context, 'deleted', 'long_term', undefined,
        `Full memory erasure: ${result.totalDeleted} items deleted`
      );

      logger.info('Memory erasure complete', { ...result });
      return result;
    } catch (error) {
      logger.error('Memory erasure failed', error instanceof Error ? error : undefined, { context });
      throw error;
    }
  }

  /**
   * Delete specific memory layer for a context
   */
  async eraseLayer(context: AIContext, layer: MemoryLayer): Promise<number> {
    const tableMap: Record<MemoryLayer, string> = {
      working: 'working_memory_slots',
      episodic: 'episodic_memory',
      short_term: 'conversation_memory',
      long_term: 'learned_facts',
      procedural: 'procedural_memory',
      reflection: 'reflection_insights',
    };

    const table = tableMap[layer];
    if (!table) {return 0;}

    try {
      const result = await queryContext(
        context,
        `DELETE FROM ${table} WHERE context = $1`,
        [context]
      );

      const deleted = result.rowCount || 0;

      await this.logAudit(context, 'deleted', layer, undefined,
        `Layer "${layer}" erased: ${deleted} items`);

      logger.info(`Memory layer erased`, { context, layer, deleted });
      return deleted;
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return 0;
      }
      logger.error(`Failed to erase layer ${layer}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Delete a specific fact by ID
   */
  async deleteFact(context: AIContext, factId: string): Promise<boolean> {
    try {
      const result = await queryContext(
        context,
        `DELETE FROM learned_facts WHERE id = $1 AND context = $2`,
        [factId, context]
      );

      const deleted = (result.rowCount || 0) > 0;
      if (deleted) {
        await this.logAudit(context, 'deleted', 'long_term', factId, 'Individual fact deleted');
      }
      return deleted;
    } catch {
      return false;
    }
  }

  // ===========================================
  // Data Export (Art. 20 DSGVO)
  // ===========================================

  /**
   * Export all memory data for a context in machine-readable format
   */
  async exportMemory(context: AIContext): Promise<MemoryExport> {
    const memoryExport: MemoryExport = {
      exportedAt: new Date().toISOString(),
      context,
      facts: [],
      episodes: [],
      patterns: [],
      procedures: [],
      reflections: [],
      settings: await this.getPrivacySettings(context),
    };

    try {
      // Facts
      const factsResult = await queryContext(
        context,
        `SELECT id, fact_type, content, confidence, source, created_at, last_accessed
         FROM learned_facts WHERE context = $1 ORDER BY created_at DESC`,
        [context]
      );
      memoryExport.facts = factsResult.rows;

      // Episodes
      const episodesResult = await queryContext(
        context,
        `SELECT id, type, summary, strength, emotional_valence, source_session_id, created_at
         FROM episodic_memory WHERE context = $1 ORDER BY created_at DESC`,
        [context]
      );
      memoryExport.episodes = episodesResult.rows;

      // Patterns
      const patternsResult = await queryContext(
        context,
        `SELECT id, pattern_type, description, confidence, created_at
         FROM conversation_patterns WHERE context = $1 ORDER BY created_at DESC`,
        [context]
      );
      memoryExport.patterns = patternsResult.rows;

      // Procedures
      try {
        const procResult = await queryContext(
          context,
          `SELECT id, type, name, trigger_description, steps, success_count, failure_count,
                  confidence, tags, created_at, last_used
           FROM procedural_memory WHERE context = $1 ORDER BY created_at DESC`,
          [context]
        );
        memoryExport.procedures = procResult.rows;
      } catch {
        // Table might not exist
      }

      // Reflections
      try {
        const reflResult = await queryContext(
          context,
          `SELECT id, type, trigger_summary, insight, confidence, action_item, applied, created_at
           FROM reflection_insights WHERE context = $1 ORDER BY created_at DESC`,
          [context]
        );
        memoryExport.reflections = reflResult.rows;
      } catch {
        // Table might not exist
      }

      await this.logAudit(context, 'exported', 'long_term', undefined,
        `Memory exported: ${memoryExport.facts.length} facts, ${memoryExport.episodes.length} episodes`);

      return memoryExport;
    } catch (error) {
      logger.error('Memory export failed', error instanceof Error ? error : undefined, { context });
      throw error;
    }
  }

  // ===========================================
  // Retention Management
  // ===========================================

  /**
   * Apply retention policy: delete data older than configured retention period.
   * Called from memory scheduler during consolidation.
   */
  async applyRetention(context: AIContext): Promise<number> {
    const settings = await this.getPrivacySettings(context);

    if (settings.retentionDays === 0 || !settings.autoDeleteExpired) {
      return 0; // No retention policy or auto-delete disabled
    }

    let totalDeleted = 0;

    try {
      // Delete old facts
      const factsRes = await queryContext(
        context,
        `DELETE FROM learned_facts
         WHERE context = $1 AND created_at < NOW() - make_interval(days => $2)`,
        [context, settings.retentionDays]
      );
      totalDeleted += factsRes.rowCount || 0;

      // Delete old episodes
      const episodesRes = await queryContext(
        context,
        `DELETE FROM episodic_memory
         WHERE context = $1 AND created_at < NOW() - make_interval(days => $2)`,
        [context, settings.retentionDays]
      );
      totalDeleted += episodesRes.rowCount || 0;

      // Delete old conversation patterns
      const patternsRes = await queryContext(
        context,
        `DELETE FROM conversation_patterns
         WHERE context = $1 AND created_at < NOW() - make_interval(days => $2)`,
        [context, settings.retentionDays]
      );
      totalDeleted += patternsRes.rowCount || 0;

      if (totalDeleted > 0) {
        await this.logAudit(context, 'deleted', 'long_term', undefined,
          `Retention policy applied: ${totalDeleted} items deleted (${settings.retentionDays}d policy)`);

        logger.info('Retention policy applied', {
          context,
          retentionDays: settings.retentionDays,
          totalDeleted,
        });
      }

      return totalDeleted;
    } catch (error) {
      logger.debug('Retention policy failed', { context, error });
      return 0;
    }
  }

  // ===========================================
  // Audit Trail
  // ===========================================

  /**
   * Get audit trail for a context
   */
  async getAuditTrail(
    context: AIContext,
    options: { limit?: number; layer?: MemoryLayer; action?: string } = {}
  ): Promise<MemoryAuditEntry[]> {
    const { limit = 50, layer, action } = options;

    try {
      let sql = `SELECT * FROM memory_audit_trail WHERE context = $1`;
      const params: (string | number)[] = [context];
      let paramIdx = 2;

      if (layer) {
        sql += ` AND memory_layer = $${paramIdx++}`;
        params.push(layer);
      }

      if (action) {
        sql += ` AND action = $${paramIdx++}`;
        params.push(action);
      }

      sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
      params.push(limit);

      const result = await queryContext(context, sql, params);

      return result.rows.map(row => ({
        id: row.id as string,
        context: row.context as AIContext,
        action: row.action as MemoryAuditEntry['action'],
        memoryLayer: row.memory_layer as MemoryLayer,
        itemId: row.item_id as string | undefined,
        reason: row.reason as string,
        createdAt: new Date(row.created_at as string),
      }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {return [];}
      logger.debug('Failed to get audit trail', { context, error });
      return [];
    }
  }

  /**
   * Log an audit entry
   */
  private async logAudit(
    context: AIContext,
    action: MemoryAuditEntry['action'],
    layer: MemoryLayer,
    itemId: string | undefined,
    reason: string
  ): Promise<void> {
    try {
      await queryContext(
        context,
        `INSERT INTO memory_audit_trail (id, context, action, memory_layer, item_id, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [uuidv4(), context, action, layer, itemId || null, reason]
      );
    } catch {
      // If table doesn't exist, silently fail (not critical)
    }
  }

  // ===========================================
  // Memory Statistics (for transparency)
  // ===========================================

  /**
   * Get comprehensive memory statistics for transparency
   */
  async getMemoryOverview(context: AIContext): Promise<Record<string, unknown>> {
    const overview: Record<string, unknown> = { context };

    try {
      // Count per layer
      const queries = [
        { key: 'facts', sql: `SELECT COUNT(*) as cnt FROM learned_facts WHERE context = $1` },
        { key: 'episodes', sql: `SELECT COUNT(*) as cnt FROM episodic_memory WHERE context = $1` },
        { key: 'patterns', sql: `SELECT COUNT(*) as cnt FROM conversation_patterns WHERE context = $1` },
      ];

      for (const q of queries) {
        try {
          const result = await queryContext(context, q.sql, [context]);
          overview[q.key] = Number(result.rows[0]?.cnt || 0);
        } catch {
          overview[q.key] = 0;
        }
      }

      // Optional tables
      const optionalTables = [
        { table: 'procedural_memory', key: 'procedures' },
        { table: 'reflection_insights', key: 'reflections' },
      ];
      for (const { table, key } of optionalTables) {
        try {
          const result = await queryContext(
            context,
            `SELECT COUNT(*) as cnt FROM ${table} WHERE context = $1`,
            [context]
          );
          overview[key] = Number(result.rows[0]?.cnt || 0);
        } catch {
          overview[key] = 0;
        }
      }

      // Privacy settings
      overview.privacySettings = await this.getPrivacySettings(context);

      return overview;
    } catch (error) {
      logger.debug('Failed to get memory overview', { context, error });
      return overview;
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  private parseJsonArray(value: unknown, fallback: unknown[]): unknown[] {
    if (Array.isArray(value)) {return value;}
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return fallback; }
    }
    return fallback;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const memoryGovernance = new MemoryGovernanceService();
