/**
 * Sprint 1.1 (2026-04-16) — DSAR Export Service (DSGVO Art. 20)
 *
 * Async data-portability export. Workflow:
 *
 *   1. Route enqueues a job via createDataExportRequest() — returns export ID immediately.
 *   2. BullMQ worker (queue: 'data-export') runs runDataExport(exportId).
 *   3. Worker collects all user data from public + 4 context schemas.
 *   4. Builds a ZIP archive containing:
 *        manifest.json   — overview + DSGVO metadata
 *        profile.json    — user profile (no password hash, no MFA secret)
 *        memory.json     — memory rows from all 4 schemas
 *        ideas.csv       — flat CSV per schema
 *        emails.csv
 *        calendar.csv
 *        contacts.csv
 *        audit-log.csv
 *   5. Stores the ZIP in DATA_EXPORT_DIR (env, default /tmp/zenai-data-exports).
 *   6. Updates data_exports row to status='completed' and emails the user via Resend.
 *
 * Download URL is gated by a random token (download_token column) and the row's expires_at.
 *
 * Per Anti-Distraction-Regel: this file is intentionally compact. The collector helpers
 * iterate dynamically via information_schema instead of hard-coding hundreds of tables;
 * future tables with a `user_id` column are picked up automatically.
 */

import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { queryPublic } from '../../utils/database-context';
import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { findById, toUserProfile } from './user-service';
import { truncateIpAddress } from '../../utils/privacy/ip-truncate';

const CONTEXTS: AIContext[] = ['operations', 'finance', 'people', 'strategy'];

// Tables that should be exported as CSV (one CSV per name, merged across contexts).
// Other tables go into a single sectional JSON.
const CSV_EXPORT_TABLES = new Set([
  'ideas',
  'emails',
  'email_messages',
  'calendar_events',
  'contacts',
  'tasks',
  'tenant_audit',
  'audit_log',
]);

// Sentinel directory env-var. Defaults to OS-tmp; ops should mount a persistent volume.
const STORAGE_DIR = process.env.DATA_EXPORT_DIR || path.join(process.env.TMPDIR || '/tmp', 'zenai-data-exports');

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface DataExportRow {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  file_path: string | null;
  file_size: number | null;
  download_token: string | null;
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
  expires_at: string;
}

/**
 * Create a new export request row and enqueue the worker job.
 * Returns the row so the route can respond with id + expires_at immediately.
 */
