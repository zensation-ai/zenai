/**
 * Sprint 1.9 — IP-Backfill-Script Unit-Tests
 *
 * Exercises the exported helpers from `scripts/backfill-ip-truncate.ts`:
 *   - IP_BACKFILL_TARGETS sanity
 *   - parseIpBackfillArgs flag parsing
 *   - backfillIpTarget: batch loop, idempotency, dry-run, resume-token
 */

import {
  IP_BACKFILL_TARGETS,
  parseIpBackfillArgs,
  backfillIpTarget,
} from '../../../../../scripts/backfill-ip-truncate';

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

describe('IP_BACKFILL_TARGETS', () => {
  it('covers user_sessions, user_consent, data_exports, and 4 context audit logs', () => {
    const keys = IP_BACKFILL_TARGETS.map(
      (t) => `${t.schema}.${t.table}`
    );
    expect(keys).toEqual([
      'public.user_sessions',
      'public.user_consent',
      'public.data_exports',
      'operations.security_audit_log',
      'finance.security_audit_log',
      'people.security_audit_log',
      'strategy.security_audit_log',
    ]);
  });

  it('always uses "ip_address" as the column and "id" as the pk', () => {
    for (const t of IP_BACKFILL_TARGETS) {
      expect(t.column).toBe('ip_address');
      expect(t.pkColumn).toBe('id');
    }
  });
});

describe('parseIpBackfillArgs', () => {
  it('returns sensible defaults for empty argv', () => {
    expect(parseIpBackfillArgs([])).toEqual({
      dryRun: false,
      batchSize: 1000,
      resumeToken: null,
      json: false,
    });
  });

  it('parses all known flags', () => {
    expect(
      parseIpBackfillArgs([
        '--dry-run',
        '--json',
        '--batch-size=250',
        '--resume-token=00000000-0000-0000-0000-000000000000',
      ])
    ).toEqual({
      dryRun: true,
      batchSize: 250,
      resumeToken: '00000000-0000-0000-0000-000000000000',
      json: true,
    });
  });

  it('ignores invalid batch-size values', () => {
    expect(parseIpBackfillArgs(['--batch-size=-1']).batchSize).toBe(1000);
    expect(parseIpBackfillArgs(['--batch-size=nan']).batchSize).toBe(1000);
  });
});

describe('backfillIpTarget', () => {
  const target = {
    schema: 'public' as const,
    table: 'user_sessions',
    column: 'ip_address',
    pkColumn: 'id',
  };

  it('returns zeros if the table is missing', async () => {
    const { query } = makeFakeClient([
      async () => ({ rowCount: 0 }), // tableExists → false
    ]);
    const stats = await backfillIpTarget({ query } as never, target, {
      dryRun: false,
      batchSize: 100,
      resumeFrom: null,
    });
    expect(stats.scanned).toBe(0);
    expect(stats.truncated).toBe(0);
  });

  it('returns zeros if the column is missing', async () => {
    const { query } = makeFakeClient([
      async () => ({ rowCount: 1 }), // tableExists
      async () => ({ rowCount: 0 }), // columnExists → false
    ]);
    const stats = await backfillIpTarget({ query } as never, target, {
      dryRun: false,
      batchSize: 100,
      resumeFrom: null,
    });
    expect(stats.scanned).toBe(0);
  });

  it('truncates full IPv4 + IPv6 rows across a batch and skips truncated ones', async () => {
    const { query, calls } = makeFakeClient([
      async () => ({ rowCount: 1 }), // tableExists
      async () => ({ rowCount: 1 }), // columnExists
      async () => ({
        rowCount: 3,
        rows: [
          { id: 's1', value: '203.0.113.42' },              // full v4 → truncate
          { id: 's2', value: '192.168.1.0' },                // already truncated → skip
          { id: 's3', value: '2001:db8:abcd:1234:5678::1' }, // full v6 → truncate
        ],
      }),
      async () => ({ rowCount: 1 }), // UPDATE s1
      async () => ({ rowCount: 1 }), // UPDATE s3
      async () => ({ rowCount: 0, rows: [] }), // empty → loop exits
    ]);
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const stats = await backfillIpTarget({ query } as never, target, {
      dryRun: false,
      batchSize: 500,
      resumeFrom: null,
    });
    consoleLogSpy.mockRestore();

    expect(stats.scanned).toBe(3);
    expect(stats.truncated).toBe(2);
    expect(stats.skipped).toBe(1);
    expect(stats.failed).toBe(0);

    const updateCalls = calls.filter((c) => /UPDATE/.test(c.sql));
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0].params?.[0]).toBe('203.0.113.0');
    expect(updateCalls[1].params?.[0]).toMatch(/^2001:db8:abcd:1234::$/);
  });

  it('does not issue UPDATEs in dry-run mode', async () => {
    const { query, calls } = makeFakeClient([
      async () => ({ rowCount: 1 }),
      async () => ({ rowCount: 1 }),
      async () => ({
        rowCount: 1,
        rows: [{ id: 's1', value: '10.0.0.5' }],
      }),
      async () => ({ rowCount: 0, rows: [] }),
    ]);
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const stats = await backfillIpTarget({ query } as never, target, {
      dryRun: true,
      batchSize: 100,
      resumeFrom: null,
    });
    consoleLogSpy.mockRestore();

    expect(stats.truncated).toBe(1);
    expect(calls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('honors resumeFrom and uses it in the WHERE clause', async () => {
    const { query, calls } = makeFakeClient([
      async () => ({ rowCount: 1 }),
      async () => ({ rowCount: 1 }),
      async () => ({ rowCount: 0, rows: [] }),
    ]);
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await backfillIpTarget({ query } as never, target, {
      dryRun: false,
      batchSize: 50,
      resumeFrom: 's-cursor',
    });
    consoleLogSpy.mockRestore();

    const selectCall = calls.find((c) => /SELECT id AS id/.test(c.sql));
    expect(selectCall).toBeDefined();
    expect(selectCall!.sql).toMatch(/id > \$2/);
    expect(selectCall!.params).toEqual([50, 's-cursor']);
  });

  it('counts failed rows but keeps going through the batch', async () => {
    const { query } = makeFakeClient([
      async () => ({ rowCount: 1 }),
      async () => ({ rowCount: 1 }),
      async () => ({
        rowCount: 2,
        rows: [
          { id: 's1', value: '8.8.8.8' },
          { id: 's2', value: '1.1.1.1' },
        ],
      }),
      async () => {
        throw new Error('deadlock');
      },
      async () => ({ rowCount: 1 }),
      async () => ({ rowCount: 0, rows: [] }),
    ]);
    const consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const stats = await backfillIpTarget({ query } as never, target, {
      dryRun: false,
      batchSize: 500,
      resumeFrom: null,
    });
    consoleErrSpy.mockRestore();
    consoleLogSpy.mockRestore();

    expect(stats.scanned).toBe(2);
    expect(stats.truncated).toBe(1);
    expect(stats.failed).toBe(1);
  });

  it('skips rows whose value is NULL', async () => {
    const { query, calls } = makeFakeClient([
      async () => ({ rowCount: 1 }),
      async () => ({ rowCount: 1 }),
      async () => ({
        rowCount: 1,
        rows: [{ id: 's1', value: null }],
      }),
      async () => ({ rowCount: 0, rows: [] }),
    ]);
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const stats = await backfillIpTarget({ query } as never, target, {
      dryRun: false,
      batchSize: 100,
      resumeFrom: null,
    });
    consoleLogSpy.mockRestore();

    expect(stats.scanned).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.truncated).toBe(0);
    expect(calls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });
});
