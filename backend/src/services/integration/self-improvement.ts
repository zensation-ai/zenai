/**
 * Self-Improvement Engine — Phase 139-140: Self-Improvement
 *
 * Identifies improvement opportunities from knowledge gaps, procedure
 * success rates, team strategy performance, and calibration drift.
 * Budgets actions per day, routes risky changes through approval,
 * and persists execution history.
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImprovementType =
  | 'knowledge_gap_research'
  | 'procedural_optimization'
  | 'team_learning'
  | 'calibration_fix';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ImprovementAction {
  id: string;
  type: ImprovementType;
  description: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  estimatedImpact: number; // 0-1
  basis: string[];
}

export interface ImprovementBudget {
  maxActionsPerDay: number;
  usedToday: number;
  remainingToday: number;
}

export interface GapInput {
  topic: string;
  gapScore: number; // 0-1
}

export interface CalibrationInput {
  ece: number; // expected calibration error
}

export interface ProcedureInput {
  name: string;
  successRate: number; // 0-1
}

export interface TeamStrategyInput {
  strategy: string;
  avgScore: number; // 0-1
}

export interface IdentifyParams {
  gaps?: GapInput[];
  calibration?: CalibrationInput;
  procedures?: ProcedureInput[];
  teamStats?: TeamStrategyInput[];
}

// ---------------------------------------------------------------------------
// Risk helpers
// ---------------------------------------------------------------------------

export function assignRiskLevel(type: ImprovementType): RiskLevel {
  if (type === 'knowledge_gap_research') return 'medium';
  return 'low';
}

export function requiresApproval(risk: RiskLevel): boolean {
  return risk === 'medium' || risk === 'high';
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

const DEFAULT_MAX_PER_DAY = 3;

export async function checkBudget(
  context: string,
  maxPerDay: number = DEFAULT_MAX_PER_DAY,
): Promise<ImprovementBudget> {
  try {
    const result = await queryContext(
      context,
      `SELECT COUNT(*)::int AS cnt
       FROM improvement_actions
       WHERE created_at >= CURRENT_DATE`,
      [],
    );
    const usedToday = result?.rows?.[0]?.cnt ?? 0;
    const remaining = Math.max(0, maxPerDay - usedToday);
    return { maxActionsPerDay: maxPerDay, usedToday, remainingToday: remaining };
  } catch {
    logger.warn('checkBudget: DB query failed, assuming fresh budget');
    return { maxActionsPerDay: maxPerDay, usedToday: 0, remainingToday: maxPerDay };
  }
}

export function canExecute(budget: ImprovementBudget): boolean {
  return budget.remainingToday > 0;
}

// ---------------------------------------------------------------------------
// Identify improvements
// ---------------------------------------------------------------------------

export function identifyImprovements(params: IdentifyParams): ImprovementAction[] {
  const actions: ImprovementAction[] = [];

  // Knowledge gaps with high gapScore
  if (params.gaps) {
    for (const gap of params.gaps) {
      if (gap.gapScore >= 0.5) {
        const type: ImprovementType = 'knowledge_gap_research';
        const risk = assignRiskLevel(type);
        actions.push({
          id: randomUUID(),
          type,
          description: `Research knowledge gap: ${gap.topic}`,
          riskLevel: risk,
          requiresApproval: requiresApproval(risk),
          estimatedImpact: Math.min(1, gap.gapScore),
          basis: [`gap_score=${gap.gapScore}`, `topic=${gap.topic}`],
        });
      }
    }
  }

  // Procedures with low success rate
  if (params.procedures) {
    for (const proc of params.procedures) {
      if (proc.successRate < 0.5) {
        const type: ImprovementType = 'procedural_optimization';
        const risk = assignRiskLevel(type);
        actions.push({
          id: randomUUID(),
          type,
          description: `Optimize procedure: ${proc.name}`,
          riskLevel: risk,
          requiresApproval: requiresApproval(risk),
          estimatedImpact: Math.min(1, 1 - proc.successRate),
          basis: [`success_rate=${proc.successRate}`, `procedure=${proc.name}`],
        });
      }
    }
  }

  // Team strategies with poor results
  if (params.teamStats) {
    for (const ts of params.teamStats) {
      if (ts.avgScore < 0.4) {
        const type: ImprovementType = 'team_learning';
        const risk = assignRiskLevel(type);
        actions.push({
          id: randomUUID(),
          type,
          description: `Improve team strategy: ${ts.strategy}`,
          riskLevel: risk,
          requiresApproval: requiresApproval(risk),
          estimatedImpact: Math.min(1, 1 - ts.avgScore),
          basis: [`avg_score=${ts.avgScore}`, `strategy=${ts.strategy}`],
        });
      }
    }
  }

  // Calibration drift
  if (params.calibration && params.calibration.ece > 0.15) {
    const type: ImprovementType = 'calibration_fix';
    const risk = assignRiskLevel(type);
    actions.push({
      id: randomUUID(),
      type,
      description: `Fix calibration drift (ECE=${params.calibration.ece.toFixed(3)})`,
      riskLevel: risk,
      requiresApproval: requiresApproval(risk),
      estimatedImpact: Math.min(1, params.calibration.ece),
      basis: [`ece=${params.calibration.ece}`],
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function recordImprovementAction(
  context: string,
  action: ImprovementAction,
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO improvement_actions (id, type, description, risk_level, requires_approval, estimated_impact, basis)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        action.id,
        action.type,
        action.description,
        action.riskLevel,
        action.requiresApproval,
        action.estimatedImpact,
        JSON.stringify(action.basis),
      ],
    );
    logger.info('Recorded improvement action', { id: action.id, type: action.type });
  } catch (err) {
    // fire-and-forget: log but don't throw
    logger.error('Failed to record improvement action', { error: String(err) });
  }
}

export async function getImprovementHistory(
  context: string,
  limit: number = 20,
): Promise<ImprovementAction[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, type, description, risk_level, requires_approval, estimated_impact, basis
       FROM improvement_actions
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return (result?.rows ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      type: row.type as ImprovementType,
      description: row.description as string,
      riskLevel: (row.risk_level as RiskLevel) ?? 'low',
      requiresApproval: row.requires_approval as boolean,
      estimatedImpact: row.estimated_impact as number,
      basis: typeof row.basis === 'string' ? JSON.parse(row.basis) : (row.basis as string[]),
    }));
  } catch (err) {
    logger.error('Failed to get improvement history', { error: String(err) });
    return [];
  }
}
