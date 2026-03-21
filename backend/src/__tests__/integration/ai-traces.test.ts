/**
 * Integration Tests for AI Traces API
 *
 * Tests the AI observability trace routes:
 * - GET /api/observability/ai-traces/stats   - Token/cost aggregates
 * - GET /api/observability/ai-traces         - List recent traces
 * - GET /api/observability/ai-traces/:id     - Single trace with spans
 *
 * Phase 122 - Worker 2
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../utils/sql-helpers', () => ({
  escapeLike: jest.fn((s: string) => s),
}));

const mockQueryPublic = jest.fn();

jest.mock('../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
  queryContext: jest.fn(),
  isValidContext: jest.fn(() => true),
  AIContext: {},
}));

import { aiTracesRouter } from '../../routes/ai-traces';
import { errorHandler } from '../../middleware/errorHandler';

describe('AI Traces API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/observability', aiTracesRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // GET /api/observability/ai-traces/stats
  // ============================================================

  describe('GET /api/observability/ai-traces/stats', () => {
    it('should return aggregated stats', async () => {
      const dailyRows = [{ day: '2026-03-20', trace_count: '5', total_tokens: '1200', total_cost: '0.05', avg_duration_ms: 350 }];
      const modelRows = [{ model: 'claude-sonnet-4-20250514', generation_count: '10', total_input_tokens: '500', total_output_tokens: '700', total_cost: '0.03' }];
      const typeRows = [{ type: 'generation', span_count: '10', avg_duration_ms: 200 }];

      mockQueryPublic
        .mockResolvedValueOnce({ rows: dailyRows })
        .mockResolvedValueOnce({ rows: modelRows })
        .mockResolvedValueOnce({ rows: typeRows });

      const res = await request(app)
        .get('/api/observability/ai-traces/stats')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.days).toBe(7);
      expect(res.body.data.daily).toEqual(dailyRows);
      expect(res.body.data.byModel).toEqual(modelRows);
      expect(res.body.data.bySpanType).toEqual(typeRows);
    });

    it('should accept custom days parameter', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/observability/ai-traces/stats?days=30')
        .expect(200);

      expect(res.body.data.days).toBe(30);
    });

    it('should cap days at 90', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/observability/ai-traces/stats?days=999')
        .expect(200);

      expect(res.body.data.days).toBe(90);
    });

    it('should return empty arrays when no data', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/observability/ai-traces/stats')
        .expect(200);

      expect(res.body.data.daily).toEqual([]);
      expect(res.body.data.byModel).toEqual([]);
      expect(res.body.data.bySpanType).toEqual([]);
    });
  });

  // ============================================================
  // GET /api/observability/ai-traces
  // ============================================================

  describe('GET /api/observability/ai-traces', () => {
    it('should list traces with pagination', async () => {
      const traces = [
        { id: VALID_UUID, name: 'chat', start_time: '2026-03-20T10:00:00Z', total_tokens: 500, span_count: '3' },
      ];
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: traces });

      const res = await request(app)
        .get('/api/observability/ai-traces')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.traces).toEqual(traces);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.limit).toBe(50);
      expect(res.body.data.offset).toBe(0);
    });

    it('should filter by name', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/observability/ai-traces?name=chat')
        .expect(200);

      const countSql = mockQueryPublic.mock.calls[0][0] as string;
      expect(countSql).toContain('ILIKE');
    });

    it('should respect limit and offset', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ total: '50' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/observability/ai-traces?limit=10&offset=20')
        .expect(200);

      expect(res.body.data.limit).toBe(10);
      expect(res.body.data.offset).toBe(20);
    });

    it('should cap limit at 200', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/observability/ai-traces?limit=999')
        .expect(200);

      expect(res.body.data.limit).toBe(200);
    });
  });

  // ============================================================
  // GET /api/observability/ai-traces/:id
  // ============================================================

  describe('GET /api/observability/ai-traces/:id', () => {
    it('should return trace with spans', async () => {
      const trace = { id: VALID_UUID, name: 'chat', total_tokens: 500 };
      const spans = [
        { id: '22222222-2222-2222-2222-222222222222', trace_id: VALID_UUID, name: 'llm', type: 'generation' },
      ];
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [trace] })
        .mockResolvedValueOnce({ rows: spans });

      const res = await request(app)
        .get(`/api/observability/ai-traces/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.trace).toEqual(trace);
      expect(res.body.data.spans).toEqual(spans);
    });

    it('should return 404 for non-existent trace', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`/api/observability/ai-traces/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Trace not found');
    });
  });
});
