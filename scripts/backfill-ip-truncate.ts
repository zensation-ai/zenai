/**
 * backfill-ip-truncate.ts — Sprint 1.9 Item 4 (GDPR privacy backfill)
 *
 * Truncates existing `ip_address` values in the tables that store them
 * long-term:
 *
 *   1. public.user_sessions.ip_address
 *   2. security_audit_log.ip_address (in all 4 context schemas)
 *   3. public.user_consent.ip_address
 *   4. public.data_exports.ip_address (if the column exists)
 *
 * Design parallels `backfill-public-encryption.ts`:
 *  - Idempotent: skips rows already in truncated form.
 *  - Batch-based: default 1000 rows / iteration.
 *  - Resume-friendly: paginates with ORDER BY id ASC, WHERE id > lastId.
 *  - Dry-run: `--dry-run` only logs, no UPDATEs issued.
 *
 * Exit codes:
 *   0 — every row is either truncated, already truncated, or NULL.
 *   1 — at least one row failed.
 *   2 — config error (DATABASE_URL missing).
 *
 * Usage:
 *   npx tsx scripts/backfill-ip-truncate.ts
 *   npx tsx scripts/backfill-ip-truncate.ts --dry-run
 *   npx tsx scripts/backfill-ip-truncate.ts --batch-size=500
 *   npx tsx scripts/backfill-ip-truncate.ts --json
 */
import { Client } from 'pg';
import {
  truncateIpAddress,
  isTruncated,
} from '../backend/src/utils/privacy/ip-truncate';

export type IpBackfillTarget = {
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  /** Primary-key column — must be sortable and unique. */
  readonly pkColumn: string;
};

export const IP_BACKFILL_TARGETS: ReadonlyArray<IpBackfillTarget> = [
  { schema: 'public', table: 'user_sessions', column: 'ip_address', pkColumn: 'id' },
  { schema: 'public', table: 'user_consent', column: 'ip_address', pkColumn: 'id' },
  { schema: 'public', table: 'data_exports', column: 'ip_address', pkColumn: 'id' },
  // security_audit_log exists per context-schema.
  { schema: 'operations', table: 'security_audit_log', column: 'ip_address', pkColumn: 'id' },
  { schema: 'finance', table: 'security_audit_log', column: 'ip_address', pkColumn: 'id' },
  { schema: 'people', table: 'security_audit_log', column: 'ip_address', pkColumn: 'id' },
  { schema: 'strategy', table: 'security_audit_log', column: 'ip_address', pkColumn: 'id' },
];

export type IpBackfillStats = {
  readonly target: IpBackfillTarget;
  readonly scanned: number;
  readonly truncated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly lastId: string | null;
};

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

export async function backfillIpTarget(
  client: Pick<Client, 'query'>,
  target: IpBackfillTarget,
  opts: { dryRun: boolean; batchSize: number; resumeFrom: string | null }
): Promise<IpBackfillStats> {
  const { schema, table, column, pkColumn } = target;

  if (!(await tableExists(client, schema, table))) {
    return { target, scanned: 0, truncated: 0, skipped: 0, failed: 0, lastId: null };
  }
  if (!(await columnExists(client, schema, table, column))) {
    return { target, scanned: 0, truncated: 0, skipped: 0, failed: 0, lastId: null };
  }

  let scanned = 0;
  let truncatedCount = 0;
  let skipped = 0;
  let failed = 0;
  let lastId: string | null = opts.resumeFrom;

  while (true) {
    const params: Array<string | number> = [opts.batchSize];
    let where = `WHERE ${column} IS NOT NULL`;
    if (lastId !== null) {
      where += ` AND ${pkColumn} > $2`;
      params.push(lastId);
    }
    const sql = `
      SELECT ${pkColumn} AS id, ${column} AS value
        FROM ${schema}.${table}
       ${where}
       ORDER BY ${pkColumn} ASC
       LIMIT $1
    `;
    const page = await client.query(sql, params);
    if ((page.rowCount ?? 0) === 0) break;

    for (const row of page.rows as Array<{ id: string; value: string | null }>) {
      scanned += 1;
      lastId = row.id;

      try {
        if (row.value === null || isTruncated(row.value)) {
          skipped += 1;
          continue;
        }
        const truncated = truncateIpAddress(row.value);
        if (truncated === row.value) {
          skipped += 1;
          continue;
        }

        if (opts.dryRun) {
          truncatedCount += 1;
          continue;
        }

        await client.query(
          `UPDATE ${schema}.${table} SET ${column} = $1 WHERE ${pkColumn} = $2`,
          [truncated, row.id]
        );
        truncatedCount += 1;
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.error(
          `[backfill-ip] ${schema}.${table}.${column} id=${row.id} failed:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[backfill-ip] ${schema}.${table}.${column} — batch scanned=${page.rowCount}, ` +
        `truncated=${truncatedCount}, skipped=${skipped}, failed=${failed}, lastId=${lastId}`
    );
  }

  return { target, scanned, truncated: truncatedCount, skipped, failed, lastId };
}

export async function runIpBackfill(
  dbUrl: string,
  opts: { dryRun?: boolean; batchSize?: number; resumeToken?: string | null } = {}
): Promise<IpBackfillStats[]> {
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 1000;
  const resumeFrom = opts.resumeToken ?? null;

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const results: IpBackfillStats[] = [];

  try {
    for (const target of IP_BACKFILL_TARGETS) {
      const stat = await backfillIpTarget(client, target, {
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

export function parseIpBackfillArgs(argv: string[]): {
  dryRun: boolean;
  batchSize: number;
  resumeToken: string | null;
  json: boolean;
} {
  const out = {
    dryRun: false,
    batchSize: 1000,
    resumeToken: null as string | null,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--json') out.json = true;
    else if (arg.startsWith('--batch-size=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) out.batchSize = n;
    } else if (arg.startsWith('--resume-token=')) out.resumeToken = arg.split('=')[1];
  }
  return out;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // eslint-disable-next-line no-console
    console.error('[backfill-ip] DATABASE_URL env var required');
    process.exit(2);
  }
  const { dryRun, batchSize, resumeToken, json } = parseIpBackfillArgs(
    process.argv.slice(2)
  );

  // eslint-disable-next-line no-console
  console.log(
    `[backfill-ip] starting — dryRun=${dryRun}, batchSize=${batchSize}, ` +
      `resumeToken=${resumeToken ?? '<none>'}`
  );

  const results = await runIpBackfill(dbUrl, { dryRun, batchSize, resumeToken });

  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(results, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log('\n=== Backfill-IP Summary ===');
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${r.target.schema}.${r.target.table}.${r.target.column} — ` +
          `scanned=${r.scanned}, truncated=${r.truncated}, skipped=${r.skipped}, failed=${r.failed}`
      );
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
