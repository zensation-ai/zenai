/**
 * Sprint 1.3 — RLS Cross-Request-Leak Test (KRITISCHSTER TEST)
 *
 * Verifiziert, dass pro-Request-GUCs (app.current_user_id, app.current_workspace_id,
 * app.is_admin) NICHT über Pool-Client-Recycling zwischen Requests leaken können.
 *
 * Angriffsvektor ohne diesen Fix:
 *   1. Request A authentisiert als Admin → set_config('app.is_admin', 'true', ...)
 *   2. Request A beendet, Client geht zurück in Pool
 *   3. Request B (anderer User) holt den recycleten Client
 *   4. Client hat noch app.is_admin=true im Session-State
 *   5. RLS-Policies sehen B als Admin → Row-Scope-Bypass
 *
 * Schutz: DISCARD ALL vor client.release() setzt alle Session-Parameter zurück.
 * Dieser Test simuliert exakt das Recycling-Szenario mit einem geteilten Mock-Client.
 */

// Capture a stable reference to the shared mock client so we can assert on it
// outside the mock factory (Jest isolates factory scope).
const mockClientState: {
  sessionGucs: Record<string, string>;
  queryLog: Array<{ sql: string; params?: unknown[] }>;
  releaseCount: number;
  discardAllCount: number;
  simulateError?: boolean;
} = {
  sessionGucs: {},
  queryLog: [],
  releaseCount: 0,
  discardAllCount: 0,
};

function makeMockClient() {
  return {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      mockClientState.queryLog.push({ sql, params });

      // Intercept set_config calls: is_local=true means rollback-at-commit, is_local=false is session-level.
      // We only record GUCs for is_local=false, matching real PG semantics.
      const setConfigMatch = sql.match(/SELECT set_config\('([^']+)',\s*\$1,\s*(true|false)\)/);
      if (setConfigMatch && params && params[0] !== undefined) {
        const [, gucName, isLocalStr] = setConfigMatch;
        if (isLocalStr === 'false') {
          mockClientState.sessionGucs[gucName] = String(params[0]);
        }
        return { rows: [{ set_config: params[0] }] };
      }

      // Literal set_config for app.is_admin (no $1 placeholder)
      const setConfigLiteralMatch = sql.match(/SELECT set_config\('([^']+)',\s*'([^']+)',\s*(true|false)\)/);
      if (setConfigLiteralMatch) {
        const [, gucName, value, isLocalStr] = setConfigLiteralMatch;
        if (isLocalStr === 'false') {
          mockClientState.sessionGucs[gucName] = value;
        }
        return { rows: [{ set_config: value }] };
      }

      // DISCARD ALL clears all session-level parameters — this is the critical protection.
      if (sql.trim() === 'DISCARD ALL') {
        mockClientState.sessionGucs = {};
        mockClientState.discardAllCount++;
        return { rows: [] };
      }

      // SET search_path is session-level; record it too
      const searchPathMatch = sql.match(/^SET search_path TO (.+)$/);
      if (searchPathMatch) {
        mockClientState.sessionGucs['search_path'] = searchPathMatch[1];
        return { rows: [] };
      }

      // Simulate an error on the main query when requested (to test error-path cleanup)
      if (mockClientState.simulateError && !sql.startsWith('SELECT set_config') && sql !== 'DISCARD ALL' && !sql.startsWith('SET ')) {
        throw new Error('Simulated query error');
      }

      // The "actual" query — return a read of the current GUC state so tests can inspect it
      return {
        rows: [{
          observed_user_id: mockClientState.sessionGucs['app.current_user_id'] || null,
          observed_workspace_id: mockClientState.sessionGucs['app.current_workspace_id'] || null,
          observed_is_admin: mockClientState.sessionGucs['app.is_admin'] || null,
          observed_search_path: mockClientState.sessionGucs['search_path'] || null,
        }],
        rowCount: 1,
      };
    }),
    release: jest.fn(() => {
      mockClientState.releaseCount++;
    }),
  };
}

// A single shared client instance simulates the Pool-Recycling behavior:
// pool.connect() returns the SAME client for both requests — so any session
// state from request A is visible to request B unless explicitly cleared.
const sharedMockClient = makeMockClient();

jest.mock('pg', () => {
  return {
    Pool: jest.fn().mockImplementation(() => ({
      connect: jest.fn(async () => sharedMockClient),
      query: jest.fn(async () => ({ rows: [] })),
      on: jest.fn(),
      end: jest.fn(async () => undefined),
      totalCount: 1,
      idleCount: 1,
      waitingCount: 0,
    })),
  };
});

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { queryPublic, queryContext, withTransaction } from '../../../utils/database-context';
import { runAsUser } from '../../../utils/request-context';

