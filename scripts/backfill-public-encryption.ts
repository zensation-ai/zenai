/**
 * backfill-public-encryption.ts — Sprint 1.9 Item 3 (P0 public-schema backfill)
 *
 * Sibling to `backfill-context-schema-encryption.ts` (Sprint 1.5), but targets
 * the 5 P0 TEXT-columns in the `public.*` schema that Sprint 1.3's
 * migration gated behind a plaintext-audit:
 *
 *   1. public.users.mfa_secret
 *   2. public.integration_tokens.access_token
 *   3. public.integration_tokens.refresh_token
 *   4. public.google_oauth_tokens.access_token
 *   5. public.google_oauth_tokens.refresh_token
 *
 * Sprint 1.3's `sprint_1_3_encrypt_sensitive_fields.sql` adds CHECK constraints
 * that enforce the `enc:v1:`-prefix, but ONLY if no plaintext is present at
 * migration time — otherwise the constraints are silently skipped. The new
 * `sprint_1_9_enable_public_encryption_checks.sql` migration instead uses the
 * NOT VALID / VALIDATE pattern (like Sprint 1.5), so the constraints always
 * get applied to guard new writes; this script converts the remaining
 * plaintext rows so `VALIDATE CONSTRAINT` can then pass.
 *
 * Architecture:
 *  - Idempotent: per-row check for `enc:v1:` → skip.
 *  - Batch-based: default 500 rows / iteration.
 *  - Resume-friendly: paginates with `ORDER BY id ASC, WHERE id > lastId`.
 *    The `--resume-token` flag lets the operator restart mid-run.
 *  - Dry-run: `--dry-run` only logs, no UPDATEs issued.
 *
 * Exit codes:
 *   0 — every scanned row is now encrypted (or was already, or column absent).
 *   1 — at least one row failed (decrypt-error, column not TEXT, etc.).
 *   2 — config error (DATABASE_URL missing, ENCRYPTION_KEY missing).
 *
 * Usage:
 *   npx tsx scripts/backfill-public-encryption.ts
 *   npx tsx scripts/backfill-public-encryption.ts --dry-run
 *   npx tsx scripts/backfill-public-encryption.ts --batch-size=200
 *   npx tsx scripts/backfill-public-encryption.ts --resume-token=<uuid>
 *   npx tsx scripts/backfill-public-encryption.ts --field=public.users.mfa_secret
 *   npx tsx scripts/backfill-public-encryption.ts --json
 */
import { Client } from 'pg';
import {
  encrypt,
  isEncryptionAvailable,
  initEncryption,
} from '../backend/src/services/security/field-encryption';

export type PublicBackfillTarget = {
  readonly schema: 'public';
  readonly table: string;
  readonly column: string;
  readonly constraintName: string;
};

export const P0_BACKFILL_TARGETS: ReadonlyArray<PublicBackfillTarget> = [
  {
    schema: 'public',
    table: 'users',
    column: 'mfa_secret',
    constraintName: 'users_mfa_secret_encrypted_check',
  },
  {
    schema: 'public',
    table: 'integration_tokens',
    column: 'access_token',
    constraintName: 'integration_tokens_access_token_encrypted_check',
  },
  {
    schema: 'public',
    table: 'integration_tokens',
    column: 'refresh_token',
    constraintName: 'integration_tokens_refresh_token_encrypted_check',
  },
  {
    schema: 'public',
    table: 'google_oauth_tokens',
    column: 'access_token',
    constraintName: 'google_oauth_tokens_access_token_encrypted_check',
  },
  {
    schema: 'public',
    table: 'google_oauth_tokens',
    column: 'refresh_token',
    constraintName: 'google_oauth_tokens_refresh_token_encrypted_check',
  },
];

export type PublicBackfillStats = {
  readonly target: PublicBackfillTarget;
  readonly scanned: number;
  readonly encrypted: number;
  readonly skipped: number;
  readonly failed: number;
  /** Last id seen — use as `--resume-token` on restart. */
  readonly lastId: string | null;
};

/**
 * Idempotent text-field encryptor.
 * Returns `null` when nothing to do (already encrypted / empty / null).
 */
export function encryptPublicTextValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value.startsWith('enc:v1:')) return null;
  return encrypt(value);
}

async function tableExists(
  client: Pick<Client, 'query'>,
  schema: string,
  table: string
): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );
  return (res.rowCount ?? 0) > 0;
}

