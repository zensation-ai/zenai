// backend/src/services/tenant-audit-service.ts
import crypto from 'crypto';
import { queryPublic } from '../utils/database-context';
import type { TenantAuditEntry, RACITag } from '../types/multi-tenancy';

interface AppendAuditInput {
  workspaceId: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  raci: RACITag;
  metadata?: Record<string, unknown>;
}

export function computeEntryHash(
  prevHash: string | null, action: string, entityType: string | null,
  entityId: string | null, raci: string, createdAt: string
): string {
  const data = `${prevHash || ''}|${action}|${entityType || ''}|${entityId || ''}|${raci}|${createdAt}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function appendAuditEntry(input: AppendAuditInput): Promise<TenantAuditEntry> {
  const now = new Date().toISOString();
  const raciJson = JSON.stringify(input.raci);

  // Single CTE query: fetch prev_hash + compute new hash + insert atomically.
  // The FOR UPDATE in prev CTE prevents concurrent race conditions on the hash chain.
  const result = await queryPublic(`
    WITH prev AS (
      SELECT entry_hash FROM public.tenant_audit_log
      WHERE workspace_id = $1 ORDER BY id DESC LIMIT 1
      FOR UPDATE
    )
    INSERT INTO public.tenant_audit_log
      (workspace_id, user_id, action, entity_type, entity_id, raci, metadata, prev_hash, entry_hash)
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      (SELECT entry_hash FROM prev),
      encode(sha256(
        convert_to(
          COALESCE((SELECT entry_hash FROM prev), '') || '|' || $3 || '|' || COALESCE($4, '') || '|' || COALESCE($5, '') || '|' || $6 || '|' || $8,
          'UTF8'
        )
      ), 'hex')
    )
    RETURNING *
  `, [
    input.workspaceId, input.userId || null, input.action,
    input.entityType || null, input.entityId || null,
    raciJson, JSON.stringify(input.metadata || {}), now,
  ]);

  return result.rows[0];
}

export async function getAuditLog(
  wsId: string, opts: { limit?: number; offset?: number; action?: string } = {}
): Promise<TenantAuditEntry[]> {
  const { limit = 50, offset = 0, action } = opts;
  const conditions = ['workspace_id = $1'];
  const params: any[] = [wsId];
  let idx = 2;

  if (action) {
    conditions.push(`action = $${idx}`);
    params.push(action);
    idx++;
  }

  params.push(limit, offset);
  const result = await queryPublic(
    `SELECT * FROM public.tenant_audit_log
     WHERE ${conditions.join(' AND ')}
     ORDER BY id DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  return result.rows;
}

export async function verifyChainIntegrity(wsId: string): Promise<boolean> {
  const result = await queryPublic(
    'SELECT id, prev_hash, entry_hash FROM public.tenant_audit_log WHERE workspace_id = $1 ORDER BY id ASC',
    [wsId]
  );

  for (let i = 1; i < result.rows.length; i++) {
    if (result.rows[i].prev_hash !== result.rows[i - 1].entry_hash) {
      return false;
    }
  }
  return true;
}