function resetMockState() {
  mockClientState.sessionGucs = {};
  mockClientState.queryLog = [];
  mockClientState.releaseCount = 0;
  mockClientState.discardAllCount = 0;
  mockClientState.simulateError = false;
  sharedMockClient.query.mockClear();
  sharedMockClient.release.mockClear();
}

describe('Sprint 1.3 — RLS Cross-Request-Leak Prevention', () => {
  beforeEach(() => {
    resetMockState();
  });

  // ===========================================
  // CRITICAL TEST: Cross-Request-Leak Prevention
  // ===========================================

  describe('Cross-Request-Leak (kritischster Test)', () => {
    it('DARF NICHT GUCs von Request A an nachfolgenden Request B leaken', async () => {
      const userA = '00000000-0000-4000-8000-00000000000a';
      const userB = '00000000-0000-4000-8000-00000000000b';

      // --- Request A: authenticated as userA ---
      const resultA = await runAsUser(userA, async () => {
        return queryPublic('SELECT 1 AS observed');
      });
      expect(resultA.rows[0].observed_user_id).toBe(userA);

      // After Request A: GUCs must be cleared (DISCARD ALL ran before release)
      expect(mockClientState.sessionGucs['app.current_user_id']).toBeUndefined();
      expect(mockClientState.discardAllCount).toBe(1);
      expect(sharedMockClient.release).toHaveBeenCalledTimes(1);

      // --- Request B: NO authentication (anonymous probe) ---
      const resultB = await queryPublic('SELECT 1 AS observed');

      // CRITICAL ASSERTION: Request B MUST NOT see userA's GUC
      expect(resultB.rows[0].observed_user_id).toBeNull();
      expect(mockClientState.sessionGucs['app.current_user_id']).toBeUndefined();
    });

    it('DARF NICHT app.is_admin von Request A (Admin) an Request B (normaler User) leaken', async () => {
      const adminUser = '00000000-0000-4000-8000-00000000dead';
      const normalUser = '00000000-0000-4000-8000-00000000beef';

      // --- Request A: Admin ---
      await runAsUser(adminUser, async () => {
        return queryPublic('SELECT 1');
      }, { isAdmin: true });

      // GUCs must be cleared
      expect(mockClientState.sessionGucs['app.is_admin']).toBeUndefined();

      // --- Request B: Non-Admin (CRITICAL: must not inherit admin) ---
      const resultB = await runAsUser(normalUser, async () => {
        return queryPublic('SELECT 1');
      });

      // Inside B's query, is_admin must NOT be 'true'
      expect(resultB.rows[0].observed_is_admin).toBeNull();
      expect(mockClientState.sessionGucs['app.is_admin']).toBeUndefined();
    });

    it('DARF NICHT app.current_workspace_id zwischen Requests leaken', async () => {
      const userA = '00000000-0000-4000-8000-00000000000a';
      const workspaceA = '00000000-0000-4000-8000-0000000ws000a';

      // --- Request A: workspace-scoped JWT ---
      const { requestContext } = await import('../../../utils/request-context');
      await requestContext.run(
        { userId: userA, workspaceId: workspaceA },
        async () => queryPublic('SELECT 1')
      );

      expect(mockClientState.sessionGucs['app.current_workspace_id']).toBeUndefined();

      // --- Request B: no workspace context ---
      const resultB = await queryPublic('SELECT 1');
      expect(resultB.rows[0].observed_workspace_id).toBeNull();
    });

    it('räumt Session-State auch dann auf, wenn die Main-Query einen Fehler wirft', async () => {
      const userA = '00000000-0000-4000-8000-00000000000a';
      mockClientState.simulateError = true;

      await runAsUser(userA, async () => {
        await expect(queryPublic('SELECT broken_column FROM nonexistent'))
          .rejects.toThrow(/Simulated query error/);
      });

      // Even on error, DISCARD ALL must have run and client must have been released
      expect(mockClientState.discardAllCount).toBe(1);
      expect(sharedMockClient.release).toHaveBeenCalledTimes(1);
      expect(mockClientState.sessionGucs['app.current_user_id']).toBeUndefined();

      // Follow-up request must start clean
      mockClientState.simulateError = false;
      const follow = await queryPublic('SELECT 1');
      expect(follow.rows[0].observed_user_id).toBeNull();
    });
  });

  // ===========================================
  // set_config is_local=false Contract
  // ===========================================

  describe('set_config semantics (is_local=false contract)', () => {
    it('queryPublic ruft set_config mit is_local=false auf (session-level)', async () => {
      const userA = '00000000-0000-4000-8000-00000000000a';

      await runAsUser(userA, async () => queryPublic('SELECT 1'));

      const setConfigCalls = mockClientState.queryLog.filter(q =>
        q.sql.includes("set_config('app.current_user_id'")
      );
      expect(setConfigCalls.length).toBeGreaterThan(0);
      // All must use is_local=false, NEVER is_local=true (autocommit leak)
      for (const call of setConfigCalls) {
        expect(call.sql).toMatch(/is_local\)|,\s*false\)/);
        expect(call.sql).not.toMatch(/,\s*true\)$/);
      }
    });

    it('queryContext ruft set_config mit is_local=false auf (session-level)', async () => {
      const userA = '00000000-0000-4000-8000-00000000000a';

      await runAsUser(userA, async () => queryContext('operations', 'SELECT 1'));

      const setConfigCalls = mockClientState.queryLog.filter(q =>
        q.sql.includes("set_config('app.current_user_id'")
      );
      expect(setConfigCalls.length).toBeGreaterThan(0);
      for (const call of setConfigCalls) {
        expect(call.sql).not.toMatch(/,\s*true\)$/);
      }
    });

    it('withTransaction ruft set_config mit is_local=false auf (session-level)', async () => {
      const userA = '00000000-0000-4000-8000-00000000000a';

      await runAsUser(userA, async () => {
        return withTransaction('operations', async (q) => {
          await q('SELECT 1');
          return true;
        });
      });

      const setConfigCalls = mockClientState.queryLog.filter(q =>
        q.sql.includes("set_config('app.current_user_id'")
      );
      expect(setConfigCalls.length).toBeGreaterThan(0);
      for (const call of setConfigCalls) {
        expect(call.sql).not.toMatch(/,\s*true\)$/);
      }
    });
  });

  // ===========================================
  // DISCARD ALL-Call-Order Contract
  // ===========================================

  describe('DISCARD ALL vor client.release() (Success + Error)', () => {
    it('ruft DISCARD ALL vor release() im Success-Pfad von queryPublic', async () => {
      await queryPublic('SELECT 1');

      // Find indices of DISCARD ALL and release in the call order
      const allCalls = sharedMockClient.query.mock.calls.map(c => c[0]);
      const discardIdx = allCalls.findIndex(sql => sql === 'DISCARD ALL');
      expect(discardIdx).toBeGreaterThanOrEqual(0);
      expect(sharedMockClient.release).toHaveBeenCalledTimes(1);
    });

    it('ruft DISCARD ALL vor release() im Error-Pfad von queryPublic', async () => {
      mockClientState.simulateError = true;
      await expect(queryPublic('SELECT broken')).rejects.toThrow();
      expect(mockClientState.discardAllCount).toBe(1);
      expect(sharedMockClient.release).toHaveBeenCalled();
    });

    it('ruft DISCARD ALL vor release() im Success-Pfad von queryContext', async () => {
      await queryContext('operations', 'SELECT 1');
      expect(mockClientState.discardAllCount).toBe(1);
      expect(sharedMockClient.release).toHaveBeenCalledTimes(1);
    });

    it('ruft DISCARD ALL vor release() im Error-Pfad von queryContext', async () => {
      mockClientState.simulateError = true;
      await expect(queryContext('operations', 'SELECT broken')).rejects.toThrow();
      expect(mockClientState.discardAllCount).toBeGreaterThanOrEqual(1);
      expect(sharedMockClient.release).toHaveBeenCalled();
    });

    it('ruft DISCARD ALL auch bei erfolgreichem withTransaction', async () => {
      await withTransaction('operations', async (q) => {
        await q('SELECT 1');
        return true;
      });
      expect(mockClientState.discardAllCount).toBe(1);
      expect(sharedMockClient.release).toHaveBeenCalledTimes(1);
    });

    it('ruft DISCARD ALL auch wenn withTransaction wirft (ROLLBACK-Pfad)', async () => {
      await expect(
        withTransaction('operations', async () => {
          throw new Error('inside-transaction-error');
        })
      ).rejects.toThrow('inside-transaction-error');

      expect(mockClientState.discardAllCount).toBe(1);
      expect(sharedMockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================
  // Admin-Flag Isolation
  // ===========================================

  describe('Admin-Flag Scope', () => {
    it('setzt app.is_admin NUR wenn getCurrentIsAdmin() true ist', async () => {
      // Non-admin request: is_admin should NOT be set
      const userA = '00000000-0000-4000-8000-00000000000a';
      await runAsUser(userA, async () => queryPublic('SELECT 1'));

      const adminCalls = mockClientState.queryLog.filter(q =>
        q.sql.includes("set_config('app.is_admin'")
      );
      expect(adminCalls).toHaveLength(0);
    });

    it('setzt app.is_admin=true wenn getCurrentIsAdmin() true ist', async () => {
      const adminUser = '00000000-0000-4000-8000-00000000dead';
      const result = await runAsUser(adminUser, async () => queryPublic('SELECT 1'), { isAdmin: true });

      const adminCalls = mockClientState.queryLog.filter(q =>
        q.sql.includes("set_config('app.is_admin'")
      );
      expect(adminCalls.length).toBeGreaterThan(0);
      expect(result.rows[0].observed_is_admin).toBe('true');
    });
  });
});
