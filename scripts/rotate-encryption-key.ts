/**
 * rotate-encryption-key.ts — Sprint 1.5 Item 3
 *
 * Rotiert P0- und P1-Encrypted-Felder von `ENCRYPTION_KEY_PREVIOUS` auf
 * `ENCRYPTION_KEY`. Voraussetzung: beide ENV-Variablen sind gesetzt und die
 * neue `field-encryption.ts`-Version mit Dual-Key-Support ist deployed.
 *
 * Workflow (siehe docs/RUNBOOK-ENCRYPTION-KEY-ROTATION.md):
 *   1. ENCRYPTION_KEY_PREVIOUS := alter ENCRYPTION_KEY.
 *   2. ENCRYPTION_KEY := neuer Key.
 *   3. Backend-Deploy — dual-key-decrypt wird aktiviert.
 *   4. `npx tsx scripts/rotate-encryption-key.ts` (dieses Script).
 *   5. Nach Erfolg: ENCRYPTION_KEY_PREVIOUS nach 7 Tagen entfernen.
 *
 * Idempotenz:
 *   - Pro Zeile: `getKeyIdentifier(value)` liefert 'A' (CURRENT) → skip.
 *   - 'B' (PREVIOUS) oder 'legacy' → decrypt + re-encrypt + UPDATE.
 *
 * Batch-basiert, 1000 Zeilen/Transaktion, Progress-Log jede 100 Zeilen.
 * Resume-fähig — mehrfaches Ausführen ist sicher; bereits rotierte Zeilen
 * werden geskippt.
 *
 * Usage:
 *   npx tsx scripts/rotate-encryption-key.ts
 *   npx tsx scripts/rotate-encryption-key.ts --dry-run
 *   npx tsx scripts/rotate-encryption-key.ts --batch-size=500
 *   npx tsx scripts/rotate-encryption-key.ts --field=public.users.mfa_secret
 *   npx tsx scripts/rotate-encryption-key.ts --json
 *
 * Exit-Codes:
 *   0 — erfolgreich.
 *   1 — mindestens eine Zeile fehlgeschlagen.
 *   2 — Konfigurations-Fehler (keys fehlen etc.).
 */
import { Client } from 'pg';
import {
  encrypt,
  decrypt,
  isEncrypted,
  isEncryptedWithCurrentKey,
  initEncryption,
  isEncryptionAvailable,
  isDualKeyModeActive,
  rotateToCurrentKey,
} from '../backend/src/services/security/field-encryption';

export type RotationTarget = {
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  readonly kind: 'text' | 'jsonb';
};

// P0-Felder aus Sprint 1.3 (public.*).
const P0_TARGETS: RotationTarget[] = [
  { schema: 'public', table: 'users', column: 'mfa_secret', kind: 'text' },
  { schema: 'public', table: 'integration_tokens', column: 'access_token', kind: 'text' },
  { schema: 'public', table: 'integration_tokens', column: 'refresh_token', kind: 'text' },
  { schema: 'public', table: 'google_oauth_tokens', column: 'access_token', kind: 'text' },
  { schema: 'public', table: 'google_oauth_tokens', column: 'refresh_token', kind: 'text' },
];

// P1-Felder aus Sprint 1.5 Item 2 (×4 Kontext-Schemas).
const P1_FIELD_DEFS: ReadonlyArray<Omit<RotationTarget, 'schema'>> = [
  { table: 'mcp_server_connections', column: 'credentials', kind: 'jsonb' },
  { table: 'email_accounts', column: 'smtp_password', kind: 'text' },
  { table: 'email_accounts', column: 'imap_password', kind: 'text' },
  { table: 'calendar_events', column: 'location', kind: 'text' },
  { table: 'financial_accounts', column: 'account_number', kind: 'text' },
  { table: 'contacts', column: 'phone', kind: 'text' },
];

const CONTEXT_SCHEMAS = ['operations', 'finance', 'people', 'strategy'] as const;

function buildTargets(filter: string | null): RotationTarget[] {
  const all: RotationTarget[] = [...P0_TARGETS];
  for (const schema of CONTEXT_SCHEMAS) {
    for (const def of P1_FIELD_DEFS) {
      all.push({ ...def, schema });
    }
  }

  if (!filter) return all;
  return all.filter(t => {
    const key = `${t.schema}.${t.table}.${t.column}`;
    return key.startsWith(filter);
  });
}

export type RotationStats = {
  readonly target: RotationTarget;
  readonly scanned: number;
  readonly rotated: number;
  readonly skipped: number;
  readonly failed: number;
};

/**
 * Rotate a single text value. Returns the new value or null if nothing to do.
 * Uses `rotateToCurrentKey` from field-encryption: skip if already CURRENT,
 * otherwise decrypt-with-PREVIOUS + re-encrypt-with-CURRENT.
 */
export function rotateTextValue(value: string | null): string | null {
  if (value === null || value === '') return null;
  return rotateToCurrentKey(value); // null if already CURRENT or not encrypted
}

/**
 * Rotate a JSONB value: walks recursively and rotates any enc:v1: string
 * leaves that aren't yet on the CURRENT key. Non-encrypted strings remain
 * unchanged (this script only rotates — it does not encrypt plaintext; that's
 * backfill-context-schema-encryption.ts's job).
 *
 * Returns null if nothing changed (fully idempotent skip).
 */
