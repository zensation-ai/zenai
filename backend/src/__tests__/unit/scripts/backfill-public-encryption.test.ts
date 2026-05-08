/**
 * Sprint 1.9 — Public-Schema Backfill-Script Unit-Tests
 *
 * Testet die exportierten Helpers aus `scripts/backfill-public-encryption.ts`:
 *   - `encryptPublicTextValue`  (idempotent, null-safe)
 *   - `P0_BACKFILL_TARGETS`     (exakt 5 Felder, erwartete Namen)
 *   - `parsePublicBackfillArgs` (CLI-Flag-Parsing)
 *   - `backfillPublicTarget`    (Batch-Pagination, Dry-Run, Resume-Token)
 *   - `runPublicBackfill`       (Field-Filter, Config-Validation)
 *
 * Die echte DB-Integration wird über einen Fake-pg-Client abgedeckt, der
 * `.query()` schichtweise mockt — kein Netzwerk, keine Postgres-Abhängigkeit.
 */

// Setze ENCRYPTION_KEY VOR dem Import, damit initEncryption() beim ersten
// Import erfolgreich ist.
process.env.ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import {
  encryptPublicTextValue,
  P0_BACKFILL_TARGETS,
  parsePublicBackfillArgs,
  backfillPublicTarget,
  runPublicBackfill,
} from '../../../../../scripts/backfill-public-encryption';
import {
  isEncrypted,
  initEncryption,
  decrypt,
} from '../../../services/security/field-encryption';

// ─── Shared fake-client ──────────────────────────────────────────────────────
//
// Mini Pick<Client, 'query'>-Shim, der exakt so viel implementiert, wie die
// Helper aus dem Script brauchen. Queuing über `handlers[]` ermöglicht den
// Tests pro Test ein eigenes Script.

type QueryHandler = (sql: string, params?: unknown[]) => Promise<unknown>;

function makeFakeClient(handlers: QueryHandler[]): {
  query: jest.Mock;
  calls: Array<{ sql: string; params?: unknown[] }>;
} {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let idx = 0;
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const handler = handlers[idx];
    idx += 1;
    if (!handler) {
      throw new Error(
        `fake client: unexpected query #${idx}:\n${sql}\nparams=${JSON.stringify(params)}`
      );
    }
    return handler(sql, params);
  });
  return { query, calls };
}

