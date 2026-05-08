/**
 * Extended Unit Tests for Database Context Utilities
 *
 * Covers untested paths: queryContext behavior, SEARCH_PATH_SQL mapping,
 * pool configuration, circuit breaker integration, health checks,
 * extension validation, pool stats, and queryPublic.
 */

// =============================================
// Mock storage — jest.mock hoists above all
// statements, so we must create fns inside the
// factory. We expose them via a require-able module.
// =============================================

const clientQueryFn = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const clientReleaseFn = jest.fn();
const poolConnectFn = jest.fn().mockResolvedValue({
  query: clientQueryFn,
  release: clientReleaseFn,
});
const poolEndFn = jest.fn().mockResolvedValue(undefined);
const poolQueryFn = jest.fn();
const poolOnFn = jest.fn();

// NOTE: jest.mock is hoisted, but the mock factory can reference
// variables declared with `const` in the same file AS LONG AS the
// variable names start with "mock" (Jest special-cases this) or
// we use jest.fn() inline.  We instead construct the pool object
// lazily inside mockImplementation to avoid the TDZ issue.
jest.mock('pg', () => {
  // These fns are created at mock-factory time (before module-scope runs).
  const _clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const _clientRelease = jest.fn();
  const _poolConnect = jest.fn().mockResolvedValue({
    query: _clientQuery,
    release: _clientRelease,
  });
  const _poolEnd = jest.fn().mockResolvedValue(undefined);
  const _poolQuery = jest.fn();
  const _poolOn = jest.fn();

  // Expose mocks on a well-known global for the test body to reference
  (global as any).__dbMocks = {
    clientQuery: _clientQuery,
    clientRelease: _clientRelease,
    poolConnect: _poolConnect,
    poolEnd: _poolEnd,
    poolQuery: _poolQuery,
    poolOn: _poolOn,
  };

  return {
    Pool: jest.fn().mockImplementation(() => ({
      query: _poolQuery,
      connect: _poolConnect,
      end: _poolEnd,
      on: _poolOn,
      totalCount: 3,
      idleCount: 2,
      waitingCount: 0,
    })),
  };
});

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../utils/request-context', () => ({
  getCurrentUserId: jest.fn().mockReturnValue(null),
  getCurrentRequestId: jest.fn().mockReturnValue('test-req-id'),
  getCurrentWorkspaceId: jest.fn().mockReturnValue(undefined),
  getCurrentContextSlug: jest.fn().mockReturnValue(undefined),
  getCurrentIsAdmin: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../utils/circuit-breaker', () => {
  return {
    CircuitBreaker: jest.fn().mockImplementation(() => ({
      execute: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
      getStats: jest.fn().mockReturnValue({
        name: 'database',
        state: 'CLOSED',
        failures: 0,
        successCount: 10,
        lastFailureAt: null,
        nextRetryAt: null,
      }),
    })),
    CircuitBreakerState: {
      CLOSED: 'CLOSED',
      OPEN: 'OPEN',
      HALF_OPEN: 'HALF_OPEN',
    },
  };
});

jest.mock('../../../config/timeouts', () => ({
  TIMEOUTS: {
    CIRCUIT_BREAKER_DB: 30000,
    DB_QUERY: 5000,
  },
}));

// =============================================
// Import after mocks
// =============================================

import {
  isValidContext,
  isValidUUID,
  queryContext,
  getPool,
  getPoolStats,
  getDbBreakerStats,
  getHealthCheckStatus,
  isPgTrgmAvailable,
  isPgVectorAvailable,
  queryPublic,
  closeAllPools,
  dbBreaker,
  AIContext,
} from '../../../utils/database-context';

import { getCurrentUserId } from '../../../utils/request-context';

// Grab mock references that were set inside the pg mock factory
const m = (global as any).__dbMocks as {
  clientQuery: jest.Mock;
  clientRelease: jest.Mock;
  poolConnect: jest.Mock;
  poolEnd: jest.Mock;
  poolQuery: jest.Mock;
  poolOn: jest.Mock;
};

// =============================================
// Tests
// =============================================

