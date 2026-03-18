/**
 * Shared Memory Service (Agent Team Collaboration)
 *
 * Provides a shared scratch pad for agents working in a team.
 * Each agent can read/write findings, decisions, questions,
 * artifacts, and feedback visible to all team members.
 *
 * Inspired by MemGPT/Letta shared memory architecture.
 *
 * @module services/memory/shared-memory
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { cache, getRedisClient } from '../../utils/cache';

// ===========================================
// Types & Interfaces
// ===========================================

export type AgentRole = 'researcher' | 'writer' | 'reviewer' | 'coder' | 'orchestrator';

export type SharedEntryType = 'finding' | 'decision' | 'question' | 'artifact' | 'feedback' | 'plan';

export interface SharedMemoryEntry {
  id: string;
  agentRole: AgentRole;
  type: SharedEntryType;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface SharedMemoryStats {
  totalEntries: number;
  byAgent: Record<string, number>;
  byType: Record<string, number>;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Maximum entries per team to prevent memory leaks */
  MAX_ENTRIES_PER_TEAM: 200,
  /** Maximum active teams */
  MAX_TEAMS: 50,
  /** Team TTL in milliseconds (1 hour) */
  TEAM_TTL_MS: 60 * 60 * 1000,
  /** Redis TTL for shared memory persistence (1 hour) */
  REDIS_TTL_SECONDS: 3600,
  /** Redis key prefix */
  REDIS_PREFIX: 'shared-memory:',
};

// ===========================================
// Shared Memory Store
// ===========================================

interface TeamStore {
  entries: SharedMemoryEntry[];
  createdAt: Date;
  lastActivity: Date;
}

class SharedMemoryService {
  private stores: Map<string, TeamStore> = new Map();

  /**
   * Initialize a team's shared memory.
   * Tries to restore from Redis if available.
   */
  initialize(teamId: string): void {
    if (this.stores.has(teamId)) {
      return;
    }
    const now = new Date();
    this.stores.set(teamId, {
      entries: [],
      createdAt: now,
      lastActivity: now,
    });
    this.enforceTeamLimit();

    // Try to restore from Redis first, then DB as authoritative fallback on cold start
    this.restoreFromRedis(teamId)
      .then(() => {
        // If Redis had no data, try DB (authoritative on cold start)
        const store = this.stores.get(teamId);
        if (store && store.entries.length === 0) {
          return this.restoreFromDB(teamId);
        }
      })
      .catch(() => {
        // If Redis fails, fall back to DB directly
        this.restoreFromDB(teamId).catch(() => {
          // Non-critical: both restore paths failed silently
        });
      });
  }

  /**
   * Persist team store to Redis for durability
   */
  private async persistToRedis(teamId: string): Promise<void> {
    const store = this.stores.get(teamId);
    if (!store) return;

    try {
      const key = `${CONFIG.REDIS_PREFIX}${teamId}`;
      // Pass object directly — cache.set handles JSON serialization internally
      await cache.set(key, {
        entries: store.entries,
        createdAt: store.createdAt.toISOString(),
        lastActivity: store.lastActivity.toISOString(),
      }, CONFIG.REDIS_TTL_SECONDS);
    } catch {
      // Non-critical: Redis persistence is a durability layer, not required
    }
  }

  /**
   * Restore team store from Redis
   */
  private async restoreFromRedis(teamId: string): Promise<void> {
    try {
      const key = `${CONFIG.REDIS_PREFIX}${teamId}`;
      const data = await cache.get<{
        entries: SharedMemoryEntry[];
        createdAt: string;
        lastActivity: string;
      }>(key);
      if (!data) return;

      const parsed = data as {
        entries: SharedMemoryEntry[];
        createdAt: string;
        lastActivity: string;
      };

      const store = this.stores.get(teamId);
      if (!store || store.entries.length > 0) return; // Don't overwrite if already populated

      store.entries = parsed.entries.map(e => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }));
      store.createdAt = new Date(parsed.createdAt);
      store.lastActivity = new Date(parsed.lastActivity);

