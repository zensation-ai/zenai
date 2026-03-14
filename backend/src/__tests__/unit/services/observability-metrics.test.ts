/**
 * Phase 61: Custom Business Metrics Tests
 *
 * Tests for all metric recording functions and label handling.
 */

// Mock OpenTelemetry API
const mockCreateCounter = jest.fn().mockReturnValue({ add: jest.fn() });
const mockCreateHistogram = jest.fn().mockReturnValue({ record: jest.fn() });
const mockCreateUpDownCounter = jest.fn().mockReturnValue({ add: jest.fn() });

jest.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: jest.fn().mockReturnValue({
      createCounter: mockCreateCounter,
      createHistogram: mockCreateHistogram,
      createUpDownCounter: mockCreateUpDownCounter,
    }),
  },
}), { virtual: true });

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  initMetrics,
  recordTokenUsage,
  recordRagLatency,
  recordAgentDuration,
  recordToolCall,
  recordQueueJob,
  recordMemoryOp,
  getMetricSnapshots,
  getMetricsSummary,
  isMetricsEnabled,
  clearSnapshots,
} from '../../../services/observability/metrics';

describe('Business Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSnapshots();
  });

  describe('initMetrics', () => {
    it('should initialize metrics successfully', async () => {
      const result = await initMetrics();
      expect(result).toBe(true);
    });

    it('should return true on repeated initialization', async () => {
      const result = await initMetrics();
      expect(result).toBe(true);
    });

    it('should create all metric instruments', async () => {
      await initMetrics();
      expect(isMetricsEnabled()).toBe(true);
    });
  });

  describe('recordTokenUsage', () => {
    it('should record token usage without attributes', () => {
      recordTokenUsage(1500);
      const snapshots = getMetricSnapshots(10);
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      const lastSnap = snapshots[snapshots.length - 1];
      expect(lastSnap.name).toBe('ai.tokens.total');
      expect(lastSnap.value).toBe(1500);
    });

    it('should record token usage with model and operation', () => {
      recordTokenUsage(500, { model: 'claude-3', operation: 'chat' });
      const snapshots = getMetricSnapshots(10);
      const lastSnap = snapshots[snapshots.length - 1];
      expect(lastSnap.labels.model).toBe('claude-3');
      expect(lastSnap.labels.operation).toBe('chat');
    });
  });

  describe('recordRagLatency', () => {
    it('should record RAG latency', () => {
      recordRagLatency(150);
      const snapshots = getMetricSnapshots(10);
      const lastSnap = snapshots[snapshots.length - 1];
      expect(lastSnap.name).toBe('ai.rag.latency');
      expect(lastSnap.value).toBe(150);
      expect(lastSnap.type).toBe('histogram');
    });

    it('should record RAG latency with strategy and context', () => {
      recordRagLatency(200, { strategy: 'hyde', context: 'personal' });
      const snapshots = getMetricSnapshots(10);
      const lastSnap = snapshots[snapshots.length - 1];
      expect(lastSnap.labels.strategy).toBe('hyde');
      expect(lastSnap.labels.context).toBe('personal');
    });
  });

  describe('recordAgentDuration', () => {
    it('should record agent execution duration', () => {
      recordAgentDuration(5000);
      const snapshots = getMetricSnapshots(10);
      const lastSnap = snapshots[snapshots.length - 1];
      expect(lastSnap.name).toBe('ai.agent.duration');
      expect(lastSnap.value).toBe(5000);
    });

    it('should record agent duration with strategy and agent name', () => {
      recordAgentDuration(3000, { strategy: 'research_write', agent: 'researcher' });
      const snapshots = getMetricSnapshots(10);
      const lastSnap = snapshots[snapshots.length - 1];
      expect(lastSnap.labels.strategy).toBe('research_write');
      expect(lastSnap.labels.agent).toBe('researcher');
    });
  });

  describe('recordToolCall', () => {
    it('should record a tool invocation', () => {
      recordToolCall('web_search');
      const snapshots = getMetricSnapshots(10);
      const lastSnap = snapshots[snapshots.length - 1];
      expect(lastSnap.name).toBe('ai.tool.calls');
      expect(lastSnap.labels.tool).toBe('web_search');
    });

    it('should record tool call with status', () => {
      recordToolCall('execute_code', { status: 'success' });
      const snapshots = getMetricSnapshots(10);
      const lastSnap = snapshots[snapshots.length - 1];
      expect(lastSnap.labels.status).toBe('success');
    });
  });

  describe('recordQueueJob', () => {
    it('should record an enqueued job', () => {
      recordQueueJob('memory-consolidation', 'enqueued');
      const snapshots = getMetricSnapshots(10);
      const relevant = snapshots.filter(s => s.name === 'queue.jobs.total');
      expect(relevant.length).toBeGreaterThanOrEqual(1);
      expect(relevant[relevant.length - 1].labels.queue).toBe('memory-consolidation');
      expect(relevant[relevant.length - 1].labels.event).toBe('enqueued');
    });

    it('should record a completed job with duration', () => {
      recordQueueJob('rag-indexing', 'completed', 250);
      const snapshots = getMetricSnapshots(20);
      const durations = snapshots.filter(s => s.name === 'queue.jobs.duration');
      expect(durations.length).toBeGreaterThanOrEqual(1);
      expect(durations[durations.length - 1].value).toBe(250);
    });

    it('should record a failed job', () => {
      recordQueueJob('email-processing', 'failed', 100);
      const snapshots = getMetricSnapshots(20);
      const jobEvents = snapshots.filter(s => s.name === 'queue.jobs.total' && s.labels.event === 'failed');
      expect(jobEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('recordMemoryOp', () => {
    it('should record a memory operation', () => {
      recordMemoryOp('episodic', 'store');
      const snapshots = getMetricSnapshots(10);
      const lastSnap = snapshots[snapshots.length - 1];
      expect(lastSnap.name).toBe('memory.operations');
      expect(lastSnap.labels.layer).toBe('episodic');
      expect(lastSnap.labels.operation).toBe('store');
    });
  });

  describe('getMetricSnapshots', () => {
    it('should return limited snapshots', () => {
      for (let i = 0; i < 10; i++) {
        recordTokenUsage(100 * i);
      }
      const snapshots = getMetricSnapshots(5);
      expect(snapshots.length).toBe(5);
    });

    it('should return all snapshots when limit exceeds count', () => {
      clearSnapshots();
      recordTokenUsage(100);
      recordTokenUsage(200);
      const snapshots = getMetricSnapshots(100);
      expect(snapshots.length).toBe(2);
    });
  });

  describe('getMetricsSummary', () => {
    it('should return aggregated summary', () => {
      clearSnapshots();
      recordTokenUsage(100);
      recordTokenUsage(200);
      recordRagLatency(50);

      const summary = getMetricsSummary();
      expect(summary['ai.tokens.total']).toBeDefined();
      expect(summary['ai.tokens.total'].count).toBe(2);
      expect(summary['ai.tokens.total'].lastValue).toBe(200);
      expect(summary['ai.rag.latency']).toBeDefined();
      expect(summary['ai.rag.latency'].count).toBe(1);
    });
  });

  describe('clearSnapshots', () => {
    it('should clear all snapshots', () => {
      recordTokenUsage(100);
      expect(getMetricSnapshots(100).length).toBeGreaterThan(0);
      clearSnapshots();
      expect(getMetricSnapshots(100).length).toBe(0);
    });
  });
});
