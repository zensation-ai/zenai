/**
 * Drafts Route Tests
 */

import express from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

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

const mockGetDraftForIdea = jest.fn();
const mockGenerateProactiveDraft = jest.fn();
const mockMarkDraftViewed = jest.fn();
const mockSaveDraftFeedback = jest.fn();
const mockDiscardDraft = jest.fn();
const mockListDrafts = jest.fn();
const mockSubmitDetailedFeedback = jest.fn();
const mockRecordDraftCopy = jest.fn();
const mockGetFeedbackAnalytics = jest.fn();
const mockGetPatternEffectiveness = jest.fn();
const mockGetDraftsNeedingFeedback = jest.fn();
const mockGetDraftFeedbackHistory = jest.fn();
const mockGetLearningSuggestions = jest.fn();
const mockUpdateLearningSuggestion = jest.fn();
const mockQuickFeedback = jest.fn();
const mockDetectDraftNeed = jest.fn();

jest.mock('../../../services/draft-generation', () => ({
  getDraftForIdea: (...args: unknown[]) => mockGetDraftForIdea(...args),
  generateProactiveDraft: (...args: unknown[]) => mockGenerateProactiveDraft(...args),
  markDraftViewed: (...args: unknown[]) => mockMarkDraftViewed(...args),
  saveDraftFeedback: (...args: unknown[]) => mockSaveDraftFeedback(...args),
  discardDraft: (...args: unknown[]) => mockDiscardDraft(...args),
  listDrafts: (...args: unknown[]) => mockListDrafts(...args),
  submitDetailedFeedback: (...args: unknown[]) => mockSubmitDetailedFeedback(...args),
  recordDraftCopy: (...args: unknown[]) => mockRecordDraftCopy(...args),
  getFeedbackAnalytics: (...args: unknown[]) => mockGetFeedbackAnalytics(...args),
  getPatternEffectiveness: (...args: unknown[]) => mockGetPatternEffectiveness(...args),
  getDraftsNeedingFeedback: (...args: unknown[]) => mockGetDraftsNeedingFeedback(...args),
  getDraftFeedbackHistory: (...args: unknown[]) => mockGetDraftFeedbackHistory(...args),
  getLearningSuggestions: (...args: unknown[]) => mockGetLearningSuggestions(...args),
  updateLearningSuggestion: (...args: unknown[]) => mockUpdateLearningSuggestion(...args),
  quickFeedback: (...args: unknown[]) => mockQuickFeedback(...args),
  detectDraftNeed: (...args: unknown[]) => mockDetectDraftNeed(...args),
  DetailedFeedback: {},
}));

jest.mock('../../../services/claude', () => ({
  isClaudeAvailable: jest.fn(() => true),
}));

import { draftsRouter } from '../../../routes/drafts';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Drafts Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', draftsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/:context/ideas/:ideaId/draft', () => {
    it('should return a draft for an idea', async () => {
      mockGetDraftForIdea.mockResolvedValue({
        id: 'd1', ideaId: VALID_UUID, draftType: 'email', content: 'Hello', wordCount: 1, status: 'ready', generationTimeMs: 500,
      });
      mockMarkDraftViewed.mockResolvedValue(undefined);

      const res = await request(app).get(`/api/personal/ideas/${VALID_UUID}/draft`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.draft.draftType).toBe('email');
    });

    it('should return null draft when not found', async () => {
      mockGetDraftForIdea.mockResolvedValue(null);

      const res = await request(app).get(`/api/personal/ideas/${VALID_UUID}/draft`);

      expect(res.status).toBe(200);
      expect(res.body.draft).toBeNull();
    });
  });

  describe('GET /api/:context/drafts', () => {
    it('should list drafts', async () => {
      mockListDrafts.mockResolvedValue([
        { id: 'd1', ideaId: 'i1', draftType: 'email', content: 'Short content', wordCount: 2, status: 'ready' },
      ]);

      const res = await request(app).get('/api/personal/drafts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/drafts');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/:context/drafts/:draftId', () => {
    it('should discard a draft', async () => {
      mockDiscardDraft.mockResolvedValue(undefined);

      const res = await request(app).delete('/api/personal/drafts/d1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/:context/drafts/:draftId/feedback', () => {
    it('should save draft feedback', async () => {
      mockSaveDraftFeedback.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/api/personal/drafts/d1/feedback')
        .send({ rating: 4, feedback: 'Good draft' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid rating', async () => {
      const res = await request(app)
        .put('/api/personal/drafts/d1/feedback')
        .send({ rating: 10 });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/drafts/:draftId/feedback/quick', () => {
    it('should submit quick positive feedback', async () => {
      mockQuickFeedback.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/personal/drafts/d1/feedback/quick')
        .send({ isPositive: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject non-boolean isPositive', async () => {
      const res = await request(app)
        .post('/api/personal/drafts/d1/feedback/quick')
        .send({ isPositive: 'yes' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/drafts/analytics', () => {
    it('should return feedback analytics', async () => {
      mockGetFeedbackAnalytics.mockResolvedValue({ avgRating: 3.8, totalFeedback: 20 });

      const res = await request(app).get('/api/personal/drafts/analytics');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.analytics.avgRating).toBe(3.8);
    });
  });

  describe('POST /api/:context/drafts/debug-detect', () => {
    it('should detect draft need', async () => {
      mockDetectDraftNeed.mockResolvedValue({ detected: true, draftType: 'email', confidence: 0.9 });

      const res = await request(app)
        .post('/api/personal/drafts/debug-detect')
        .send({ text: 'Write an email to the team' });

      expect(res.status).toBe(200);
      expect(res.body.detection.detected).toBe(true);
    });

    it('should reject missing text', async () => {
      const res = await request(app)
        .post('/api/personal/drafts/debug-detect')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