      logger.debug('Shared memory restored from Redis', {
        teamId,
        entryCount: store.entries.length,
      });
    } catch {
      // Non-critical: restore from Redis is best-effort
    }
  }

  /**
   * L3: Persist a single entry to the database (fire-and-forget)
   *
   * Maps SharedMemoryEntry to agent_shared_memory schema:
   *   execution_id = teamId
   *   key = entry.id (unique per entry)
   *   value = JSONB { type, content, metadata }
   *   agent_role = entry.agentRole
   */
  private async persistToDB(teamId: string, entry: SharedMemoryEntry): Promise<void> {
    try {
      const { pool } = await import('../../utils/database-context');
      await pool.query(`
        INSERT INTO public.agent_shared_memory (id, execution_id, key, value, agent_role, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (execution_id, key) DO NOTHING
      `, [
        entry.id,
        teamId,
        entry.id,
        JSON.stringify({ type: entry.type, content: entry.content, metadata: entry.metadata }),
        entry.agentRole,
        entry.timestamp,
      ]);
    } catch {
      // Non-critical: DB persistence is a durability layer
    }
  }

  /**
   * L3: Restore team store from database.
   * DB is authoritative on cold start — takes precedence over empty Redis.
   *
   * Reads from agent_shared_memory schema:
   *   execution_id = teamId
   *   key = entry.id
   *   value = JSONB { type, content, metadata }
   *   agent_role = entry.agentRole
   */
  async restoreFromDB(teamId: string): Promise<void> {
    try {
      const { pool } = await import('../../utils/database-context');
      const result = await pool.query(`
        SELECT id, execution_id, key, value, agent_role, created_at
        FROM public.agent_shared_memory
        WHERE execution_id = $1
        ORDER BY created_at ASC
      `, [teamId]);

      if (!result.rows || result.rows.length === 0) return;

      // Don't overwrite if L1 already has data
      const store = this.stores.get(teamId);
      if (store && store.entries.length > 0) return;

      // Initialize store if not present
      if (!store) {
        const now = new Date();
        this.stores.set(teamId, {
          entries: [],
          createdAt: now,
          lastActivity: now,
        });
      }

      const targetStore = this.stores.get(teamId)!;
      targetStore.entries = result.rows.map((row: Record<string, unknown>) => {
        const value = typeof row.value === 'string' ? JSON.parse(row.value as string) : (row.value as Record<string, unknown>) || {};
        return {
          id: row.id as string,
          agentRole: row.agent_role as AgentRole,
          type: (value.type || 'finding') as SharedEntryType,
          content: (value.content || '') as string,
          metadata: value.metadata as Record<string, unknown> | undefined,
          timestamp: new Date(row.created_at as string),
        };
      });

      if (targetStore.entries.length > 0) {
        targetStore.lastActivity = targetStore.entries[targetStore.entries.length - 1].timestamp;
      }

      logger.debug('Shared memory restored from DB', {
        teamId,
        entryCount: targetStore.entries.length,
      });
    } catch {
      // Non-critical: DB restore is best-effort
    }
  }

  /**
   * Write an entry to shared memory
   */
  write(
    teamId: string,
    agentRole: AgentRole,
    type: SharedEntryType,
    content: string,
    metadata?: Record<string, unknown>
  ): SharedMemoryEntry {
    let store = this.stores.get(teamId);
    if (!store) {
      this.initialize(teamId);
      store = this.stores.get(teamId);
      if (!store) {throw new Error(`Failed to initialize shared memory for team ${teamId}`);}
    }

    const entry: SharedMemoryEntry = {
      id: uuidv4(),
      agentRole,
      type,
      content,
      metadata,
      timestamp: new Date(),
    };

    store.entries.push(entry);
    store.lastActivity = new Date();

    // Enforce entry limit (drop oldest non-decision entries)
    if (store.entries.length > CONFIG.MAX_ENTRIES_PER_TEAM) {
      const decisions = store.entries.filter(e => e.type === 'decision' || e.type === 'plan');
      const others = store.entries.filter(e => e.type !== 'decision' && e.type !== 'plan');
      // Keep all decisions/plans, trim oldest others
      const trimmed = others.slice(others.length - (CONFIG.MAX_ENTRIES_PER_TEAM - decisions.length));
      store.entries = [...decisions, ...trimmed];
    }

    logger.debug('Shared memory write', {
      teamId,
      agentRole,
      type,
      entryId: entry.id,
      totalEntries: store.entries.length,
    });

    // Persist to Redis in background for durability
    this.persistToRedis(teamId).catch(() => { /* non-critical */ });

    // L3: Fire-and-forget DB persistence
    this.persistToDB(teamId, entry).catch(() => { /* non-critical */ });

    return entry;
  }

  /**
   * Read entries from shared memory with optional filters
   */
  read(
    teamId: string,
    filter?: {
      agentRole?: AgentRole;
      type?: SharedEntryType;
      since?: Date;
      limit?: number;
    }
  ): SharedMemoryEntry[] {
    const store = this.stores.get(teamId);
    if (!store) {
      return [];
    }

    let entries = [...store.entries];

    if (filter?.agentRole) {
      entries = entries.filter(e => e.agentRole === filter.agentRole);
    }
    if (filter?.type) {
      entries = entries.filter(e => e.type === filter.type);
    }
    if (filter?.since) {
      const since = filter.since;
      entries = entries.filter(e => e.timestamp >= since);
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter?.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  /**
   * Get all entries as formatted context string for an agent's system prompt
   */
  getContext(teamId: string, forAgent?: AgentRole): string {
    const store = this.stores.get(teamId);
    if (!store || store.entries.length === 0) {
      return '';
    }

    const parts: string[] = ['[TEAM SHARED MEMORY]'];

    // Group by type for clarity
    const plan = store.entries.filter(e => e.type === 'plan');
    const findings = store.entries.filter(e => e.type === 'finding');
    const decisions = store.entries.filter(e => e.type === 'decision');
    const questions = store.entries.filter(e => e.type === 'question');
    const artifacts = store.entries.filter(e => e.type === 'artifact');
    const feedback = store.entries.filter(e => e.type === 'feedback');

    if (plan.length > 0) {
      parts.push('\n## Plan');
      for (const e of plan) {
        parts.push(`- [${e.agentRole}] ${e.content}`);
      }
    }

    if (findings.length > 0) {
      parts.push('\n## Findings');
      for (const e of findings.slice(-10)) { // Last 10 findings
        parts.push(`- [${e.agentRole}] ${e.content}`);
      }
    }

    if (decisions.length > 0) {
      parts.push('\n## Decisions');
      for (const e of decisions) {
        parts.push(`- [${e.agentRole}] ${e.content}`);
      }
    }

    if (questions.length > 0) {
      parts.push('\n## Open Questions');
      for (const e of questions) {
        parts.push(`- [${e.agentRole}] ${e.content}`);
      }
    }

    if (artifacts.length > 0) {
      parts.push('\n## Artifacts');
      for (const e of artifacts.slice(-5)) { // Last 5 artifacts
        parts.push(`- [${e.agentRole}] ${e.content.substring(0, 500)}`);
      }
    }

    if (feedback.length > 0 && forAgent) {
      // Show feedback relevant to this agent
      const relevantFeedback = feedback.filter(
        e => e.metadata?.targetAgent === forAgent || !e.metadata?.targetAgent
      );
      if (relevantFeedback.length > 0) {
        parts.push('\n## Feedback');
        for (const e of relevantFeedback.slice(-5)) {
          parts.push(`- [${e.agentRole}] ${e.content}`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Get statistics for a team
   */
  getStats(teamId: string): SharedMemoryStats {
    const store = this.stores.get(teamId);
    if (!store) {
      return { totalEntries: 0, byAgent: {}, byType: {} };
    }

    const byAgent: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const entry of store.entries) {
      byAgent[entry.agentRole] = (byAgent[entry.agentRole] || 0) + 1;
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    return {
      totalEntries: store.entries.length,
      byAgent,
      byType,
    };
  }

  /**
   * Clear a team's shared memory
   */
  clear(teamId: string): void {
    this.stores.delete(teamId);
    // Clean up Redis key
    cache.del(`${CONFIG.REDIS_PREFIX}${teamId}`).catch(() => { /* non-critical */ });
  }

  /**
   * Check if a team has shared memory
   */
  has(teamId: string): boolean {
    return this.stores.has(teamId);
  }

  /**
   * Enforce team limit by removing oldest inactive teams
   */
  private enforceTeamLimit(): void {
    if (this.stores.size <= CONFIG.MAX_TEAMS) {
      return;
    }

    const now = Date.now();
    // Remove expired teams first
    for (const [id, store] of this.stores) {
      if (now - store.lastActivity.getTime() > CONFIG.TEAM_TTL_MS) {
        this.stores.delete(id);
      }
    }

    // If still over limit, remove oldest
    while (this.stores.size > CONFIG.MAX_TEAMS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, store] of this.stores) {
        if (store.lastActivity.getTime() < oldestTime) {
          oldestTime = store.lastActivity.getTime();
          oldestId = id;
        }
      }
      if (oldestId) {
        this.stores.delete(oldestId);
      }
    }
  }

  /**
   * Get active team count (for monitoring)
   */
  getActiveTeamCount(): number {
    return this.stores.size;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const sharedMemory = new SharedMemoryService();
