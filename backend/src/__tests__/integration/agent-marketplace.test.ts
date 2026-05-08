import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler';

// Mock auth
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: (_req: any, _res: any, next: any) => { _req.userId = 'test-user'; next(); },
  requireScope: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock RBAC (admin gate on moderation routes)
jest.mock('../../middleware/rbac', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock moderation factory (Sprint 1.10 content moderation)
jest.mock('../../middleware/moderation-factory', () => ({
  createModerationMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock marketplace service
const mockList = jest.fn();
const mockFeatured = jest.fn();
const mockInstall = jest.fn();
const mockPublish = jest.fn();
const mockRate = jest.fn();
const mockGetPublishCandidate = jest.fn();
const mockUnpublish = jest.fn();
const mockListPending = jest.fn();
const mockSetModeration = jest.fn();

jest.mock('../../services/agents/marketplace-service', () => ({
  marketplaceService: {
    listCommunityBlueprints: (...args: unknown[]) => mockList(...args),
    getFeatured: (...args: unknown[]) => mockFeatured(...args),
    installBlueprint: (...args: unknown[]) => mockInstall(...args),
    publishBlueprint: (...args: unknown[]) => mockPublish(...args),
    rateBlueprint: (...args: unknown[]) => mockRate(...args),
    getPublishCandidate: (...args: unknown[]) => mockGetPublishCandidate(...args),
    unpublishBlueprint: (...args: unknown[]) => mockUnpublish(...args),
    listPendingBlueprints: (...args: unknown[]) => mockListPending(...args),
    setModerationDecision: (...args: unknown[]) => mockSetModeration(...args),
  },
}));

let app: express.Express;

beforeAll(async () => {
  const { marketplaceRouter } = await import('../../routes/marketplace');
  app = express();
  app.use(express.json());
  app.use('/api/marketplace', marketplaceRouter);
  app.use(errorHandler);
});

beforeEach(() => jest.clearAllMocks());

describe('Marketplace Routes', () => {
  describe('GET /api/marketplace/blueprints', () => {
    it('returns community blueprints', async () => {
      mockList.mockResolvedValueOnce([{ id: 'bp1', name: 'Agent 1' }]);
      const res = await request(app).get('/api/marketplace/blueprints');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('passes filter params', async () => {
      mockList.mockResolvedValueOnce([]);
      await request(app).get('/api/marketplace/blueprints?category=productivity&sort=rating');
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({
        category: 'productivity',
        sort: 'rating',
      }));
    });
  });

  describe('GET /api/marketplace/featured', () => {
    it('returns featured blueprints', async () => {
      mockFeatured.mockResolvedValueOnce([{ id: 'bp1' }, { id: 'bp2' }]);
      const res = await request(app).get('/api/marketplace/featured');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/marketplace/blueprints/install', () => {
    it('installs blueprint', async () => {
      mockInstall.mockResolvedValueOnce({ id: 'bp1_testuser', source: 'user_created' });
      const res = await request(app)
        .post('/api/marketplace/blueprints/install')
        .send({ blueprintId: 'bp1' });
      expect(res.status).toBe(201);
      expect(mockInstall).toHaveBeenCalledWith('bp1', 'test-user');
    });

    it('rejects without blueprintId', async () => {
      const res = await request(app)
        .post('/api/marketplace/blueprints/install')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/marketplace/blueprints/publish', () => {
    it('publishes blueprint and returns pending state', async () => {
      mockPublish.mockResolvedValueOnce(undefined);
      const res = await request(app)
        .post('/api/marketplace/blueprints/publish')
        .send({ blueprintId: 'custom' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('pending');
    });

    it('forwards meta (description/category/tags) to service', async () => {
      mockPublish.mockResolvedValueOnce(undefined);
      const description = 'x'.repeat(60);
      const res = await request(app)
        .post('/api/marketplace/blueprints/publish')
        .send({ blueprintId: 'custom', description, category: 'productivity', tags: ['a', 'b'] });
      expect(res.status).toBe(200);
      expect(mockPublish).toHaveBeenCalledWith('custom', 'test-user', expect.objectContaining({
        description: description.trim(),
        category: 'productivity',
        tags: ['a', 'b'],
      }));
    });

    it('rejects without blueprintId', async () => {
      const res = await request(app)
        .post('/api/marketplace/blueprints/publish')
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects description < 50 chars', async () => {
      const res = await request(app)
        .post('/api/marketplace/blueprints/publish')
        .send({ blueprintId: 'custom', description: 'too short' });
      expect(res.status).toBe(400);
    });

    it('rejects tags array >5 entries', async () => {
      const res = await request(app)
        .post('/api/marketplace/blueprints/publish')
        .send({ blueprintId: 'custom', tags: ['1', '2', '3', '4', '5', '6'] });
      expect(res.status).toBe(400);
    });

    it('translates PUBLISH_RATE_LIMIT to 429', async () => {
      const err = Object.assign(new Error('rate limited'), { code: 'PUBLISH_RATE_LIMIT' });
      mockPublish.mockRejectedValueOnce(err);
      const res = await request(app)
        .post('/api/marketplace/blueprints/publish')
        .send({ blueprintId: 'custom' });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('PUBLISH_RATE_LIMIT');
    });

    it('translates PUBLISH_DUPLICATE to 409', async () => {
      const err = Object.assign(new Error('duplicate'), { code: 'PUBLISH_DUPLICATE' });
      mockPublish.mockRejectedValueOnce(err);
      const res = await request(app)
        .post('/api/marketplace/blueprints/publish')
        .send({ blueprintId: 'custom' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PUBLISH_DUPLICATE');
    });

    it('translates not-owned to 404', async () => {
      mockPublish.mockRejectedValueOnce(new Error('not owned by user'));
      const res = await request(app)
        .post('/api/marketplace/blueprints/publish')
        .send({ blueprintId: 'custom' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/marketplace/blueprints/:id/publish-candidate', () => {
    it('returns owner-scoped pre-fill', async () => {
      mockGetPublishCandidate.mockResolvedValueOnce({ blueprintId: 'custom', name: 'x', tools: [] });
      const res = await request(app).get('/api/marketplace/blueprints/custom/publish-candidate');
      expect(res.status).toBe(200);
      expect(mockGetPublishCandidate).toHaveBeenCalledWith('custom', 'test-user');
    });

    it('returns 404 when blueprint not owned', async () => {
      mockGetPublishCandidate.mockRejectedValueOnce(new Error('not owned by user'));
      const res = await request(app).get('/api/marketplace/blueprints/custom/publish-candidate');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/marketplace/blueprints/:id/publish', () => {
    it('unpublishes a community blueprint', async () => {
      mockUnpublish.mockResolvedValueOnce(undefined);
      const res = await request(app).delete('/api/marketplace/blueprints/custom/publish');
      expect(res.status).toBe(200);
      expect(mockUnpublish).toHaveBeenCalledWith('custom', 'test-user');
    });

    it('returns 404 when not owner', async () => {
      mockUnpublish.mockRejectedValueOnce(new Error('not owned by user'));
      const res = await request(app).delete('/api/marketplace/blueprints/custom/publish');
      expect(res.status).toBe(404);
    });
  });

  describe('admin moderation queue', () => {
    it('GET /admin/pending returns queue', async () => {
      mockListPending.mockResolvedValueOnce([{ id: 'bp1', name: 'A' }]);
      const res = await request(app).get('/api/marketplace/admin/pending?limit=25');
      expect(res.status).toBe(200);
      expect(mockListPending).toHaveBeenCalledWith(25);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /admin/blueprints/:id/moderate approves', async () => {
      mockSetModeration.mockResolvedValueOnce(undefined);
      const res = await request(app)
        .post('/api/marketplace/admin/blueprints/bp1/moderate')
        .send({ decision: 'approved' });
      expect(res.status).toBe(200);
      expect(mockSetModeration).toHaveBeenCalledWith('bp1', 'test-user', 'approved', undefined);
    });

    it('POST /admin/blueprints/:id/moderate rejects with trimmed reason', async () => {
      mockSetModeration.mockResolvedValueOnce(undefined);
      const res = await request(app)
        .post('/api/marketplace/admin/blueprints/bp1/moderate')
        .send({ decision: 'rejected', reason: '  violates TOS  ' });
      expect(res.status).toBe(200);
      expect(mockSetModeration).toHaveBeenCalledWith('bp1', 'test-user', 'rejected', 'violates TOS');
    });

    it('rejects invalid decision', async () => {
      const res = await request(app)
        .post('/api/marketplace/admin/blueprints/bp1/moderate')
        .send({ decision: 'maybe' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when rejection misses reason', async () => {
      mockSetModeration.mockRejectedValueOnce(new Error('requires a reason'));
      const res = await request(app)
        .post('/api/marketplace/admin/blueprints/bp1/moderate')
        .send({ decision: 'rejected' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when pending blueprint missing', async () => {
      mockSetModeration.mockRejectedValueOnce(new Error('pending blueprint not found'));
      const res = await request(app)
        .post('/api/marketplace/admin/blueprints/bp1/moderate')
        .send({ decision: 'approved' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/marketplace/blueprints/:id/rate', () => {
    it('rates blueprint', async () => {
      mockRate.mockResolvedValueOnce({ id: 'r1', blueprintId: 'bp1', rating: 5 });
      const res = await request(app)
        .post('/api/marketplace/blueprints/bp1/rate')
        .send({ rating: 5, review: 'Great!' });
      expect(res.status).toBe(200);
      expect(mockRate).toHaveBeenCalledWith('bp1', 'test-user', 5, 'Great!');
    });

    it('rejects without rating', async () => {
      const res = await request(app)
        .post('/api/marketplace/blueprints/bp1/rate')
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid rating', async () => {
      mockRate.mockRejectedValueOnce(new Error('Rating must be between 1 and 5'));
      const res = await request(app)
        .post('/api/marketplace/blueprints/bp1/rate')
        .send({ rating: 6 });
      expect(res.status).toBe(400);
    });
  });
});
