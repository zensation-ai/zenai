/**
 * Phase 143: Agent Marketplace Service
 *
 * Browse, install, publish, and rate community agent blueprints.
 *
 * @module services/agents/marketplace-service
 */

import crypto from 'crypto';
import { queryPublic, queryContext } from '../../utils/database';
import type { AIContext } from '../../types';
import { logger } from '../../utils/logger';

const RATING_ELIGIBILITY_CONTEXTS: AIContext[] = ['operations', 'finance', 'people', 'strategy'];
const RATING_MIN_EXECUTIONS = 3;

// Sprint 1.12 — Publish rate-limit + anti-spam heuristic.
// Rationale: users can spam the pending queue with near-identical blueprints
// and DoS the admin moderation workflow. Cap per user + reject duplicates in
// a short window. Limits are deliberately generous (3/day) so legitimate
// iteration is not punished; admins can lift these later via plan tiers.
export const PUBLISH_DAILY_LIMIT = 3;
export const PUBLISH_DEDUP_WINDOW_HOURS = 24;

// ── Types ──────────────────────────────────────────────────────────

export interface MarketplaceFilters {
  category?: string;
  search?: string;
  sort?: 'rating' | 'popular' | 'newest';
  limit?: number;
  offset?: number;
}

export interface MarketplaceBlueprint {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  tags: string[];
  type: string;
  tools: string[];
  source: string;
  rating: number | null;
  ratingCount: number;
  usageCount: number;
  author: string | null;
  createdAt: Date;
}

export interface BlueprintRating {
  id: string;
  blueprintId: string;
  userId: string;
  rating: number;
  review: string | null;
  createdAt: Date;
}

export interface RatingHistogram {
  total: number;
  average: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface RatingEligibility {
  eligible: boolean;
  installed: boolean;
  alreadyRated: boolean;
  existingRating: number | null;
  existingReview: string | null;
  executionCount: number;
  executionsRequired: number;
}

export interface BlueprintDetail extends MarketplaceBlueprint {
  instructions: string;
  maxActionsPerDay: number;
  tokenBudgetDaily: number;
  approvalRequired: boolean;
  featured: boolean;
  moderationStatus: 'pending' | 'approved' | 'rejected';
  moderationReason: string | null;
  histogram: RatingHistogram;
  recentReviews: Array<{
    id: string;
    rating: number;
    review: string | null;
    createdAt: Date;
  }>;
}

export interface PublishCandidate {
  blueprintId: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  icon: string;
  tools: string[];
  approvalRequired: boolean;
  maxActionsPerDay: number;
  tokenBudgetDaily: number;
}

export interface PublishMeta {
  description?: string;
  category?: string;
  tags?: string[];
}

export interface PendingBlueprint extends MarketplaceBlueprint {
  userId: string | null;
  instructions: string;
  moderationReason: string | null;
  publishedAt: Date | null;
}


// ── Row Mapper ─────────────────────────────────────────────────────

function rowToMarketplaceBlueprint(row: Record<string, unknown>): MarketplaceBlueprint {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description ?? null) as string | null,
    icon: (row.icon ?? '🤖') as string,
    category: (row.category ?? 'custom') as string,
    tags: (row.tags ?? []) as string[],
    type: (row.type ?? 'autonomous') as string,
    tools: (row.tools ?? []) as string[],
    source: (row.source ?? 'community') as string,
    rating: row.avg_rating !== null && row.avg_rating !== undefined ? parseFloat(String(row.avg_rating)) : (row.rating !== null && row.rating !== undefined ? parseFloat(String(row.rating)) : null),
    ratingCount: parseInt(String(row.rating_count ?? 0), 10),
    usageCount: parseInt(String(row.usage_count ?? 0), 10),
    author: (row.author ?? null) as string | null,
    createdAt: new Date(row.created_at as string),
  };
}

// ── MarketplaceService ─────────────────────────────────────────────

