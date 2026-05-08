/**
 * backfill-context-schema-encryption.ts — Sprint 1.5 Item 2
 *
 * Wechselt P1-Bestandsdaten in den Kontext-Schemas von Plaintext auf AES-256-
 * GCM-Encryption (via field-encryption.ts). Wird NACH der Migration
 * `sprint_1_5_context_schema_check_constraints.sql` ausgeführt — diese legt
 * CHECK-Constraints als NOT VALID an, sodass dieses Script dann den
 * Bestandsdaten-Backfill durchführen und anschließend
 * `ALTER TABLE ... VALIDATE CONSTRAINT` nachziehen kann.
 *
 * 6 Felder × 4 Schemas = max. 24 Spalten (tatsächlich weniger, weil nicht jedes
 * Schema alle Tabellen hat). Siehe Migration-Header für die Liste.
 *
 * Architektur:
 *  - Idempotent: prüft pro Zeile, ob bereits `enc:v1:` — skip wenn ja.
 *  - Batch-basiert: default 1000 Zeilen/Transaktion.
 *  - Resume-fähig: LAST_ROTATED_AT-Column optional; fallback ORDER BY id.
 *  - Dry-Run: `--dry-run` loggt nur, schreibt nicht.
 *
 * Exit-Codes:
 *   0 — erfolgreich, alle Zeilen verschlüsselt (oder waren bereits).
 *   1 — mindestens eine Zeile fehlgeschlagen.
 *
 * Usage:
 *   npx tsx scripts/backfill-context-schema-encryption.ts
 *   npx tsx scripts/backfill-context-schema-encryption.ts --dry-run
 *   npx tsx scripts/backfill-context-schema-encryption.ts --batch-size=500
 *   npx tsx scripts/backfill-context-schema-encryption.ts --schema=operations
 */
import { Client } from 'pg';
import { encrypt, isEncryptionAvailable, initEncryption } from '../backend/src/services/security/field-encryption';

type BackfillTarget = {
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  readonly kind: 'text' | 'jsonb';
  readonly constraintName: string;
};

const CONTEXTS = ['operations', 'finance', 'people', 'strategy'] as const;

// 6 Felder aus Sprint 1.5 Item 2.
const FIELD_DEFS: ReadonlyArray<Omit<BackfillTarget, 'schema'>> = [
  {
    table: 'mcp_server_connections',
    column: 'credentials',
    kind: 'jsonb',
    constraintName: 'mcp_credentials_encrypted_sprint_1_5',
  },
  {
    table: 'email_accounts',
    column: 'smtp_password',
    kind: 'text',
    constraintName: 'smtp_password_encrypted_sprint_1_5',
  },
  {
    table: 'email_accounts',
    column: 'imap_password',
    kind: 'text',
    constraintName: 'imap_password_encrypted_sprint_1_5',
  },
  {
    table: 'calendar_events',
    column: 'location',
    kind: 'text',
    constraintName: 'location_encrypted_sprint_1_5',
  },
  {
    table: 'financial_accounts',
    column: 'account_number',
    kind: 'text',
    constraintName: 'account_number_encrypted_sprint_1_5',
  },
  {
    table: 'contacts',
    column: 'phone',
    kind: 'text',
    constraintName: 'phone_encrypted_sprint_1_5',
  },
];

function buildTargets(schemaFilter: string | null): BackfillTarget[] {
  const targets: BackfillTarget[] = [];
  for (const schema of CONTEXTS) {
    if (schemaFilter && schema !== schemaFilter) continue;
    for (const def of FIELD_DEFS) {
      targets.push({ ...def, schema });
    }
  }
  return targets;
}

export type BackfillStats = {
  readonly target: BackfillTarget;
  readonly scanned: number;
  readonly encrypted: number;
  readonly skipped: number;
  readonly failed: number;
};

/**
 * Encrypt a single text value. Idempotent: returns null if already encrypted.
 */
export function encryptTextValue(value: string | null): string | null {
  if (value === null || value === '') return null;
  if (value.startsWith('enc:v1:')) return null; // already encrypted — skip
  return encrypt(value);
}

/**
 * Encrypt a JSONB value recursively: encrypts every non-empty string leaf,
 * leaves numbers/booleans untouched. Returns null if the value was already
 * fully encrypted.
 */
