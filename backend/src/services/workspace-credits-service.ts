// backend/src/services/workspace-credits-service.ts
import { queryPublic } from '../utils/database-context';
import type { WorkspaceCredits } from '../types/multi-tenancy';

interface CreditState extends WorkspaceCredits {
  remaining: number;
  percentUsed: number;
}

export async function getCredits(wsId: string): Promise<CreditState> {
  const result = await queryPublic(
    'SELECT * FROM public.workspace_credits WHERE workspace_id = $1', [wsId]
  );
  const credits = result.rows[0];
  if (!credits) throw new Error('Workspace credits not found');

  return {
    ...credits,
    remaining: Math.max(0, credits.credits_limit - credits.credits_used),
    percentUsed: credits.credits_limit > 0
      ? (credits.credits_used / credits.credits_limit) * 100
      : 0,
  };
}

interface DeductInput {
  workspaceId: string;
  userId: string;
  actionType: string;
  creditsSpent: number;
  modelUsed?: string;
  metadata?: Record<string, unknown>;
}

export async function deductCredits(input: DeductInput): Promise<WorkspaceCredits> {
  const result = await queryPublic(`
    UPDATE public.workspace_credits
    SET credits_used = credits_used + $2, updated_at = now()
    WHERE workspace_id = $1
      AND (credits_limit - credits_used) >= $2
    RETURNING *
  `, [input.workspaceId, input.creditsSpent]);

  if (result.rows.length === 0) {
    throw new Error('Insufficient credits or workspace not found');
  }

  // Log usage
  await queryPublic(`
    INSERT INTO public.credit_usage_log (workspace_id, user_id, action_type, credits_spent, model_used, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [input.workspaceId, input.userId, input.actionType, input.creditsSpent, input.modelUsed || null, JSON.stringify(input.metadata || {})]);

  return result.rows[0];
}

export function checkOverageLevel(used: number, limit: number): 'none' | 'info' | 'warning' | 'exceeded' {
  const pct = limit > 0 ? used / limit : 0;
  if (pct >= 1.0) return 'exceeded';
  if (pct >= 0.9) return 'warning';
  if (pct >= 0.75) return 'info';
  return 'none';
}

export async function resetMonthlyCredits(): Promise<number> {
  const result = await queryPublic(`
    UPDATE public.workspace_credits
    SET credits_used = 0,
        period_start = date_trunc('month', now()),
        period_end = date_trunc('month', now()) + INTERVAL '1 month',
        updated_at = now()
    WHERE period_end <= now()
  `);
  return result.rowCount || 0;
}
