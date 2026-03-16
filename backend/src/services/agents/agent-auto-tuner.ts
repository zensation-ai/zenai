/**
 * Agent Auto-Tuner
 *
 * Automatically adjusts agent parameters (model, temperature, tokens)
 * based on feedback data. Implements escalation and de-escalation rules.
 *
 * @module services/agents/agent-auto-tuner
 */

import { pool } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export interface TuningConfig {
  agent_role: string;
  model: string;
  temperature: number;
  max_tokens: number;
  retry_on_fail: boolean;
}

export interface TuningRecommendation {
  agent_role: string;
  current: TuningConfig;
  recommended: TuningConfig;
  reason: string;
  confidence: number;
}

// ===========================================
// Model Hierarchy
// ===========================================

const MODEL_HIERARCHY = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
];

function getModelIndex(model: string): number {
  const idx = MODEL_HIERARCHY.indexOf(model);
  return idx >= 0 ? idx : 1; // default to sonnet if unknown
}

function escalateModel(currentModel: string): string {
  const idx = getModelIndex(currentModel);
  return idx < MODEL_HIERARCHY.length - 1
    ? MODEL_HIERARCHY[idx + 1]
    : currentModel;
}

function downgradeModel(currentModel: string): string {
  const idx = getModelIndex(currentModel);
  return idx > 0 ? MODEL_HIERARCHY[idx - 1] : currentModel;
}

// ===========================================
// Default Configs
// ===========================================

const DEFAULT_CONFIGS: Record<string, TuningConfig> = {
  researcher: {
    agent_role: 'researcher',
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.3,
    max_tokens: 4096,
    retry_on_fail: false,
  },
  writer: {
    agent_role: 'writer',
    model: 'claude-sonnet-4-20250514',
    temperature: 0.7,
    max_tokens: 4096,
    retry_on_fail: false,
  },
  reviewer: {
    agent_role: 'reviewer',
    model: 'claude-sonnet-4-20250514',
    temperature: 0.2,
    max_tokens: 4096,
    retry_on_fail: false,
  },
  coder: {
    agent_role: 'coder',
    model: 'claude-sonnet-4-20250514',
    temperature: 0.1,
    max_tokens: 8192,
    retry_on_fail: true,
  },
};

// ===========================================
// Config Management
// ===========================================

/**
 * Get the default config for an agent role.
 */
export function getDefaultConfig(agentRole: string): TuningConfig {
  return DEFAULT_CONFIGS[agentRole] ?? {
    agent_role: agentRole,
    model: 'claude-sonnet-4-20250514',
    temperature: 0.5,
    max_tokens: 4096,
    retry_on_fail: false,
  };
}

/**
 * Get the optimized (stored) config for an agent role, or default if none saved.
 */
export async function getOptimizedConfig(agentRole: string): Promise<TuningConfig> {
  try {
    const result = await pool.query(
      `SELECT agent_role, model, temperature, max_tokens, retry_on_fail
       FROM agent_tuning_configs
       WHERE agent_role = $1`,
      [agentRole]
    );

    if (result.rows.length === 0) {
      return getDefaultConfig(agentRole);
    }

    const row = result.rows[0];
    return {
      agent_role: row.agent_role,
      model: row.model,
      temperature: parseFloat(row.temperature),
      max_tokens: parseInt(row.max_tokens, 10),
      retry_on_fail: row.retry_on_fail,
    };
  } catch (error) {
    logger.error('Failed to get optimized config', error instanceof Error ? error : undefined);
    return getDefaultConfig(agentRole);
  }
}

/**
 * Analyze feedback data and generate tuning recommendations.
 */