describe('backfill-public-encryption — Unit', () => {
  beforeAll(() => {
    initEncryption();
  });

  // ─── encryptPublicTextValue ────────────────────────────────────────────────

  describe('encryptPublicTextValue', () => {
    it('returns null for null input', () => {
      expect(encryptPublicTextValue(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(encryptPublicTextValue(undefined)).toBeNull();
    });

    it('returns null for empty string input', () => {
      expect(encryptPublicTextValue('')).toBeNull();
    });

    it('returns null for already-encrypted values (idempotent)', () => {
      const alreadyEncrypted = 'enc:v1:dGVzdA==:dGVzdA==:dGVzdA==';
      expect(encryptPublicTextValue(alreadyEncrypted)).toBeNull();
    });

    it('encrypts plaintext and returns a decryptable enc:v1: envelope', () => {
      const out = encryptPublicTextValue('my-mfa-secret');
      expect(out).not.toBeNull();
      expect(out!.startsWith('enc:v1:')).toBe(true);
      expect(isEncrypted(out!)).toBe(true);
      expect(decrypt(out!)).toBe('my-mfa-secret');
    });

    it('produces unique ciphertexts for identical plaintext (IV uniqueness)', () => {
      const a = encryptPublicTextValue('same-token');
      const b = encryptPublicTextValue('same-token');
      expect(a).not.toBe(b);
      expect(decrypt(a!)).toBe('same-token');
      expect(decrypt(b!)).toBe('same-token');
    });

    it('is idempotent end-to-end: plaintext → enc → pass-through null', () => {
      const enc = encryptPublicTextValue('secret');
      expect(enc).not.toBeNull();
      const second = encryptPublicTextValue(enc!);
      expect(second).toBeNull();
    });
  });

  // ─── P0_BACKFILL_TARGETS ───────────────────────────────────────────────────

  describe('P0_BACKFILL_TARGETS', () => {
    it('covers exactly the 5 Sprint-1.3 P0 fields', () => {
      expect(P0_BACKFILL_TARGETS).toHaveLength(5);
    });

    it('targets users.mfa_secret, integration_tokens.*, google_oauth_tokens.*', () => {
      const keys = P0_BACKFILL_TARGETS.map(
        (t) => `${t.schema}.${t.table}.${t.column}`
      );
      expect(keys).toEqual([
        'public.users.mfa_secret',
        'public.integration_tokens.access_token',
        'public.integration_tokens.refresh_token',
        'public.google_oauth_tokens.access_token',
        'public.google_oauth_tokens.refresh_token',
      ]);
    });

    it('ties each target to the Sprint-1.3 constraint name so VALIDATE works', () => {
      const names = P0_BACKFILL_TARGETS.map((t) => t.constraintName);
      expect(names).toEqual([
        'users_mfa_secret_encrypted_check',
        'integration_tokens_access_token_encrypted_check',
        'integration_tokens_refresh_token_encrypted_check',
        'google_oauth_tokens_access_token_encrypted_check',
        'google_oauth_tokens_refresh_token_encrypted_check',
      ]);
    });
  });

  // ─── parsePublicBackfillArgs ───────────────────────────────────────────────

  describe('parsePublicBackfillArgs', () => {
    it('returns sensible defaults for empty argv', () => {
      expect(parsePublicBackfillArgs([])).toEqual({
        dryRun: false,
        batchSize: 500,
        fieldFilter: null,
        resumeToken: null,
        json: false,
      });
    });

    it('parses --dry-run, --json, --batch-size, --field, --resume-token', () => {
      const args = parsePublicBackfillArgs([
        '--dry-run',
        '--json',
        '--batch-size=200',
        '--field=public.users.mfa_secret',
        '--resume-token=11111111-1111-1111-1111-111111111111',
      ]);
      expect(args).toEqual({
        dryRun: true,
        batchSize: 200,
        fieldFilter: 'public.users.mfa_secret',
        resumeToken: '11111111-1111-1111-1111-111111111111',
        json: true,
      });
    });

    it('ignores invalid --batch-size values and keeps the default', () => {
      expect(parsePublicBackfillArgs(['--batch-size=abc']).batchSize).toBe(500);
      expect(parsePublicBackfillArgs(['--batch-size=-5']).batchSize).toBe(500);
      expect(parsePublicBackfillArgs(['--batch-size=0']).batchSize).toBe(500);
    });

    it('ignores unknown flags silently', () => {
      expect(parsePublicBackfillArgs(['--unknown', '--other=x'])).toEqual({
        dryRun: false,
        batchSize: 500,
        fieldFilter: null,
        resumeToken: null,
        json: false,
      });
    });
  });

  // ─── backfillPublicTarget ──────────────────────────────────────────────────

  describe('backfillPublicTarget', () => {
    const target = {
      schema: 'public' as const,
      table: 'users',
      column: 'mfa_secret',
      constraintName: 'users_mfa_secret_encrypted_check',
    };

    it('returns zeros if the table does not exist', async () => {
      const { query } = makeFakeClient([
        async () => ({ rowCount: 0 }), // tableExists → false
      ]);
      const stats = await backfillPublicTarget({ query } as never, target, {
        dryRun: false,
        batchSize: 10,
        resumeFrom: null,
      });
      expect(stats.scanned).toBe(0);
      expect(stats.encrypted).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('returns zeros if the column does not exist', async () => {
      const { query } = makeFakeClient([
        async () => ({ rowCount: 1 }), // tableExists → true
        async () => ({ rowCount: 0 }), // columnExists → false
      ]);
      const stats = await backfillPublicTarget({ query } as never, target, {
        dryRun: false,
        batchSize: 10,
        resumeFrom: null,
      });
      expect(stats.scanned).toBe(0);
    });

    it('encrypts all plaintext rows across multiple batches until empty page', async () => {
      const { query, calls } = makeFakeClient([
        async () => ({ rowCount: 1 }), // tableExists
        async () => ({ rowCount: 1 }), // columnExists
        // Batch 1 — two rows
        async () => ({
          rowCount: 2,
          rows: [
            { id: 'u1', value: 'secret-a' },
            { id: 'u2', value: 'secret-b' },
          ],
        }),
        async () => ({ rowCount: 1 }), // UPDATE row 1
        async () => ({ rowCount: 1 }), // UPDATE row 2
        // Batch 2 — empty, loop breaks
        async () => ({ rowCount: 0, rows: [] }),
      ]);

      const stats = await backfillPublicTarget({ query } as never, target, {
        dryRun: false,
        batchSize: 500,
        resumeFrom: null,
      });

      expect(stats.scanned).toBe(2);
      expect(stats.encrypted).toBe(2);
      expect(stats.skipped).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.lastId).toBe('u2');
      const updateCalls = calls.filter((c) => /UPDATE/.test(c.sql));
      expect(updateCalls).toHaveLength(2);
      // The second SQL param must be a row id.
      expect(updateCalls[0].params?.[1]).toBe('u1');
      expect(updateCalls[1].params?.[1]).toBe('u2');
      // The encrypted payload must have enc:v1: prefix.
      expect(String(updateCalls[0].params?.[0])).toMatch(/^enc:v1:/);
    });

    it('skips already-encrypted rows without issuing UPDATEs', async () => {
      const enc = 'enc:v1:dGVzdA==:dGVzdA==:dGVzdA==';
      const { query, calls } = makeFakeClient([
        async () => ({ rowCount: 1 }), // tableExists
        async () => ({ rowCount: 1 }), // columnExists
        async () => ({
          rowCount: 1,
          rows: [{ id: 'u1', value: enc }],
        }),
        async () => ({ rowCount: 0, rows: [] }), // empty
      ]);
      const stats = await backfillPublicTarget({ query } as never, target, {
        dryRun: false,
        batchSize: 500,
        resumeFrom: null,
      });
      expect(stats.scanned).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.encrypted).toBe(0);
      expect(calls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
    });

    it('dry-run does NOT issue UPDATEs but still counts encryptable rows', async () => {
      const { query, calls } = makeFakeClient([
        async () => ({ rowCount: 1 }), // tableExists
        async () => ({ rowCount: 1 }), // columnExists
        async () => ({
          rowCount: 1,
          rows: [{ id: 'u1', value: 'plain' }],
        }),
        async () => ({ rowCount: 0, rows: [] }),
      ]);
      const stats = await backfillPublicTarget({ query } as never, target, {
        dryRun: true,
        batchSize: 500,
        resumeFrom: null,
      });
      expect(stats.encrypted).toBe(1);
      expect(calls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
    });

    it('honors resumeFrom: first SELECT contains id > $2 and the resume id', async () => {
      const { query, calls } = makeFakeClient([
        async () => ({ rowCount: 1 }), // tableExists
        async () => ({ rowCount: 1 }), // columnExists
        async () => ({ rowCount: 0, rows: [] }), // empty batch, loop exits
      ]);
      await backfillPublicTarget({ query } as never, target, {
        dryRun: false,
        batchSize: 100,
        resumeFrom: 'u-cursor',
      });
      const selectCall = calls.find((c) => /SELECT id,/.test(c.sql));
      expect(selectCall).toBeDefined();
      expect(selectCall!.sql).toMatch(/id > \$2/);
      expect(selectCall!.params).toEqual([100, 'u-cursor']);
    });

    it('counts failed rows but keeps going', async () => {
      // Simulate: encrypt succeeds, but UPDATE throws for row 1.
      const { query } = makeFakeClient([
        async () => ({ rowCount: 1 }), // tableExists
        async () => ({ rowCount: 1 }), // columnExists
        async () => ({
          rowCount: 2,
          rows: [
            { id: 'u1', value: 'plain-a' },
            { id: 'u2', value: 'plain-b' },
          ],
        }),
        async () => {
          throw new Error('db offline');
        }, // UPDATE row 1 fails
        async () => ({ rowCount: 1 }), // UPDATE row 2 succeeds
        async () => ({ rowCount: 0, rows: [] }),
      ]);
      const consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const stats = await backfillPublicTarget({ query } as never, target, {
        dryRun: false,
        batchSize: 500,
        resumeFrom: null,
      });
      consoleErrSpy.mockRestore();
      consoleLogSpy.mockRestore();

      expect(stats.scanned).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.encrypted).toBe(1);
    });
  });

  // ─── runPublicBackfill (via field-filter-only path; no real DB) ─────────────

  describe('runPublicBackfill — field filter validation', () => {
    it('throws when --field does not match any target', async () => {
      await expect(
        runPublicBackfill('postgres://ignored', {
          fieldFilter: 'public.unknown_table.foo',
        })
      ).rejects.toThrow(/no target matches/);
    });
  });
});
