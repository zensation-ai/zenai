/**
 * Phase 67.3: Connection Pool Monitoring Tests
 *
 * Tests for pool event tracking, metrics recording, and stats reporting.
 */

jest.mock('pg', () => {
  // All state must be inside the factory (hoisted above const declarations)
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const poolObj = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event]) { listeners[event] = []; }
      listeners[event].push(handler);
      return poolObj;
    }),
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  };
  return {
    Pool: jest.fn().mockImplementation(() => poolObj),
    __testListeners: listeners,
    __testPool: poolObj,
  };
});

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../utils/request-context', () => ({
  getCurrentUserId: jest.fn().mockReturnValue(null),
}));

jest.mock('@opentelemetry/api', () => {
  const addFn = jest.fn();
  const recordFn = jest.fn();
  return {
    metrics: {
      getMeter: jest.fn().mockReturnValue({
        createCounter: jest.fn().mockReturnValue({ add: addFn }),
        createHistogram: jest.fn().mockReturnValue({ record: recordFn }),
        createUpDownCounter: jest.fn().mockReturnValue({ add: addFn }),
      }),
    },
    __testAdd: addFn,
  };
}, { virtual: true });

jest.mock('../../../services/observability/sentry', () => ({
  initSentry: jest.fn(),
  captureException: jest.fn(),
  setContext: jest.fn(),
}));

import {
  recordPoolMetric,
  getMetricSnapshots,
  clearSnapshots,
  initMetrics,
} from '../../../services/observability/metrics';

import {
  getPoolStats,
} from '../../../utils/database-context';
import type { PoolStatsResult } from '../../../utils/database-context';

// Access test helpers from mocks
 
const { __testListeners: poolListeners } = require('pg') as {
  __testListeners: Record<string, Array<(...args: unknown[]) => void>>;
};
 
const { __testAdd: mockAddFn } = require('@opentelemetry/api') as { __testAdd: jest.Mock };

describe('Pool Monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSnapshots();
  });

  describe('recordPoolMetric', () => {
    it('should record acquire event as snapshot', () => {
      recordPoolMetric('acquire');
      const snapshots = getMetricSnapshots(10);
      const poolSnaps = snapshots.filter(s => s.name === 'db.pool.active');
      expect(poolSnaps.length).toBe(1);
      expect(poolSnaps[0].value).toBe(1);
      expect(poolSnaps[0].labels.event).toBe('acquire');
    });

    it('should record release event with negative value', () => {
      recordPoolMetric('release');
      const snapshots = getMetricSnapshots(10);
      const poolSnaps = snapshots.filter(s => s.name === 'db.pool.active');
      expect(poolSnaps.length).toBe(1);
      expect(poolSnaps[0].value).toBe(-1);
      expect(poolSnaps[0].labels.event).toBe('release');
    });

    it('should record error event as counter', () => {
      recordPoolMetric('error');
      const snapshots = getMetricSnapshots(10);
      const errorSnaps = snapshots.filter(s => s.name === 'db.pool.errors');
      expect(errorSnaps.length).toBe(1);
      expect(errorSnaps[0].type).toBe('counter');
      expect(errorSnaps[0].value).toBe(1);
    });

    it('should record waiting event as gauge', () => {
      recordPoolMetric('waiting');
      const snapshots = getMetricSnapshots(10);
      const waitSnaps = snapshots.filter(s => s.name === 'db.pool.waiting');
      expect(waitSnaps.length).toBe(1);
      expect(waitSnaps[0].type).toBe('gauge');
      expect(waitSnaps[0].value).toBe(1);
    });

    it('should invoke OTel instruments after initialization', async () => {
      await initMetrics();
      mockAddFn.mockClear();

      recordPoolMetric('acquire');
      expect(mockAddFn).toHaveBeenCalledWith(1, { event: 'acquire' });

      recordPoolMetric('error');
      expect(mockAddFn).toHaveBeenCalledWith(1, { event: 'error' });
    });
  });

  describe('getPoolStats', () => {
    it('should return structured pool statistics', () => {
      const stats: PoolStatsResult = getPoolStats();

      // Pool section
      expect(stats.pool).toBeDefined();
      expect(stats.pool.totalCount).toBe(5);
      expect(stats.pool.idleCount).toBe(3);
      expect(stats.pool.activeCount).toBe(2);
      expect(stats.pool.waitingCount).toBe(0);
      expect(typeof stats.pool.maxSize).toBe('number');

      // Events section
      expect(stats.events).toBeDefined();
      expect(typeof stats.events.connects).toBe('number');
      expect(typeof stats.events.acquires).toBe('number');
      expect(typeof stats.events.removes).toBe('number');
      expect(typeof stats.events.errors).toBe('number');

      // Contexts section
      expect(stats.contexts).toBeDefined();
      expect(stats.contexts.personal).toBeDefined();
      expect(stats.contexts.work).toBeDefined();
      expect(stats.contexts.learning).toBeDefined();
      expect(stats.contexts.creative).toBeDefined();
    });

    it('should include per-context query counters', () => {
      const stats = getPoolStats();
      for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
        expect(stats.contexts[ctx]).toHaveProperty('queries');
        expect(stats.contexts[ctx]).toHaveProperty('errors');
        expect(stats.contexts[ctx]).toHaveProperty('slowQueries');
      }
    });

    it('should return activeCount as totalCount minus idleCount', () => {
      const stats = getPoolStats();
      expect(stats.pool.activeCount).toBe(stats.pool.totalCount - stats.pool.idleCount);
    });
  });

  describe('pool event listeners', () => {
    it('should register connect, acquire, remove, and error listeners', () => {
      expect(poolListeners['connect']).toBeDefined();
      expect(poolListeners['acquire']).toBeDefined();
      expect(poolListeners['remove']).toBeDefined();
      expect(poolListeners['error']).toBeDefined();
    });

    it('should increment counters when connect/acquire/remove events fire', () => {
      const statsBefore = getPoolStats();
      const connectsBefore = statsBefore.events.connects;
      const acquiresBefore = statsBefore.events.acquires;
      const removesBefore = statsBefore.events.removes;

      poolListeners['connect'].forEach(h => h());
      poolListeners['acquire'].forEach(h => h());
      poolListeners['remove'].forEach(h => h());

      const statsAfter = getPoolStats();
      expect(statsAfter.events.connects).toBe(connectsBefore + 1);
      expect(statsAfter.events.acquires).toBe(acquiresBefore + 1);
      expect(statsAfter.events.removes).toBe(removesBefore + 1);
    });

    it('should increment error counter when error event fires', () => {
      const statsBefore = getPoolStats();
      const errorsBefore = statsBefore.events.errors;

      poolListeners['error'].forEach(h => h(new Error('test pool error')));

      const statsAfter = getPoolStats();
      expect(statsAfter.events.errors).toBe(errorsBefore + 1);
    });
  });
});
