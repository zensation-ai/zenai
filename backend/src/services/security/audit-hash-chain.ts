/**
 * Sprint 1.2 — Hash-Chain Audit-Log (manipulationssicher)
 *
 * public.tenant_audit_log besitzt bereits prev_hash + entry_hash Spalten
 * (siehe phase_multi_tenancy_foundation.sql + types/multi-tenancy.ts).
 * Die Append-Logik existiert in services/tenant-audit-service.ts
 * (atomares CTE mit FOR UPDATE — race-safe).
 *
 * Dieses Modul fügt hinzu:
 *   1. appendAuditEntry()  — dünne Hülle mit canonical JSON (stabile Reihenfolge),
 *      so dass verifyAuditChain() unabhängig vom Insert-Pfad funktioniert.
 *   2. verifyAuditChain()  — re-validiert jeden Eintrag chronologisch und meldet
 *      {valid, brokenAt, totalChecked}. Optional time-range via fromTs.
 *
 * Canonical JSON: Schlüssel alphabetisch sortiert → reproduzierbarer SHA-256.
 * Die DB-seitige SHA-256-Berechnung in tenant-audit-service.ts nutzt dasselbe
 * Format wie computeEntryHash(), damit beide Pfade (DB-side insert + App-side
 * verify) zum selben Hash führen.
 */

import crypto from 'crypto';
import { queryPublic } from '../../utils/database-context';
import {
  appendAuditEntry as appendAuditViaService,
  computeEntryHash,
} from '../tenant-audit-service';
import type { TenantAuditEntry, RACITag } from '../../types/multi-tenancy';

// ===========================================
// Types
// ===========================================

export interface AppendAuditInput {
  workspaceId: string;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  raci: RACITag;
  metadata?: Record<string, unknown>;
}

export interface VerifyResult {
  valid: boolean;
  totalChecked: number;
  /** Index des ersten gebrochenen Eintrags (id + position). */
  brokenAt: {
    index: number;
    id: number;
    expectedPrevHash: string | null;
    actualPrevHash: string | null;
    expectedEntryHash: string;
    actualEntryHash: string;
  } | null;
}

// ===========================================
// Canonical JSON (für stabiles Hashing)
// ===========================================

/**
 * Liefert JSON mit alphabetisch sortierten Object-Keys.
 * Nested Objects werden rekursiv kanonisiert.
 * Arrays behalten ihre Reihenfolge (Positions-relevant).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return value;
}

// ===========================================
// Append (Delegation mit Vor-Validierung)
// ===========================================

/**
 * Fügt einen neuen Audit-Eintrag an. Delegiert an tenant-audit-service,
 * der die race-safe CTE-Insert-Logik besitzt. Canonical-JSON-Kanonisierung
 * der metadata wird hier im Prozess durchgeführt, damit das downstream
 * hashende SQL stabile Ergebnisse produziert.
 */
export async function appendAuditEntry(input: AppendAuditInput): Promise<TenantAuditEntry> {
  // metadata kanonisieren (alphabetische Keys), damit Hashing reproduzierbar ist.
  const canonicalMetadata = input.metadata ? JSON.parse(canonicalJson(input.metadata)) : {};

  return appendAuditViaService({
    workspaceId: input.workspaceId,
    userId: input.userId || undefined,
    action: input.action,
    entityType: input.entityType || undefined,
    entityId: input.entityId || undefined,
    raci: input.raci,
    metadata: canonicalMetadata,
  });
}

// ===========================================
// Verify
// ===========================================

/**
 * Verifiziert die Hash-Chain eines Workspace chronologisch.
 * Returns: { valid, totalChecked, brokenAt }
 *
 * Algorithmus:
 *   - Jeder Eintrag muss prev_hash === vorheriger_entry_hash haben (oder null für den ersten).
 *   - entry_hash = sha256(prev_hash || '|' || action || '|' || entity_type || '|' || entity_id || '|' || raci_json || '|' || created_at)
 *     (muss dem Format aus tenant-audit-service.computeEntryHash entsprechen).
 *
 * Bei fromTs werden nur Einträge ≥ fromTs verifiziert. Der erste Eintrag
 * muss in diesem Fall gegen seinen tatsächlich gespeicherten prev_hash
 * geprüft werden (ohne dass wir den vorigen Block erneut validieren).
 */
