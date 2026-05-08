/**
 * Integration tests for the Alex Chen demo endpoints.
 *
 *   POST   /api/demo/seed    — seed demo data (write scope)
 *   GET    /api/demo/status  — current row counts (read scope)
 *   DELETE /api/demo/reset   — clear demo data (write scope)
 */

import express, { Express } from 'express';
import request from 'supertest';

// --- Auth + logger + user-context mocks (BEFORE imports) -------------------

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// --- Service mocks ---------------------------------------------------------

const mockSeed = jest.fn();
const mockClear = jest.fn();
const mockCount = jest.fn();

jest.mock('../../services/demo/alex-chen-seed', () => ({
  seedAlexChenData: (...args: unknown[]) => mockSeed(...args),
  clearAlexChenData: (...args: unknown[]) => mockClear(...args),
  countAlexChenData: (...args: unknown[]) => mockCount(...args),
}));

// Leave the real persona constants — they're pure data, no side effects.
import { ALEX_DEMO_SUMMARY, ALEX_USER_ID } from '../../services/demo/alex-chen-data';
import { demoRouter } from '../../routes/demo';
import { errorHandler } from '../../middleware/errorHandler';

describe('Demo API (Alex Chen persona)', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', demoRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------------
  // POST /api/demo/seed
  // ------------------------------------------------------------------------

  describe('POST /api/demo/seed', () => {
    it('seeds demo data and returns the summary', async () => {
      mockSeed.mockResolvedValueOnce(ALEX_DEMO_SUMMARY);

      const res = await request(app).post('/api/demo/seed');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        summary: expect.objectContaining({ persona: ALEX_DEMO_SUMMARY.persona }),
        message: expect.stringContaining('seeded'),
      });
      expect(mockSeed).toHaveBeenCalledTimes(1);
    });

    it('returns 500 with sanitized error when seeding fails', async () => {
      mockSeed.mockRejectedValueOnce(new Error('db offline'));

      const res = await request(app).post('/api/demo/seed');

      expect(res.status).toBe(500);
      expect(res.body.success).not.toBe(true);
    });
  });

  // ------------------------------------------------------------------------
  // GET /api/demo/status
  // ------------------------------------------------------------------------

  describe('GET /api/demo/status', () => {
    it('reports seeded=true when any count > 0', async () => {
      mockCount.mockResolvedValueOnce({
        coreBlocks: 4,
        topics: 10,
        ideas: 30,
        facts: 150,
        episodes: 200,
      });

      const res = await request(app).get('/api/demo/status');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        persona: ALEX_DEMO_SUMMARY.persona,
        userId: ALEX_USER_ID,
        seeded: true,
        counts: {
          coreBlocks: 4,
          topics: 10,
          ideas: 30,
          facts: 150,
          episodes: 200,
        },
        expected: {
          coreBlocks: ALEX_DEMO_SUMMARY.coreBlocks,
          topics: ALEX_DEMO_SUMMARY.topics,
          ideas: ALEX_DEMO_SUMMARY.ideas,
          facts: ALEX_DEMO_SUMMARY.facts,
          episodes: ALEX_DEMO_SUMMARY.episodes,
        },
      });
    });

    it('reports seeded=false when every count is zero', async () => {
      mockCount.mockResolvedValueOnce({
        coreBlocks: 0,
        topics: 0,
        ideas: 0,
        facts: 0,
        episodes: 0,
      });

      const res = await request(app).get('/api/demo/status');

      expect(res.status).toBe(200);
      expect(res.body.seeded).toBe(false);
      expect(res.body.counts).toEqual({
        coreBlocks: 0,
        topics: 0,
        ideas: 0,
        facts: 0,
        episodes: 0,
      });
    });

    it('propagates errors as 500 from the count service', async () => {
      mockCount.mockRejectedValueOnce(new Error('schema missing'));

      const res = await request(app).get('/api/demo/status');

      expect(res.status).toBe(500);
    });
  });

  // ------------------------------------------------------------------------
  // DELETE /api/demo/reset
  // ------------------------------------------------------------------------

  describe('DELETE /api/demo/reset', () => {
    it('clears demo data and returns cleared=true', async () => {
      mockClear.mockResolvedValueOnce(undefined);

      const res = await request(app).delete('/api/demo/reset');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        cleared: true,
        message: expect.stringContaining('cleared'),
      });
      expect(mockClear).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when the clear operation fails', async () => {
      mockClear.mockRejectedValueOnce(new Error('permission denied'));

      const res = await request(app).delete('/api/demo/reset');

      expect(res.status).toBe(500);
    });
  });
});