describe('Database Context Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    m.clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    m.poolConnect.mockResolvedValue({
      query: m.clientQuery,
      release: m.clientRelease,
    });
  });

  // ===========================================
  // isValidContext — extended coverage
  // ===========================================

  describe('isValidContext extended', () => {
    it('should validate "people" context', () => {
      expect(isValidContext('people')).toBe(true);
    });

    it('should validate "strategy" context', () => {
      expect(isValidContext('strategy')).toBe(true);
    });

    it('should validate "demo" context', () => {
      expect(isValidContext('demo')).toBe(true);
    });

    it('should reject SQL injection attempts in context', () => {
      expect(isValidContext("personal'; DROP TABLE ideas; --")).toBe(false);
      expect(isValidContext('personal OR 1=1')).toBe(false);
    });

    it('should reject context with null bytes', () => {
      expect(isValidContext('personal\0')).toBe(false);
    });
  });

  // ===========================================
  // isValidUUID — additional patterns
  // ===========================================

  describe('isValidUUID extended', () => {
    it('should validate all UUID versions (v1-v5)', () => {
      expect(isValidUUID('550e8400-e29b-11d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('550e8400-e29b-21d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('550e8400-e29b-51d4-a716-446655440000')).toBe(true);
    });

    it('should reject nil UUID (all zeros, version 0)', () => {
      expect(isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(false);
    });

    it('should reject UUID with extra hyphens', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-4466-55440000')).toBe(false);
    });

    it('should reject UUID with braces/brackets', () => {
      expect(isValidUUID('{550e8400-e29b-41d4-a716-446655440000}')).toBe(false);
      expect(isValidUUID('[550e8400-e29b-41d4-a716-446655440000]')).toBe(false);
    });

    it('should reject UUID with spaces', () => {
      expect(isValidUUID(' 550e8400-e29b-41d4-a716-446655440000')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000 ')).toBe(false);
    });
  });

  // ===========================================
  // queryContext — schema isolation & behavior
  // ===========================================

  describe('queryContext', () => {
    it('should execute query with correct search_path for operations', async () => {
      await queryContext('operations', 'SELECT 1');
      expect(m.clientQuery).toHaveBeenCalledWith('SET search_path TO operations, public');
    });

    it('should execute query with correct search_path for finance', async () => {
      await queryContext('finance', 'SELECT * FROM ideas');
      expect(m.clientQuery).toHaveBeenCalledWith('SET search_path TO finance, public');
    });

    it('should execute query with correct search_path for people', async () => {
      await queryContext('people', 'SELECT * FROM ideas');
      expect(m.clientQuery).toHaveBeenCalledWith('SET search_path TO people, public');
    });

    it('should execute query with correct search_path for strategy', async () => {
      await queryContext('strategy', 'SELECT * FROM ideas');
      expect(m.clientQuery).toHaveBeenCalledWith('SET search_path TO strategy, public');
    });

    it('should execute query with correct search_path for demo', async () => {
      await queryContext('demo', 'SELECT * FROM ideas');
      expect(m.clientQuery).toHaveBeenCalledWith('SET search_path TO demo, public');
    });

    it('should throw on invalid context', async () => {
      await expect(
        queryContext('hacked' as AIContext, 'SELECT 1')
      ).rejects.toThrow('Invalid context: hacked');
    });

    it('should pass query parameters correctly', async () => {
      await queryContext('operations', 'SELECT * FROM ideas WHERE id = $1', ['test-id']);
      expect(m.clientQuery).toHaveBeenCalledWith(
        'SELECT * FROM ideas WHERE id = $1',
        ['test-id']
      );
    });

    it('should release client after successful query', async () => {
      await queryContext('operations', 'SELECT 1');
      expect(m.clientRelease).toHaveBeenCalled();
    });

    it('should release client after failed query', async () => {
      m.clientQuery
        .mockResolvedValueOnce(undefined) // search_path SET
        .mockRejectedValueOnce(new Error('Query failed'));

      await expect(queryContext('operations', 'SELECT bad')).rejects.toThrow('Query failed');
      expect(m.clientRelease).toHaveBeenCalled();
    });

    it('should set user ID config when getCurrentUserId returns a value', async () => {
      // Sprint 1.3: set_config uses session-level (false), cleaned via DISCARD ALL
      // before pool.release() to prevent GUC leaks across pool-recycled clients.
      (getCurrentUserId as jest.Mock).mockReturnValueOnce('user-123');
      await queryContext('operations', 'SELECT 1');
      expect(m.clientQuery).toHaveBeenCalledWith(
        "SELECT set_config('app.current_user_id', $1, false)",
        ['user-123']
      );
    });

    it('should bypass circuit breaker for health probes (SELECT 1)', async () => {
      await queryContext('operations', 'SELECT 1');
      expect(dbBreaker.execute).not.toHaveBeenCalled();
    });

    it('should bypass circuit breaker when bypassBreaker option is true', async () => {
      await queryContext('operations', 'SELECT * FROM ideas', undefined, { bypassBreaker: true });
      expect(dbBreaker.execute).not.toHaveBeenCalled();
    });

    it('should use circuit breaker for normal queries', async () => {
      await queryContext('operations', 'SELECT * FROM ideas');
      expect(dbBreaker.execute).toHaveBeenCalled();
    });
  });

  // ===========================================
  // getPool
  // ===========================================

  describe('getPool', () => {
    it('should return a pool for each valid context', () => {
      const contexts: AIContext[] = ['operations', 'finance', 'people', 'strategy', 'demo'];
      for (const ctx of contexts) {
        const pool = getPool(ctx);
        expect(pool).toBeDefined();
        expect(typeof pool.connect).toBe('function');
      }
    });

    it('should return the same shared pool for all contexts', () => {
      const personalPool = getPool('operations');
      const workPool = getPool('finance');
      expect(personalPool).toBe(workPool);
    });
  });

  // ===========================================
  // getPoolStats
  // ===========================================

  describe('getPoolStats', () => {
    it('should return stats for all five contexts', () => {
      const stats = getPoolStats();
      expect(stats.contexts).toHaveProperty('operations');
      expect(stats.contexts).toHaveProperty('finance');
      expect(stats.contexts).toHaveProperty('people');
      expect(stats.contexts).toHaveProperty('strategy');
      expect(stats.contexts).toHaveProperty('demo');
    });

    it('should include pool metrics with correct shape', () => {
      const stats = getPoolStats();
      expect(stats.pool).toHaveProperty('totalCount');
      expect(stats.pool).toHaveProperty('idleCount');
      expect(stats.pool).toHaveProperty('activeCount');
      expect(stats.pool).toHaveProperty('waitingCount');
      expect(stats.pool).toHaveProperty('maxSize');
    });

    it('should include event counters', () => {
      const stats = getPoolStats();
      expect(stats.events).toHaveProperty('connects');
      expect(stats.events).toHaveProperty('acquires');
      expect(stats.events).toHaveProperty('removes');
      expect(stats.events).toHaveProperty('errors');
    });

    it('should return numeric values for all context stats', () => {
      const stats = getPoolStats();
      for (const ctx of ['operations', 'finance', 'people', 'strategy', 'demo'] as AIContext[]) {
        expect(typeof stats.contexts[ctx].queries).toBe('number');
        expect(typeof stats.contexts[ctx].errors).toBe('number');
        expect(typeof stats.contexts[ctx].slowQueries).toBe('number');
      }
    });
  });

  // ===========================================
  // getDbBreakerStats
  // ===========================================

  describe('getDbBreakerStats', () => {
    it('should return circuit breaker statistics', () => {
      const stats = getDbBreakerStats();
      expect(stats).toHaveProperty('name', 'database');
      expect(stats).toHaveProperty('state', 'CLOSED');
      expect(stats).toHaveProperty('failures');
      expect(stats).toHaveProperty('successCount');
    });
  });

  // ===========================================
  // getHealthCheckStatus
  // ===========================================

  describe('getHealthCheckStatus', () => {
    it('should report healthy when no failures', () => {
      const status = getHealthCheckStatus();
      expect(status.isHealthy).toBe(true);
      expect(status.consecutiveFailures).toBe(0);
    });
  });

  // ===========================================
  // Extension availability (uncached state)
  // ===========================================

  describe('extension availability', () => {
    it('isPgTrgmAvailable returns false when cache is empty', () => {
      expect(isPgTrgmAvailable()).toBe(false);
    });

    it('isPgVectorAvailable returns false when cache is empty', () => {
      expect(isPgVectorAvailable()).toBe(false);
    });
  });

  // ===========================================
  // closeAllPools
  // ===========================================

  describe('closeAllPools', () => {
    it('should call pool.end()', async () => {
      await closeAllPools();
      expect(m.poolEnd).toHaveBeenCalled();
    });

    it('should propagate errors from pool.end()', async () => {
      m.poolEnd.mockRejectedValueOnce(new Error('close failed'));
      await expect(closeAllPools()).rejects.toThrow('close failed');
    });
  });

  // ===========================================
  // queryPublic
  // ===========================================

  describe('queryPublic', () => {
    it('should set search_path to public', async () => {
      await queryPublic('SELECT * FROM api_keys');
      expect(m.clientQuery).toHaveBeenCalledWith('SET search_path TO public');
    });

    it('should pass parameters through', async () => {
      await queryPublic('SELECT * FROM api_keys WHERE id = $1', ['key-1']);
      expect(m.clientQuery).toHaveBeenCalledWith(
        'SELECT * FROM api_keys WHERE id = $1',
        ['key-1']
      );
    });

    it('should release client after success', async () => {
      await queryPublic('SELECT 1');
      expect(m.clientRelease).toHaveBeenCalled();
    });

    it('should release client after failure', async () => {
      m.clientQuery
        .mockResolvedValueOnce(undefined) // SET search_path
        .mockRejectedValueOnce(new Error('fail'));

      await expect(queryPublic('SELECT bad')).rejects.toThrow('fail');
      expect(m.clientRelease).toHaveBeenCalled();
    });

    it('should bypass circuit breaker for health probes', async () => {
      await queryPublic('SELECT 1');
      expect(dbBreaker.execute).not.toHaveBeenCalled();
    });
  });
});
