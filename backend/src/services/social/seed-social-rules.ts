/**
 * Seed Social Proactive Rules
 *
 * Creates default proactive rules for social media content generation
 * if they don't already exist. Called during SocialModule.onStartup().
 *
 * Rules:
 * 1. blog_published → trigger ContentAgent for all platforms
 * 2. phase_completed → trigger ContentAgent for changelog thread
 *
 * @module services/social/seed-social-rules
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

interface SeedRule {
  name: string;
  description: string;
  event_types: string[];
  conditions: unknown[];
  decision: string;
  action_config: Record<string, unknown>;
  risk_level: string;
  requires_approval: boolean;
  priority: number;
  cooldown_minutes: number;
}

const SOCIAL_RULES: SeedRule[] = [
  {
    name: 'Social: Draft posts on blog publish',
    description: 'When a blog post is published, draft social media posts for Twitter, LinkedIn, and Discord.',
    event_types: ['blog_published'],
    conditions: [],
    decision: 'trigger_agent',
    action_config: {
      agentType: 'content_agent',
      strategy: 'write_only',
      taskDescription: 'Draft social media posts for a newly published blog post on all platforms (Twitter, LinkedIn, Discord).',
    },
    risk_level: 'low',
    requires_approval: false,
    priority: 70,
    cooldown_minutes: 5,
  },
  {
    name: 'Social: Draft changelog on phase completion',
    description: 'When a development phase is completed, draft changelog posts for Twitter, LinkedIn, and Discord.',
    event_types: ['phase_completed'],
    conditions: [],
    decision: 'trigger_agent',
    action_config: {
      agentType: 'content_agent',
      strategy: 'write_only',
      taskDescription: 'Draft changelog social media posts for a completed development phase on all platforms.',
    },
    risk_level: 'low',
    requires_approval: false,
    priority: 60,
    cooldown_minutes: 10,
  },
  {
    name: 'Social: Weekly summary post (Friday)',
    description: 'Every Friday at 9am, draft a weekly activity summary for Twitter, LinkedIn, and Discord.',
    event_types: ['weekly_summary'],
    conditions: [],
    decision: 'trigger_agent',
    action_config: {
      agentType: 'content_agent',
      strategy: 'write_only',
      taskDescription: 'Draft weekly summary social posts for all platforms.',
      schedule: { cron: '0 9 * * 5' },
    },
    risk_level: 'low',
    requires_approval: false,
    priority: 50,
    cooldown_minutes: 60 * 24,
  },
];

/**
 * Seed default social proactive rules for a given context.
 * Skips rules that already exist (matched by name).
 */
export async function seedSocialRules(context: AIContext): Promise<number> {
  let created = 0;

  for (const rule of SOCIAL_RULES) {
    try {
      // Check if rule already exists
      const existing = await queryContext(
        context,
        `SELECT id FROM proactive_rules WHERE name = $1 AND context = $2 LIMIT 1`,
        [rule.name, context],
      );

      if (existing.rows.length > 0) continue;

      await queryContext(
        context,
        `INSERT INTO proactive_rules
         (context, name, description, event_types, conditions, decision, action_config,
          risk_level, requires_approval, priority, cooldown_minutes, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)`,
        [
          context,
          rule.name,
          rule.description,
          rule.event_types,
          JSON.stringify(rule.conditions),
          rule.decision,
          JSON.stringify(rule.action_config),
          rule.risk_level,
          rule.requires_approval,
          rule.priority,
          rule.cooldown_minutes,
        ],
      );

      created++;
      logger.info(`[SeedSocialRules] Created rule: ${rule.name}`, { context });
    } catch (error) {
      // Graceful degradation — table might not exist yet
      logger.debug(`[SeedSocialRules] Could not seed rule "${rule.name}"`, {
        error: error instanceof Error ? error.message : String(error),
        context,
      });
    }
  }

  return created;
}
