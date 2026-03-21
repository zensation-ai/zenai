/**
 * Interactions Route Tests
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockTrackInteraction = jest.fn();
const mockTrackView = jest.fn();
const mockTrackSearchClick = jest.fn();
const mockTrackFeedback = jest.fn();
const mockRecordCorrection = jest.fn();
const mockGetIdeaCorrectionHistory = jest.fn();
const mockGetOrCreateSession = jest.fn();
const mockEndSession = jest.fn();
const mockGetInteractionStats = jest.fn();
const mockGetCorrectionStatsByField = jest.fn();
const mockGetActivePatterns = jest.fn();
const mockSuggestCorrectionFromPatterns = jest.fn();

jest.mock('../../../services/interaction-tracking', () => ({
  trackInteraction: (...args: unknown[]) => mockTrackInteraction(...args),
  trackView: (...args: unknown[]) => mockTrackView(...args),
  trackSearchClick: (...args: unknown[]) => mockTrackSearchClick(...args),
  trackFeedback: (...args: unknown[]) => mockTrackFeedback(...args),
  recordCorrection: (...args: unknown[]) => mockRecordCorrection(...args),
  getIdeaCorrectionHistory: (...args: unknown[]) => mockGetIdeaCorrectionHistory(...args),
  getOrCreateSession: (...args: unknown[]) => mockGetOrCreateSession(...args),
  endSession: (...args: unknown[]) => mockEndSession(...args),
  getInteractionStats: (...args: unknown[]) => mockGetInteractionStats(...args),
  getCorrectionStatsByField: (...args: unknown[]) => mockGetCorrectionStatsByField(...args),
  getActivePatterns: (...args: unknown[]) => mockGetActivePatterns(...args),
  suggestCorrectionFromPatterns: (...args: unknown[]) => mockSuggestCorrectionFromPatterns(...args),
  EntityType: {},
  InteractionType: {},
  CorrectionField: {},
}));

import { interactionsRouter } from '../../../routes/interactions';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Interactions Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', interactionsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- Track Interaction ----

  describe('POST /api/:context/interactions', () => {
    it('should track an interaction successfully', async () => {
      mockTrackInteraction.mockResolvedValueOnce('int-1');

      const res = await request(app)
        .post('/api/personal/interactions')
        .send({
          entity_type: 'idea',
          entity_id: 'i1',
          interaction_type: 'view',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.interaction_id).toBe('int-1');
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/interactions')
        .send({ entity_type: 'idea', interaction_type: 'view' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid entity_type', async () => {
      const res = await request(app)
        .post('/api/personal/interactions')
        .send({ entity_type: 'nonexistent', interaction_type: 'view' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid interaction_type', async () => {
      const res = await request(app)
        .post('/api/personal/interactions')
        .send({ entity_type: 'idea', interaction_type: 'nonexistent' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when entity_type is missing', async () => {
      const res = await request(app)
        .post('/api/personal/interactions')
        .send({ interaction_type: 'view' });

      expect(res.status).toBe(400);
    });
  });

  // ---- Track View ----

  describe('POST /api/:context/interactions/view', () => {
    it('should track a view event', async () => {
      mockTrackView.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/personal/interactions/view')
        .send({ entity_type: 'idea', entity_id: 'i1', duration_ms: 5000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when entity_type is missing', async () => {
      const res = await request(app)
        .post('/api/personal/interactions/view')
        .send({ entity_id: 'i1' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when entity_id is missing', async () => {
      const res = await request(app)
        .post('/api/personal/interactions/view')
        .send({ entity_type: 'idea' });

      expect(res.status).toBe(400);
    });
  });

  // ---- Track Search Click ----

  describe('POST /api/:context/interactions/search-click', () => {
    it('should track a search click', async () => {
      mockTrackSearchClick.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/personal/interactions/search-click')
        .send({ query: 'test query', result_id: 'r1', position: 3 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when query is missing', async () => {
      const res = await request(app)
        .post('/api/personal/interactions/search-click')
        .send({ result_id: 'r1' });

      expect(res.status).toBe(400);
    });
  });

  // ---- Track Feedback ----

  describe('POST /api/:context/interactions/feedback', () => {
    it('should track positive feedback', async () => {
      mockTrackFeedback.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/personal/interactions/feedback')
        .send({
          entity_type: 'idea',
          entity_id: 'i1',
          is_positive: true,
          comment: 'Great idea!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/personal/interactions/feedback')
        .send({ entity_type: 'idea' });

      expect(res.status).toBe(400);
    });
  });

  // ---- Corrections ----

  describe('POST /api/:context/corrections', () => {
    it('should record a correction', async () => {
      mockRecordCorrection.mockResolvedValueOnce('corr-1');

      const res = await request(app)
        .post('/api/personal/corrections')
        .send({
          idea_id: 'i1',
          field: 'category',
          old_value: 'personal',
          new_value: 'technology',
        });

      expect(res.status).toBe(201);
      expect(res.body.correction_id).toBe('corr-1');
    });

    it('should return 400 for invalid field', async () => {
      const res = await request(app)
        .post('/api/personal/corrections')
        .send({
          idea_id: 'i1',
          field: 'invalid_field',
          old_value: 'a',
          new_value: 'b',
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 when required fields missing', async () => {
      const res = await request(app)
        .post('/api/personal/corrections')
        .send({ idea_id: 'i1' });

      expect(res.status).toBe(400);
    });
  });

  // ---- Correction History ----

  describe('GET /api/:context/corrections/idea/:ideaId', () => {
    it('should return correction history for an idea', async () => {
      mockGetIdeaCorrectionHistory.mockResolvedValueOnce([
        { id: 'c1', field: 'category', old_value: 'a', new_value: 'b' },
      ]);

      const res = await request(app)
        .get('/api/personal/corrections/idea/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(200);
      expect(res.body.corrections).toHaveLength(1);
      expect(res.body.count).toBe(1);
    });

    it('should return empty array for idea with no corrections', async () => {
      mockGetIdeaCorrectionHistory.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/personal/corrections/idea/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(200);
      expect(res.body.corrections).toHaveLength(0);
    });
  });

  // ---- Correction Suggestions ----

  describe('POST /api/:context/corrections/suggest', () => {
    it('should return correction suggestions', async () => {
      mockSuggestCorrectionFromPatterns.mockResolvedValueOnce([
        { field: 'category', suggested: 'technology', confidence: 0.8 },
      ]);

      const res = await request(app)
        .post('/api/personal/corrections/suggest')
        .send({ content: 'AI and machine learning project', current_values: {} });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when content is missing', async () => {
      const res = await request(app)
        .post('/api/personal/corrections/suggest')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
