/**
 * Integration Tests for Smart Suggestions API
 *
 * Tests suggestion listing, dismiss, snooze, accept, and SSE stream.
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../middleware/validate-params', () => ({
  requireUUID: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockGetActiveSuggestions = jest.fn();
const mockDismissSuggestion = jest.fn();
const mockSnoozeSuggestion = jest.fn();
const mockAcceptSuggestion = jest.fn();

jest.mock('../../services/smart-suggestions', () => ({
  getActiveSuggestions: (...args: unknown[]) => mockGetActiveSuggestions(...args),
  dismissSuggestion: (...args: unknown[]) => mockDismissSuggestion(...args),
  snoozeSuggestion: (...args: unknown[]) => mockSnoozeSuggestion(...args),
  acceptSuggestion: (...args: unknown[]) => mockAcceptSuggestion(...args),
}));

import { smartSuggestionsRouter } from '../../routes/smart-suggestions';
import { errorHandler } from '../../middleware/errorHandler';

describe('Smart Suggestions API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', smartSuggestionsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSuggestion = {
    id: VALID_UUID,
    type: 'task_reminder',
    title: 'Review PR',
    description: 'You have a pending PR review',
    priority: 0.8,
    created_at: '2026-01-01',
  };

  // ============================================================
  // GET /:context/suggestions
  // ============================================================

  describe('GET /:context/suggestions', () => {
    it('should return active suggestions', async () => {
      mockGetActiveSuggestions.mockResolvedValueOnce([mockSuggestion]);

      const res = await request(app)
        .get('/api/personal/suggestions')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('task_reminder');
    });

    it('should respect limit parameter (capped at 10)', async () => {
      mockGetActiveSuggestions.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/personal/suggestions?limit=50')
        .expect(200);

      expect(mockGetActiveSuggestions).toHaveBeenCalledWith(
        'personal',
        '00000000-0000-0000-0000-000000000001',
        10 // capped
      );
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/invalid/suggestions')
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return empty array when no suggestions', async () => {
      mockGetActiveSuggestions.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/personal/suggestions')
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });
  });

  // ============================================================
  // POST /:context/suggestions/:id/dismiss
  // ============================================================

  describe('POST /:context/suggestions/:id/dismiss', () => {
    it('should dismiss a suggestion', async () => {
      mockDismissSuggestion.mockResolvedValueOnce(true);

      const res = await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/dismiss`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('dismissed');
    });

    it('should return 404 for non-existent suggestion', async () => {
      mockDismissSuggestion.mockResolvedValueOnce(false);

      await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/dismiss`)
        .expect(404);
    });
  });

  // ============================================================
  // POST /:context/suggestions/:id/snooze
  // ============================================================

  describe('POST /:context/suggestions/:id/snooze', () => {
    it('should snooze a suggestion for 1h', async () => {
      mockSnoozeSuggestion.mockResolvedValueOnce(true);

      const res = await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/snooze`)
        .send({ duration: '1h' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('1h');
    });

    it('should snooze for 4h', async () => {
      mockSnoozeSuggestion.mockResolvedValueOnce(true);

      const res = await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/snooze`)
        .send({ duration: '4h' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should snooze until tomorrow', async () => {
      mockSnoozeSuggestion.mockResolvedValueOnce(true);

      const res = await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/snooze`)
        .send({ duration: 'tomorrow' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reject invalid snooze duration', async () => {
      const res = await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/snooze`)
        .send({ duration: '2h' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject missing duration', async () => {
      const res = await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/snooze`)
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent suggestion', async () => {
      mockSnoozeSuggestion.mockResolvedValueOnce(false);

      await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/snooze`)
        .send({ duration: '1h' })
        .expect(404);
    });
  });

  // ============================================================
  // POST /:context/suggestions/:id/accept
  // ============================================================

  describe('POST /:context/suggestions/:id/accept', () => {
    it('should accept a suggestion', async () => {
      mockAcceptSuggestion.mockResolvedValueOnce(true);

      const res = await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/accept`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('accepted');
    });

    it('should return 404 for non-existent suggestion', async () => {
      mockAcceptSuggestion.mockResolvedValueOnce(false);

      await request(app)
        .post(`/api/personal/suggestions/${VALID_UUID}/accept`)
        .expect(404);
    });
  });
});