export function encryptJsonbValue(value: unknown): unknown | null {
  let anyChanged = false;

  function walk(node: unknown): unknown {
    if (node === null || node === undefined) return node;
    if (typeof node === 'string') {
      if (node === '' || node.startsWith('enc:v1:')) return node;
      anyChanged = true;
      return encrypt(node);
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
    return node; // number, boolean — leave as-is
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

async function columnExists(
  client: Client,
  schema: string,
  table: string,
  column: string,
): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, column]
  );
  return res.rowCount !== null && res.rowCount > 0;
}

async function backfillTarget(
  client: Client,
  target: BackfillTarget,
  dryRun: boolean,
  batchSize: number,
): Promise<BackfillStats> {
  const { schema, table, column, kind } = target;

  if (!(await tableExists(client, schema, table))) {
    return { target, scanned: 0, encrypted: 0, skipped: 0, failed: 0 };
  }
  if (!(await columnExists(client, schema, table, column))) {
    return { target, scanned: 0, encrypted: 0, skipped: 0, failed: 0 };
  }

  let scanned = 0;
  let encryptedCount = 0;
  let skipped = 0;
  let failed = 0;
  let lastId: string | null = null;

  // Iteration via paginated SELECT, ORDER BY id ASC.
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
          newValue = encryptTextValue(row.value as string | null);
        } else {
          newValue = encryptJsonbValue(row.value);
        }

        if (newValue === null) {
          // Already encrypted or empty — nothing to do.
          skipped += 1;
          continue;
        }

        if (dryRun) {
          encryptedCount += 1;
          continue;
        }

        const updateSql = `UPDATE ${schema}.${table} SET ${column} = $1 WHERE id = $2`;
        await client.query(updateSql, [newValue, row.id]);
        encryptedCount += 1;
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.error(
          `[backfill] ${schema}.${table}.${column} id=${row.id} failed:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // Progress-Log every batch
    // eslint-disable-next-line no-console
    console.log(
      `[backfill] ${schema}.${table}.${column} — batch scanned=${page.rowCount}, encrypted=${encryptedCount}, skipped=${skipped}, failed=${failed}`
    );
  }

  return { target, scanned, encrypted: encryptedCount, skipped, failed };
}

export async function runBackfill(
  dbUrl: string,
  opts: { dryRun?: boolean; batchSize?: number; schemaFilter?: string | null } = {}
): Promise<BackfillStats[]> {
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 1000;
  const schemaFilter = opts.schemaFilter ?? null;

  initEncryption();
  if (!isEncryptionAvailable()) {
    throw new Error(
      '[backfill] ENCRYPTION_KEY not available — cannot encrypt. Set ENCRYPTION_KEY and re-run.'
    );
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const targets = buildTargets(schemaFilter);
  const results: BackfillStats[] = [];

  try {
    for (const target of targets) {
      const stat = await backfillTarget(client, target, dryRun, batchSize);
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
  schemaFilter: string | null;
  json: boolean;
} {
  const out = { dryRun: false, batchSize: 1000, schemaFilter: null as string | null, json: false };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--json') out.json = true;
    else if (arg.startsWith('--batch-size=')) out.batchSize = Number(arg.split('=')[1]);
    else if (arg.startsWith('--schema=')) out.schemaFilter = arg.split('=')[1];
  }
  return out;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // eslint-disable-next-line no-console
    console.error('[backfill] DATABASE_URL env var required');
    process.exit(2);
  }
  const { dryRun, batchSize, schemaFilter, json } = parseArgs(process.argv.slice(2));

  // eslint-disable-next-line no-console
  console.log(
    `[backfill] starting — dryRun=${dryRun}, batchSize=${batchSize}, schemaFilter=${schemaFilter ?? 'all'}`
  );

  const results = await runBackfill(dbUrl, { dryRun, batchSize, schemaFilter });

  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(results, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log('\n=== Backfill-Summary ===');
    let totalFailed = 0;
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${r.target.schema}.${r.target.table}.${r.target.column} — ` +
          `scanned=${r.scanned}, encrypted=${r.encrypted}, skipped=${r.skipped}, failed=${r.failed}`
      );
      totalFailed += r.failed;
    }
    if (totalFailed > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n[backfill] ❌ ${totalFailed} row(s) failed. See logs above.`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`\n[backfill] ✅ success. Run VALIDATE CONSTRAINT now:`);
      for (const r of results) {
        if (r.encrypted === 0 && r.skipped === 0) continue;
        // eslint-disable-next-line no-console
        console.log(
          `    ALTER TABLE ${r.target.schema}.${r.target.table} VALIDATE CONSTRAINT ${r.target.constraintName};`
        );
      }
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