async function columnExists(
  client: Pick<Client, 'query'>,
  schema: string,
  table: string,
  column: string
): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, column]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function backfillPublicTarget(
  client: Pick<Client, 'query'>,
  target: PublicBackfillTarget,
  opts: { dryRun: boolean; batchSize: number; resumeFrom: string | null }
): Promise<PublicBackfillStats> {
  const { schema, table, column } = target;

  if (!(await tableExists(client, schema, table))) {
    return {
      target,
      scanned: 0,
      encrypted: 0,
      skipped: 0,
      failed: 0,
      lastId: null,
    };
  }
  if (!(await columnExists(client, schema, table, column))) {
    return {
      target,
      scanned: 0,
      encrypted: 0,
      skipped: 0,
      failed: 0,
      lastId: null,
    };
  }

  let scanned = 0;
  let encryptedCount = 0;
  let skipped = 0;
  let failed = 0;
  let lastId: string | null = opts.resumeFrom;

  // Paginate strictly-greater-than id so the run is safely resumable.
  while (true) {
    const params: Array<string | number> = [opts.batchSize];
    let where = `WHERE ${column} IS NOT NULL AND ${column} NOT LIKE 'enc:v1:%'`;
    if (lastId !== null) {
      where += ` AND id > $2`;
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
    if ((page.rowCount ?? 0) === 0) break;

    for (const row of page.rows as Array<{ id: string; value: string | null }>) {
      scanned += 1;
      lastId = row.id;

      try {
        const newValue = encryptPublicTextValue(row.value);
        if (newValue === null) {
          skipped += 1;
          continue;
        }

        if (opts.dryRun) {
          encryptedCount += 1;
          continue;
        }

        await client.query(
          `UPDATE ${schema}.${table} SET ${column} = $1 WHERE id = $2`,
          [newValue, row.id]
        );
        encryptedCount += 1;
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.error(
          `[backfill-public] ${schema}.${table}.${column} id=${row.id} failed:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[backfill-public] ${schema}.${table}.${column} — batch scanned=${page.rowCount}, ` +
        `encrypted=${encryptedCount}, skipped=${skipped}, failed=${failed}, lastId=${lastId}`
    );
  }

  return {
    target,
    scanned,
    encrypted: encryptedCount,
    skipped,
    failed,
    lastId,
  };
}

export async function runPublicBackfill(
  dbUrl: string,
  opts: {
    dryRun?: boolean;
    batchSize?: number;
    fieldFilter?: string | null;
    resumeToken?: string | null;
  } = {}
): Promise<PublicBackfillStats[]> {
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 500;
  const fieldFilter = opts.fieldFilter ?? null;
  const resumeFrom = opts.resumeToken ?? null;

  initEncryption();
  if (!isEncryptionAvailable()) {
    throw new Error(
      '[backfill-public] ENCRYPTION_KEY not available — set it before running.'
    );
  }

  const targets = fieldFilter
    ? P0_BACKFILL_TARGETS.filter(
        (t) => `${t.schema}.${t.table}.${t.column}` === fieldFilter
      )
    : [...P0_BACKFILL_TARGETS];

  if (targets.length === 0) {
    throw new Error(
      `[backfill-public] no target matches --field=${fieldFilter}. Valid: ${P0_BACKFILL_TARGETS.map(
        (t) => `${t.schema}.${t.table}.${t.column}`
      ).join(', ')}`
    );
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const results: PublicBackfillStats[] = [];

  try {
    for (const target of targets) {
      const stat = await backfillPublicTarget(client, target, {
        dryRun,
        batchSize,
        resumeFrom,
      });
      results.push(stat);
    }
  } finally {
    await client.end();
  }

  return results;
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

export function parsePublicBackfillArgs(argv: string[]): {
  dryRun: boolean;
  batchSize: number;
  fieldFilter: string | null;
  resumeToken: string | null;
  json: boolean;
} {
  const out = {
    dryRun: false,
    batchSize: 500,
    fieldFilter: null as string | null,
    resumeToken: null as string | null,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--json') out.json = true;
    else if (arg.startsWith('--batch-size=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) out.batchSize = n;
    } else if (arg.startsWith('--field=')) out.fieldFilter = arg.split('=')[1];
    else if (arg.startsWith('--resume-token=')) out.resumeToken = arg.split('=')[1];
  }
  return out;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // eslint-disable-next-line no-console
    console.error('[backfill-public] DATABASE_URL env var required');
    process.exit(2);
  }
  const { dryRun, batchSize, fieldFilter, resumeToken, json } = parsePublicBackfillArgs(
    process.argv.slice(2)
  );

  // eslint-disable-next-line no-console
  console.log(
    `[backfill-public] starting — dryRun=${dryRun}, batchSize=${batchSize}, ` +
      `field=${fieldFilter ?? 'all'}, resumeToken=${resumeToken ?? '<none>'}`
  );

  const results = await runPublicBackfill(dbUrl, {
    dryRun,
    batchSize,
    fieldFilter,
    resumeToken,
  });

  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(results, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log('\n=== Backfill-Public Summary ===');
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${r.target.schema}.${r.target.table}.${r.target.column} — ` +
          `scanned=${r.scanned}, encrypted=${r.encrypted}, skipped=${r.skipped}, failed=${r.failed}`
      );
    }
    const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);
    if (totalFailed > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n[backfill-public] ${totalFailed} row(s) failed. See logs.`);
    } else {
      // eslint-disable-next-line no-console
      console.log('\n[backfill-public] done. Run VALIDATE CONSTRAINT now:');
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