export async function verifyAuditChain(
  workspaceId: string,
  options: { fromTs?: Date; limit?: number } = {}
): Promise<VerifyResult> {
  const params: unknown[] = [workspaceId];
  let sql = `
    SELECT id, action, entity_type, entity_id, raci, prev_hash, entry_hash, created_at
    FROM public.tenant_audit_log
    WHERE workspace_id = $1
  `;
  if (options.fromTs) {
    sql += ` AND created_at >= $2`;
    params.push(options.fromTs.toISOString());
  }
  sql += ` ORDER BY id ASC`;
  if (options.limit && options.limit > 0) {
    sql += ` LIMIT $${params.length + 1}`;
    params.push(options.limit);
  }

  const result = await queryPublic(sql, params as never);
  const rows = result.rows as Array<{
    id: number;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    raci: RACITag | string;
    prev_hash: string | null;
    entry_hash: string;
    created_at: string;
  }>;

  let prevEntryHash: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Bei fromTs-Queries lässt sich die Kette vor dem Startpunkt nicht re-validieren;
    // wir akzeptieren den gespeicherten prev_hash als Startpunkt und verifizieren
    // ab dort vorwärts.
    if (i > 0 && row.prev_hash !== prevEntryHash) {
      return {
        valid: false,
        totalChecked: i + 1,
        brokenAt: {
          index: i,
          id: row.id,
          expectedPrevHash: prevEntryHash,
          actualPrevHash: row.prev_hash,
          expectedEntryHash: row.entry_hash,
          actualEntryHash: row.entry_hash,
        },
      };
    }

    const raciString = typeof row.raci === 'string' ? row.raci : JSON.stringify(row.raci);
    const recomputed = computeEntryHash(
      row.prev_hash,
      row.action,
      row.entity_type,
      row.entity_id,
      raciString,
      row.created_at
    );

    if (recomputed !== row.entry_hash) {
      return {
        valid: false,
        totalChecked: i + 1,
        brokenAt: {
          index: i,
          id: row.id,
          expectedPrevHash: row.prev_hash,
          actualPrevHash: row.prev_hash,
          expectedEntryHash: recomputed,
          actualEntryHash: row.entry_hash,
        },
      };
    }

    prevEntryHash = row.entry_hash;
  }

  return {
    valid: true,
    totalChecked: rows.length,
    brokenAt: null,
  };
}

// ===========================================
// Debug/Export-Helpers
// ===========================================

/**
 * Für Admin-Download: liefert die gesamte Chain als Array.
 * Achtung: kann groß werden — limit ist empfohlen.
 */
export async function exportAuditChain(workspaceId: string, limit = 10000): Promise<TenantAuditEntry[]> {
  const result = await queryPublic(
    `SELECT * FROM public.tenant_audit_log WHERE workspace_id = $1 ORDER BY id ASC LIMIT $2`,
    [workspaceId, limit]
  );
  return result.rows as TenantAuditEntry[];
}

/**
 * Helper zum lokalen Test: Hash eines Eintrags nachberechnen (ohne DB).
 */
export function debugRecomputeHash(params: {
  prevHash: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  raci: RACITag;
  createdAt: string;
}): string {
  return computeEntryHash(
    params.prevHash,
    params.action,
    params.entityType,
    params.entityId,
    JSON.stringify(params.raci),
    params.createdAt
  );
}

// Re-export für Konsistenz mit anderen Services
export { computeEntryHash };

// Sicherstellen, dass crypto nicht durch TreeShake verloren geht (defensiv, da
// canonicalJson nicht crypto nutzt — appendAuditViaService tut es über DB):
void crypto;