export class MarketplaceService {
  /**
   * Browse community blueprints with filters and sorting.
   */
  async listCommunityBlueprints(filters: MarketplaceFilters = {}): Promise<MarketplaceBlueprint[]> {
    const conditions = [
      "source = 'community'",
      "COALESCE(moderation_status, 'approved') = 'approved'",
    ];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.category) {
      conditions.push(`category = $${idx++}`);
      params.push(filters.category);
    }
    if (filters.search) {
      conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx} OR $${idx + 1} = ANY(tags))`);
      params.push(`%${filters.search}%`, filters.search);
      idx += 2;
    }

    const where = conditions.join(' AND ');

    let orderBy = 'usage_count DESC';
    if (filters.sort === 'rating') orderBy = 'rating DESC NULLS LAST';
    if (filters.sort === 'newest') orderBy = 'created_at DESC';

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const { rows } = await queryPublic(
      `SELECT b.*,
              COALESCE(r.avg_rating, b.rating) AS avg_rating,
              COALESCE(r.rating_count, 0) AS rating_count
       FROM agent_blueprints b
       LEFT JOIN (
         SELECT blueprint_id, AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*) AS rating_count
         FROM marketplace_ratings
         GROUP BY blueprint_id
       ) r ON r.blueprint_id = b.id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset] as (string | number | boolean | null)[],
    );

    return rows.map((row: Record<string, unknown>) => rowToMarketplaceBlueprint(row));
  }

  /**
   * Install a community blueprint into user's collection.
   * Copies with source='user_created'.
   */
  async installBlueprint(blueprintId: string, userId: string): Promise<MarketplaceBlueprint> {
    // Get original
    const { rows: origRows } = await queryPublic(
      'SELECT * FROM agent_blueprints WHERE id = $1',
      [blueprintId],
    );
    if (origRows.length === 0) {
      throw new Error(`Blueprint not found: ${blueprintId}`);
    }

    const orig = origRows[0];
    const newId = `${blueprintId}_${userId.slice(0, 8)}`;

    // Insert copy
    const { rows } = await queryPublic(
      `INSERT INTO agent_blueprints (
        id, name, description, icon, category, tags, type,
        triggers, max_actions_per_day, token_budget_daily, approval_required,
        tools, instructions, default_context, configurable,
        source, user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'user_created',$16)
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
      RETURNING *`,
      [
        newId, orig.name, orig.description, orig.icon, orig.category,
        orig.tags, orig.type, orig.triggers, orig.max_actions_per_day,
        orig.token_budget_daily, orig.approval_required, orig.tools,
        orig.instructions, orig.default_context, orig.configurable,
        userId,
      ],
    );

    // Increment usage_count on original
    await queryPublic(
      'UPDATE agent_blueprints SET usage_count = usage_count + 1 WHERE id = $1',
      [blueprintId],
    );

    logger.info('Blueprint installed from marketplace', { blueprintId, userId, newId });
    return rowToMarketplaceBlueprint(rows[0]);
  }

  /**
   * Load a blueprint in a shape suitable for the publish-confirm modal.
   * Owner-scoped; rejects unknown or non-owned blueprints.
   */
  async getPublishCandidate(blueprintId: string, userId: string): Promise<PublishCandidate> {
    const { rows } = await queryPublic(
      `SELECT id, name, description, icon, category, tags, tools,
              approval_required, max_actions_per_day, token_budget_daily
       FROM agent_blueprints
       WHERE id = $1 AND user_id = $2 AND source = 'user_created'
       LIMIT 1`,
      [blueprintId, userId],
    );
    if (rows.length === 0) {
      throw new Error('Blueprint not found or not owned by user');
    }
    const row = rows[0];
    return {
      blueprintId: row.id as string,
      name: row.name as string,
      description: (row.description ?? null) as string | null,
      category: (row.category ?? 'custom') as string,
      tags: (row.tags ?? []) as string[],
      icon: (row.icon ?? '🤖') as string,
      tools: (row.tools ?? []) as string[],
      approvalRequired: Boolean(row.approval_required ?? true),
      maxActionsPerDay: parseInt(String(row.max_actions_per_day ?? 10), 10),
      tokenBudgetDaily: parseInt(String(row.token_budget_daily ?? 50000), 10),
    };
  }

  /**
   * Count how many publishes the user has done in the last 24h.
   * Used by checkPublishAllowed() as the rate-limit guard.
   */
  async countRecentPublishes(userId: string): Promise<number> {
    const { rows } = await queryPublic(
      `SELECT COUNT(*)::int AS n
         FROM agent_publish_log
        WHERE user_id = $1
          AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId],
    );
    return parseInt(String(rows[0]?.n ?? 0), 10);
  }

  /**
   * Anti-spam heuristic: flag near-duplicate publish attempts.
   *
   * A near-duplicate is any prior publish by the same user within the
   * PUBLISH_DEDUP_WINDOW_HOURS window that matches:
   *   - the same blueprint name (case-insensitive) AND
   *   - the same tool set (order-independent SHA-256 hash).
   *
   * We fingerprint tools rather than the full blueprint so legitimate
   * tweaks (instructions, icon) don't trip the guard — but someone trying
   * to republish the same agent under a variant id does.
   */
  async hasRecentDuplicate(
    userId: string,
    blueprintId: string,
    name: string,
    tools: string[],
  ): Promise<boolean> {
    const toolsHash = this.hashTools(tools);
    const { rows } = await queryPublic(
      `SELECT 1
         FROM agent_publish_log
        WHERE user_id = $1
          AND blueprint_id <> $2
          AND LOWER(blueprint_name) = LOWER($3)
          AND tools_hash = $4
          AND created_at > NOW() - ($5::text || ' hours')::interval
        LIMIT 1`,
      [userId, blueprintId, name, toolsHash, String(PUBLISH_DEDUP_WINDOW_HOURS)],
    );
    return rows.length > 0;
  }

  /**
   * Deterministic hash over a sorted tool set. Used as a fingerprint for
   * anti-spam and for future "similar-agent" analytics.
   */
  hashTools(tools: string[]): string {
    const normalized = [...tools].map(t => t.trim().toLowerCase()).filter(Boolean).sort();
    return crypto.createHash('sha256').update(normalized.join('\n')).digest('hex');
  }

  /**
   * Pre-publish guard. Throws typed errors the route translates to 429/409.
   */
  async assertPublishAllowed(
    userId: string,
    blueprintId: string,
    name: string,
    tools: string[],
  ): Promise<void> {
    const recent = await this.countRecentPublishes(userId);
    if (recent >= PUBLISH_DAILY_LIMIT) {
      const err = new Error(
        `publish rate limit exceeded (max ${PUBLISH_DAILY_LIMIT} / 24h)`,
      );
      (err as Error & { code?: string }).code = 'PUBLISH_RATE_LIMIT';
      throw err;
    }
    const duplicate = await this.hasRecentDuplicate(userId, blueprintId, name, tools);
    if (duplicate) {
      const err = new Error('similar agent already published recently');
      (err as Error & { code?: string }).code = 'PUBLISH_DUPLICATE';
      throw err;
    }
  }

  /**
   * Publish a user blueprint to the community marketplace.
   *
   * - Validates ownership and source='user_created'
   * - Runs rate-limit + anti-spam guards (throws PUBLISH_RATE_LIMIT /
   *   PUBLISH_DUPLICATE on violation)
   * - Applies optional metadata overrides (description/category/tags)
   * - Writes the audit row to agent_publish_log
   * - Flips moderation_status to 'pending' (admin review)
   */
  async publishBlueprint(
    blueprintId: string,
    userId: string,
    meta: PublishMeta = {},
  ): Promise<void> {
    const { rows } = await queryPublic(
      "SELECT * FROM agent_blueprints WHERE id = $1 AND user_id = $2 AND source = 'user_created'",
      [blueprintId, userId],
    );
    if (rows.length === 0) {
      throw new Error('Blueprint not found or not owned by user');
    }

    const current = rows[0];
    const description = meta.description ?? (current.description as string | null) ?? null;
    const category = meta.category ?? (current.category as string) ?? 'custom';
    const tags = meta.tags ?? ((current.tags ?? []) as string[]);
    const name = current.name as string;
    const tools = (current.tools ?? []) as string[];

    await this.assertPublishAllowed(userId, blueprintId, name, tools);

    await queryPublic(
      `UPDATE agent_blueprints
         SET source = 'community',
             author = $1,
             description = $2,
             category = $3,
             tags = $4,
             moderation_status = 'pending',
             moderation_reason = NULL,
             moderated_at = NULL,
             moderated_by = NULL,
             published_at = NOW(),
             updated_at = NOW()
       WHERE id = $5`,
      [userId, description, category, tags, blueprintId],
    );

    await queryPublic(
      `INSERT INTO agent_publish_log (user_id, blueprint_id, blueprint_name, tools_hash)
       VALUES ($1, $2, $3, $4)`,
      [userId, blueprintId, name, this.hashTools(tools)],
    );

    logger.info('Blueprint published to marketplace', {
      blueprintId,
      userId,
      moderation_status: 'pending',
    });
  }

  /**
   * Revert a published blueprint back to user_created (unpublish).
   * Owner-only. Does not delete ratings or prior publish_log entries.
   */
  async unpublishBlueprint(blueprintId: string, userId: string): Promise<void> {
    const { rows } = await queryPublic(
      `SELECT id FROM agent_blueprints
        WHERE id = $1 AND author = $2 AND source = 'community'
        LIMIT 1`,
      [blueprintId, userId],
    );
    if (rows.length === 0) {
      throw new Error('Blueprint not found or not owned by user');
    }
    await queryPublic(
      `UPDATE agent_blueprints
          SET source = 'user_created',
              moderation_status = 'approved',
              moderation_reason = NULL,
              published_at = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [blueprintId],
    );
    logger.info('Blueprint unpublished from marketplace', { blueprintId, userId });
  }

  /**
   * List pending blueprints for the admin moderation queue.
   */
  async listPendingBlueprints(limit = 50): Promise<PendingBlueprint[]> {
    const { rows } = await queryPublic(
      `SELECT b.*,
              COALESCE(r.avg_rating, b.rating) AS avg_rating,
              COALESCE(r.rating_count, 0) AS rating_count
         FROM agent_blueprints b
         LEFT JOIN (
           SELECT blueprint_id,
                  AVG(rating)::numeric(3,2) AS avg_rating,
                  COUNT(*) AS rating_count
             FROM marketplace_ratings
            GROUP BY blueprint_id
         ) r ON r.blueprint_id = b.id
        WHERE b.source = 'community' AND b.moderation_status = 'pending'
        ORDER BY b.published_at DESC NULLS LAST, b.created_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((row: Record<string, unknown>) => ({
      ...rowToMarketplaceBlueprint(row),
      userId: (row.user_id ?? null) as string | null,
      tools: (row.tools ?? []) as string[],
      instructions: (row.instructions ?? '') as string,
      moderationReason: (row.moderation_reason ?? null) as string | null,
      publishedAt: row.published_at ? new Date(row.published_at as string) : null,
    }));
  }

  /**
   * Admin decision on a pending blueprint. Approval lifts the entry into
   * public listings; rejection requires a reason so the submitter gets
   * actionable feedback.
   */
  async setModerationDecision(
    blueprintId: string,
    adminUserId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): Promise<void> {
    if (decision === 'rejected' && (!reason || reason.trim().length === 0)) {
      throw new Error('moderation rejection requires a reason');
    }
    const { rowCount } = await queryPublic(
      `UPDATE agent_blueprints
          SET moderation_status = $1,
              moderation_reason = $2,
              moderated_at = NOW(),
              moderated_by = $3,
              updated_at = NOW()
        WHERE id = $4 AND source = 'community' AND moderation_status = 'pending'`,
      [decision, reason ?? null, adminUserId, blueprintId],
    );
    if (rowCount === 0) {
      throw new Error('pending blueprint not found');
    }
    logger.info('Blueprint moderation decision', { blueprintId, decision, adminUserId });
  }


  /**
   * Rate a community blueprint.
   */
  async rateBlueprint(blueprintId: string, userId: string, rating: number, review?: string): Promise<BlueprintRating> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const { rows } = await queryPublic(
      `INSERT INTO marketplace_ratings (blueprint_id, user_id, rating, review)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (blueprint_id, user_id)
       DO UPDATE SET rating = $3, review = $4, updated_at = NOW()
       RETURNING *`,
      [blueprintId, userId, rating, review ?? null],
    );

    // Update average rating on blueprint
    await queryPublic(
      `UPDATE agent_blueprints SET rating = (
        SELECT AVG(rating) FROM marketplace_ratings WHERE blueprint_id = $1
      ) WHERE id = $1`,
      [blueprintId],
    );

    const row = rows[0];
    return {
      id: row.id as string,
      blueprintId: row.blueprint_id as string,
      userId: row.user_id as string,
      rating: row.rating as number,
      review: (row.review ?? null) as string | null,
      createdAt: new Date(row.created_at as string),
    };
  }

  /**
   * Check whether a user is eligible to rate a blueprint.
   * Requirements:
   *   - user has installed the blueprint (agent_blueprints row with user_id match)
   *   - user has at least RATING_MIN_EXECUTIONS completed executions across contexts
   *   - hasn't rated yet (or has, returned with existingRating for UX)
   */
  async getRatingEligibility(blueprintId: string, userId: string): Promise<RatingEligibility> {
    const installedId = `${blueprintId}_${userId.slice(0, 8)}`;

    const [installRes, ratingRes] = await Promise.all([
      queryPublic(
        `SELECT id FROM agent_blueprints WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [installedId, userId],
      ),
      queryPublic(
        `SELECT rating, review FROM marketplace_ratings WHERE blueprint_id = $1 AND user_id = $2 LIMIT 1`,
        [blueprintId, userId],
      ),
    ]);

    const installed = installRes.rows.length > 0;
    const alreadyRated = ratingRes.rows.length > 0;
    const existingRating = alreadyRated ? parseInt(String(ratingRes.rows[0].rating), 10) : null;
    const existingReview = alreadyRated ? ((ratingRes.rows[0].review ?? null) as string | null) : null;

    let executionCount = 0;
    if (installed) {
      const counts = await Promise.all(
        RATING_ELIGIBILITY_CONTEXTS.map(async ctx => {
          try {
            const { rows } = await queryContext(
              ctx,
              `SELECT COUNT(*)::int AS n
               FROM agent_executions e
               JOIN agent_definitions d ON d.id = e.agent_definition_id
               WHERE d.blueprint_id = $1 AND e.status = 'completed'`,
              [installedId],
            );
            return parseInt(String(rows[0]?.n ?? 0), 10);
          } catch (err) {
            logger.warn('Rating eligibility execution count failed', { ctx, err: (err as Error).message });
            return 0;
          }
        }),
      );
      executionCount = counts.reduce((sum, n) => sum + n, 0);
    }

    const eligible = installed && !alreadyRated && executionCount >= RATING_MIN_EXECUTIONS;

    return {
      eligible,
      installed,
      alreadyRated,
      existingRating,
      existingReview,
      executionCount,
      executionsRequired: RATING_MIN_EXECUTIONS,
    };
  }

  /**
   * Get full detail for a blueprint including rating histogram + recent reviews.
   */
  async getBlueprintDetail(blueprintId: string): Promise<BlueprintDetail | null> {
    const { rows } = await queryPublic(
      `SELECT b.*,
              COALESCE(r.avg_rating, b.rating) AS avg_rating,
              COALESCE(r.rating_count, 0) AS rating_count
       FROM agent_blueprints b
       LEFT JOIN (
         SELECT blueprint_id, AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*) AS rating_count
         FROM marketplace_ratings
         GROUP BY blueprint_id
       ) r ON r.blueprint_id = b.id
       WHERE b.id = $1`,
      [blueprintId],
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    const base = rowToMarketplaceBlueprint(row);
    const histogram = await this.getRatingHistogram(blueprintId);

    const { rows: reviewRows } = await queryPublic(
      `SELECT id, rating, review, created_at
       FROM marketplace_ratings
       WHERE blueprint_id = $1 AND review IS NOT NULL AND length(review) > 0
       ORDER BY created_at DESC
       LIMIT 3`,
      [blueprintId],
    );

    const moderationStatus = (row.moderation_status ?? 'approved') as
      'pending' | 'approved' | 'rejected';

    return {
      ...base,
      instructions: (row.instructions ?? '') as string,
      maxActionsPerDay: parseInt(String(row.max_actions_per_day ?? 10), 10),
      tokenBudgetDaily: parseInt(String(row.token_budget_daily ?? 50000), 10),
      approvalRequired: Boolean(row.approval_required ?? true),
      featured: Boolean(row.featured ?? false),
      moderationStatus,
      moderationReason: (row.moderation_reason ?? null) as string | null,
      histogram,
      recentReviews: reviewRows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        rating: parseInt(String(r.rating), 10),
        review: (r.review ?? null) as string | null,
        createdAt: new Date(r.created_at as string),
      })),
    };
  }

  /**
   * Count ratings per bucket (1..5) for a blueprint. Always returns all 5 keys.
   */
  async getRatingHistogram(blueprintId: string): Promise<RatingHistogram> {
    const { rows } = await queryPublic(
      `SELECT rating, COUNT(*)::int AS n
       FROM marketplace_ratings
       WHERE blueprint_id = $1
       GROUP BY rating`,
      [blueprintId],
    );

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum = 0;
    for (const row of rows) {
      const bucket = parseInt(String(row.rating), 10);
      const count = parseInt(String(row.n), 10);
      if (bucket >= 1 && bucket <= 5) {
        distribution[bucket as 1 | 2 | 3 | 4 | 5] = count;
        total += count;
        sum += bucket * count;
      }
    }
    return {
      total,
      average: total > 0 ? Number((sum / total).toFixed(2)) : null,
      distribution,
    };
  }

  /**
   * Get featured blueprints (curated `featured=true` first, then top-rated
   * built-in + community as fallback so the rail is never empty).
   */
  async getFeatured(limit: number = 6): Promise<MarketplaceBlueprint[]> {
    const { rows } = await queryPublic(
      `SELECT b.*,
              COALESCE(r.avg_rating, b.rating) AS avg_rating,
              COALESCE(r.rating_count, 0) AS rating_count
       FROM agent_blueprints b
       LEFT JOIN (
         SELECT blueprint_id, AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*) AS rating_count
         FROM marketplace_ratings
         GROUP BY blueprint_id
       ) r ON r.blueprint_id = b.id
       WHERE b.source IN ('built_in', 'community')
         AND (b.source = 'built_in' OR COALESCE(b.moderation_status, 'approved') = 'approved')
       ORDER BY
         COALESCE(b.featured, FALSE) DESC,
         COALESCE(r.avg_rating, b.rating, 0) DESC,
         b.usage_count DESC
       LIMIT $1`,
      [limit],
    );

    return rows.map((row: Record<string, unknown>) => rowToMarketplaceBlueprint(row));
  }
}

export const marketplaceService = new MarketplaceService();