export function rotateJsonbValue(value: unknown): unknown | null {
  let anyChanged = false;

  function walk(node: unknown): unknown {
    if (node === null || node === undefined) return node;
    if (typeof node === 'string') {
      if (!isEncrypted(node)) return node; // leave plaintext alone
      if (isEncryptedWithCurrentKey(node)) return node; // already CURRENT
      // Rotate: decrypt with whichever key works, re-encrypt with CURRENT.
      const rotated = encrypt(decrypt(node));
      anyChanged = true;
      return rotated;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  }

  const result = walk(value);
  return anyChanged ? result : null;
}

async function tableExists(client: Client, schema: string, table: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );
  return res.rowCount !== null && res.rowCount > 0;
}

async function rotateTarget(
  client: Client,
  target: RotationTarget,
  dryRun: boolean,
  batchSize: number,
): Promise<RotationStats> {
  const { schema, table, column, kind } = target;

  if (!(await tableExists(client, schema, table))) {
    return { target, scanned: 0, rotated: 0, skipped: 0, failed: 0 };
  }

  let scanned = 0;
  let rotated = 0;
  let skipped = 0;
  let failed = 0;
  let lastId: string | null = null;

  while (true) {
    const params: Array<string | null | number> = [batchSize];
    let where = '';
    if (lastId !== null) {
      where = `WHERE id > $2`;
      params.push(lastId);
    }

    const sql = `
      SELECT id, ${column} AS value
        FROM ${schema}.${table}
       ${where}
       ORDER BY id ASC
       LIMIT $1
    `;
    const page = await client.query(sql, params);
    if (page.rowCount === 0) break;

    for (const row of page.rows as Array<{ id: string; value: unknown }>) {
      scanned += 1;
      lastId = row.id;

      try {
        let newValue: unknown = null;
        if (kind === 'text') {
          newValue = rotateTextValue(row.value as string | null);
        } else {
          newValue = rotateJsonbValue(row.value);
        }

        if (newValue === null) {
          skipped += 1;
          continue;
        }

        if (dryRun) {
          rotated += 1;
          continue;
        }

        const updateSql = `UPDATE ${schema}.${table} SET ${column} = $1 WHERE id = $2`;
        await client.query(updateSql, [newValue, row.id]);
        rotated += 1;

        if (rotated % 100 === 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[rotate] ${schema}.${table}.${column} — progress rotated=${rotated}, skipped=${skipped}`
          );
        }
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.error(
          `[rotate] ${schema}.${table}.${column} id=${row.id} failed:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  return { target, scanned, rotated, skipped, failed };
}

export async function runRotation(
  dbUrl: string,
  opts: { dryRun?: boolean; batchSize?: number; fieldFilter?: string | null } = {}
): Promise<RotationStats[]> {
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 1000;
  const fieldFilter = opts.fieldFilter ?? null;

  initEncryption();
  if (!isEncryptionAvailable()) {
    throw new Error('[rotate] ENCRYPTION_KEY not available — cannot rotate.');
  }
  if (!isDualKeyModeActive()) {
    // eslint-disable-next-line no-console
    console.warn(
      '[rotate] Single-key mode — no ENCRYPTION_KEY_PREVIOUS set. Nothing to rotate from. ' +
        'If you just set ENCRYPTION_KEY_PREVIOUS, re-run after restarting the process.'
    );
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const targets = buildTargets(fieldFilter);
  const results: RotationStats[] = [];

  try {
    for (const target of targets) {
      const stat = await rotateTarget(client, target, dryRun, batchSize);
      results.push(stat);
    }
  } finally {
    await client.end();
  }

  return results;
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  dryRun: boolean;
  batchSize: number;
  fieldFilter: string | null;
  json: boolean;
} {
  const out = { dryRun: false, batchSize: 1000, fieldFilter: null as string | null, json: false };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--json') out.json = true;
    else if (arg.startsWith('--batch-size=')) out.batchSize = Number(arg.split('=')[1]);
    else if (arg.startsWith('--field=')) out.fieldFilter = arg.split('=')[1];
  }
  return out;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // eslint-disable-next-line no-console
    console.error('[rotate] DATABASE_URL env var required');
    process.exit(2);
  }
  const { dryRun, batchSize, fieldFilter, json } = parseArgs(process.argv.slice(2));

  // eslint-disable-next-line no-console
  console.log(
    `[rotate] starting — dryRun=${dryRun}, batchSize=${batchSize}, fieldFilter=${fieldFilter ?? 'all'}`
  );

  const results = await runRotation(dbUrl, { dryRun, batchSize, fieldFilter });

  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(results, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log('\n=== Rotation-Summary ===');
    let totalFailed = 0;
    let totalRotated = 0;
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${r.target.schema}.${r.target.table}.${r.target.column} — ` +
          `scanned=${r.scanned}, rotated=${r.rotated}, skipped=${r.skipped}, failed=${r.failed}`
      );
      totalFailed += r.failed;
      totalRotated += r.rotated;
    }
    if (totalFailed > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n[rotate] ❌ ${totalFailed} row(s) failed. See logs above.`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`\n[rotate] ✅ success. ${totalRotated} row(s) rotated to CURRENT key.`);
    }
  }

  const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);
  process.exit(totalFailed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(2);
  });
}