export async function generateRecommendations(): Promise<TuningRecommendation[]> {
  const recommendations: TuningRecommendation[] = [];

  try {
    // Get per-agent performance stats from the last 30 days
    const statsResult = await pool.query(
      `SELECT
         unnest(agents_used) as agent_role,
         COALESCE(AVG(user_rating), 0) as avg_rating,
         AVG(completion_score) as avg_completion,
         AVG(execution_time_ms) as avg_time_ms,
         AVG(token_count) as avg_tokens,
         AVG(error_count) as avg_errors,
         COUNT(*) as exec_count
       FROM agent_execution_feedback
       WHERE created_at > NOW() - INTERVAL '30 days'
       GROUP BY unnest(agents_used)
       HAVING COUNT(*) >= 3`
    );

    for (const row of statsResult.rows) {
      const role = row.agent_role as string;
      const current = await getOptimizedConfig(role);
      const recommended = { ...current };
      const reasons: string[] = [];
      let confidence = 0.5;

      const avgRating = parseFloat(row.avg_rating);
      const avgCompletion = parseFloat(row.avg_completion);
      const avgTimeMs = parseFloat(row.avg_time_ms);
      const avgTokens = parseFloat(row.avg_tokens);
      const avgErrors = parseFloat(row.avg_errors);
      const execCount = parseInt(row.exec_count, 10);

      // Rule 1: Low rating → escalate model
      if (avgRating > 0 && avgRating < 3.0) {
        const escalated = escalateModel(current.model);
        if (escalated !== current.model) {
          recommended.model = escalated;
          reasons.push(`Low avg rating (${avgRating.toFixed(1)}) — escalate model`);
          confidence += 0.2;
        }
      }

      // Rule 2: High rating + slow → downgrade model
      if (avgRating >= 4.0 && avgTimeMs > 60000) {
        const downgraded = downgradeModel(current.model);
        if (downgraded !== current.model) {
          recommended.model = downgraded;
          reasons.push(`High rating (${avgRating.toFixed(1)}) but slow (${Math.round(avgTimeMs)}ms) — downgrade model`);
          confidence += 0.15;
        }
      }

      // Rule 3: Consistent errors → enable retry
      if (avgErrors > 0.3 && !current.retry_on_fail) {
        recommended.retry_on_fail = true;
        reasons.push(`Frequent errors (avg ${avgErrors.toFixed(1)}) — enable retry`);
        confidence += 0.1;
      }

      // Rule 4: Excessive tokens → reduce max_tokens
      if (avgTokens > current.max_tokens * 0.9) {
        recommended.max_tokens = Math.min(current.max_tokens + 2048, 16384);
        reasons.push(`Token usage near limit (${Math.round(avgTokens)}/${current.max_tokens}) — increase max_tokens`);
        confidence += 0.1;
      } else if (avgTokens < current.max_tokens * 0.3 && current.max_tokens > 2048) {
        recommended.max_tokens = Math.max(current.max_tokens - 1024, 2048);
        reasons.push(`Low token usage (${Math.round(avgTokens)}/${current.max_tokens}) — reduce max_tokens`);
        confidence += 0.05;
      }

      // Rule 5: Low completion rate → escalate model
      if (avgCompletion < 0.6) {
        const escalated = escalateModel(recommended.model);
        if (escalated !== recommended.model) {
          recommended.model = escalated;
          reasons.push(`Low completion rate (${(avgCompletion * 100).toFixed(0)}%) — escalate model`);
          confidence += 0.15;
        }
      }

      // Higher confidence with more data points
      if (execCount >= 10) confidence += 0.1;
      if (execCount >= 50) confidence += 0.1;

      // Only add recommendation if something changed
      if (reasons.length > 0) {
        recommendations.push({
          agent_role: role,
          current,
          recommended,
          reason: reasons.join('; '),
          confidence: Math.min(confidence, 1.0),
        });
      }
    }

    return recommendations;
  } catch (error) {
    logger.error('Failed to generate recommendations', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Apply a tuning recommendation by saving the new config to the database.
 */
export async function applyRecommendation(rec: TuningRecommendation): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO agent_tuning_configs (agent_role, model, temperature, max_tokens, retry_on_fail, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (agent_role) DO UPDATE SET
         model = EXCLUDED.model,
         temperature = EXCLUDED.temperature,
         max_tokens = EXCLUDED.max_tokens,
         retry_on_fail = EXCLUDED.retry_on_fail,
         updated_at = NOW()`,
      [
        rec.recommended.agent_role,
        rec.recommended.model,
        rec.recommended.temperature,
        rec.recommended.max_tokens,
        rec.recommended.retry_on_fail,
      ]
    );

    logger.info('Tuning recommendation applied', {
      agentRole: rec.agent_role,
      model: rec.recommended.model,
      reason: rec.reason,
    });
  } catch (error) {
    logger.error('Failed to apply recommendation', error instanceof Error ? error : undefined);
    throw error;
  }
}