export async function createDataExportRequest(
  userId: string,
  ipAddress?: string,
): Promise<DataExportRow> {
  const downloadToken = randomBytes(32).toString('hex');
  const result = await queryPublic(
    `INSERT INTO public.data_exports (user_id, status, download_token, ip_address)
     VALUES ($1, 'pending', $2, $3)
     RETURNING id, user_id, status, file_path, file_size, download_token, error_message,
               requested_at, completed_at, expires_at`,
    [userId, downloadToken, truncateIpAddress(ipAddress ?? null)],
  );
  const row = result.rows[0] as DataExportRow;

  // Enqueue async job. If queues are unavailable, the route falls back to inline run.
  try {
    const { getQueueService } = await import('../queue/job-queue');
    const queueService = getQueueService();
    await queueService.initialize();
    // Cast: 'data-export' is a new queue (see workers.ts registration).
    const jobId = await (queueService.enqueue as unknown as (
      n: string,
      job: string,
      d: Record<string, unknown>,
    ) => Promise<string | null>)('data-export', 'export', { exportId: row.id, userId });
    logger.info('DSAR export enqueued', { exportId: row.id, userId, jobId });
  } catch (err) {
    logger.warn('DSAR export enqueue failed — caller may run inline', {
      exportId: row.id,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return row;
}

/**
 * Worker entrypoint. Collects all data, writes ZIP, updates row, sends email.
 * Designed to be called from the BullMQ worker AND from a fallback inline runner.
 */
export async function runDataExport(exportId: string): Promise<DataExportRow> {
  await queryPublic(
    `UPDATE public.data_exports SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [exportId],
  );

  const exportRowRes = await queryPublic(
    `SELECT * FROM public.data_exports WHERE id = $1`,
    [exportId],
  );
  if (exportRowRes.rows.length === 0) {
    throw new Error(`data_exports row ${exportId} not found`);
  }
  const exportRow = exportRowRes.rows[0] as DataExportRow;

  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const zipPath = path.join(STORAGE_DIR, `${exportId}.zip`);

    const collected = await collectUserData(exportRow.user_id);
    await writeZip(zipPath, collected);

    const stat = await fs.stat(zipPath);

    const updated = await queryPublic(
      `UPDATE public.data_exports
       SET status = 'completed',
           file_path = $1,
           file_size = $2,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [zipPath, stat.size, exportId],
    );

    // Best-effort email notification.
    await notifyUserExportReady(exportRow.user_id, exportId).catch(err => {
      logger.warn('DSAR email notification failed', {
        exportId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return updated.rows[0] as DataExportRow;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await queryPublic(
      `UPDATE public.data_exports
       SET status = 'failed', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [errMsg.slice(0, 1000), exportId],
    );
    logger.error('DSAR export failed', err instanceof Error ? err : undefined, { exportId });
    throw err;
  }
}

/**
 * Lookup an export row by ID + user (authorization check happens here).
 * Returns null if not found or owned by a different user.
 */
export async function getDataExport(exportId: string, userId: string): Promise<DataExportRow | null> {
  const result = await queryPublic(
    `SELECT * FROM public.data_exports WHERE id = $1 AND user_id = $2`,
    [exportId, userId],
  );
  return result.rows.length > 0 ? (result.rows[0] as DataExportRow) : null;
}

/**
 * Lookup by download token (token is sufficient — used in tokenized URL).
 * Verifies expires_at and status='completed'.
 */
export async function getDataExportByToken(token: string): Promise<DataExportRow | null> {
  const result = await queryPublic(
    `SELECT * FROM public.data_exports
     WHERE download_token = $1
       AND status = 'completed'
       AND expires_at > NOW()`,
    [token],
  );
  return result.rows.length > 0 ? (result.rows[0] as DataExportRow) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: collect data
// ─────────────────────────────────────────────────────────────────────────────

interface CollectedData {
  manifest: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  jsonSections: Record<string, unknown[]>;        // sectionName → rows
  csvSections: Record<string, { header: string[]; rows: string[][] }>;
}

async function collectUserData(userId: string): Promise<CollectedData> {
  const manifest = {
    export_id_note: 'See data_exports row for ID; this is the user-facing manifest',
    user_id: userId,
    generated_at: new Date().toISOString(),
    dsgvo_article: 'Art. 20 (Recht auf Datenübertragbarkeit)',
    contexts: CONTEXTS,
    notes: [
      'profile.json contains your user profile without password-hash or MFA secret.',
      'memory.json bundles memory rows from all 4 context schemas.',
      'CSV files are per data type, merged across contexts (column "context" identifies origin).',
    ],
  };

  // Profile
  const user = await findById(userId);
  const profile = user ? (toUserProfile(user) as unknown as Record<string, unknown>) : null;

  // Per context: enumerate tables with user_id column, fetch all rows.
  const jsonSections: Record<string, unknown[]> = { memory: [] };
  const csvSections: Record<string, { header: string[]; rows: string[][] }> = {};

  for (const ctx of CONTEXTS) {
    let tables: string[];
    try {
      const res = await queryContext(
        ctx,
        `SELECT table_name FROM information_schema.columns
         WHERE table_schema = $1 AND column_name = 'user_id'
         ORDER BY table_name`,
        [ctx],
      );
      tables = (res.rows as Array<{ table_name: string }>).map(r => r.table_name);
    } catch (err) {
      logger.warn(`DSAR collect: skip context ${ctx} (lookup failed)`, {
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (const tbl of tables) {
      let rows: Record<string, unknown>[];
      try {
        // Identifier comes from system catalog — safe to interpolate.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const r = await queryContext(ctx, `SELECT * FROM "${tbl}" WHERE user_id = $1 LIMIT 10000`, [userId]);
        rows = r.rows as Record<string, unknown>[];
      } catch (err) {
        logger.debug(`DSAR collect: skip ${ctx}.${tbl}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      if (rows.length === 0) continue;

      // Annotate with context for transparency.
      const annotated = rows.map(row => ({ context: ctx, ...row }));

      if (CSV_EXPORT_TABLES.has(tbl)) {
        // Merge across contexts.
        if (!csvSections[tbl]) {
          const header = ['context', ...Object.keys(rows[0])];
          csvSections[tbl] = { header, rows: [] };
        }
        for (const r of annotated) {
          csvSections[tbl].rows.push(csvSections[tbl].header.map(h => stringifyCell((r as Record<string, unknown>)[h])));
        }
      } else if (tbl.startsWith('memory_') || tbl === 'episodic_memories' || tbl === 'core_memory_blocks') {
        jsonSections.memory.push(...annotated);
      } else {
        if (!jsonSections[tbl]) jsonSections[tbl] = [];
        jsonSections[tbl].push(...annotated);
      }
    }
  }

  return { manifest, profile, jsonSections, csvSections };
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toCsv(header: string[], rows: string[][]): string {
  const escape = (cell: string) => {
    if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };
  const lines = [header.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: ZIP writing
// ─────────────────────────────────────────────────────────────────────────────

function writeZip(targetPath: string, data: CollectedData): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(targetPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.append(JSON.stringify(data.manifest, null, 2), { name: 'manifest.json' });
    archive.append(JSON.stringify(data.profile ?? {}, null, 2), { name: 'profile.json' });

    for (const [section, rows] of Object.entries(data.jsonSections)) {
      if (rows.length === 0) continue;
      archive.append(JSON.stringify(rows, null, 2), { name: `${section}.json` });
    }
    for (const [tbl, csv] of Object.entries(data.csvSections)) {
      if (csv.rows.length === 0) continue;
      archive.append(toCsv(csv.header, csv.rows), { name: `${tbl}.csv` });
    }

    archive.finalize();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: email notification
// ─────────────────────────────────────────────────────────────────────────────

async function notifyUserExportReady(userId: string, exportId: string): Promise<void> {
  const user = await findById(userId);
  if (!user?.email) return;

  const baseUrl = process.env.PUBLIC_APP_URL || 'https://app.zensation.ai';
  const downloadUrl = `${baseUrl}/api/auth/data-export/${exportId}/download`;

  // Resend may be unavailable in self-host setups — guard the call.
  try {
    const { isResendConfigured, sendEmail } = await import('../resend');
    if (!isResendConfigured()) return;

    await sendEmail({
      to: [user.email],
      subject: 'Deine ZenAI-Datenkopie ist bereit (DSGVO Art. 20)',
      text:
        'Hallo,\n\n' +
        'deine angeforderte Datenkopie ist bereit zum Download.\n\n' +
        `Download-Link: ${downloadUrl}\n\n` +
        'Der Link ist 7 Tage gültig. Danach wird das Archiv automatisch gelöscht.\n\n' +
        'Mit besten Grüßen,\n' +
        'ZenAI – ZenSation\n',
      html:
        `<p>Hallo,</p>` +
        `<p>deine angeforderte Datenkopie ist bereit zum Download.</p>` +
        `<p><a href="${downloadUrl}">${downloadUrl}</a></p>` +
        `<p>Der Link ist <strong>7 Tage gültig</strong>. Danach wird das Archiv automatisch gelöscht.</p>` +
        `<p>Mit besten Grüßen,<br/>ZenAI – ZenSation</p>`,
    });
  } catch (err) {
    logger.warn('DSAR email send skipped', {
      exportId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
