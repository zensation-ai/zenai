/**
 * Integration Tests for Social Media API
 *
 * Tests all endpoints of the social router with mocked services.
 * Uses supertest to simulate HTTP requests.
 *
 * Endpoints:
 *   GET    /api/:context/social/posts           - List posts
 *   GET    /api/:context/social/posts/:id       - Get single post
 *   POST   /api/:context/social/posts           - Create draft
 *   PUT    /api/:context/social/posts/:id       - Update draft
 *   DELETE /api/:context/social/posts/:id       - Delete draft
 *   POST   /api/:context/social/posts/:id/approve  - Approve post
 *   POST   /api/:context/social/posts/:id/publish  - Publish post
 *   POST   /api/:context/social/posts/:id/schedule - Schedule post
 *   GET    /api/:context/social/platforms       - Platform status
 *   GET    /api/:context/social/calendar        - Scheduled calendar
 */

import express, { Express } from 'express';
import request from 'supertest';

// Sprint 1.5 Item 4 — social router now uses `router.use(apiKeyAuth)`. This
// suite predates that change and treats requests as already authenticated, so
// we stub the middleware to a pass-through.
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import socialRouter from '../../routes/social';

// Mock database context
jest.mock('../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['operations', 'finance', 'people', 'strategy'].includes(ctx)),
  AIContext: {},
  queryContext: jest.fn(),
}));

// Mock social publisher service
jest.mock('../../services/social/social-publisher', () => ({
  createPostDraft: jest.fn(),
  listPosts: jest.fn(),
  getPost: jest.fn(),
  updatePost: jest.fn(),
  deletePost: jest.fn(),
  publishPost: jest.fn(),
  getPlatformStatus: jest.fn(),
  schedulePost: jest.fn().mockResolvedValue(undefined),
}));

// Mock platform-types
jest.mock('../../services/social/platform-types', () => ({
  PostStatus: {},
  SocialPlatform: {},
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock governance service
jest.mock('../../services/governance', () => ({
  approveAction: jest.fn().mockResolvedValue({ id: 'gov-action-id', status: 'approved' }),
}));

// Mock social governance service
jest.mock('../../services/social/social-governance', () => ({
  requestSocialApproval: jest.fn(),
}));

import {
  createPostDraft,
  listPosts,
  getPost,
  updatePost,
  deletePost,
  publishPost,
  getPlatformStatus,
} from '../../services/social/social-publisher';
import { queryContext } from '../../utils/database-context';
import { errorHandler } from '../../middleware/errorHandler';
import { requestSocialApproval } from '../../services/social/social-governance';

var mockCreatePostDraft = createPostDraft as jest.MockedFunction<typeof createPostDraft>;
var mockListPosts = listPosts as jest.MockedFunction<typeof listPosts>;
var mockGetPost = getPost as jest.MockedFunction<typeof getPost>;
var mockUpdatePost = updatePost as jest.MockedFunction<typeof updatePost>;
var mockDeletePost = deletePost as jest.MockedFunction<typeof deletePost>;
var mockPublishPost = publishPost as jest.MockedFunction<typeof publishPost>;
var mockGetPlatformStatus = getPlatformStatus as jest.MockedFunction<typeof getPlatformStatus>;
var mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
var mockRequestSocialApproval = requestSocialApproval as jest.MockedFunction<typeof requestSocialApproval>;

const mockPost = {
  id: 'post-1',
  context: 'finance' as const,
  platform: 'twitter' as const,
  content: 'ZenBrain v0.3.0 is live!',
  status: 'draft' as const,
  source_type: 'manual' as const,
  source_id: null,
  media_urls: null,
  scheduled_at: null,
  published_at: null,
  external_id: null,
  error_message: null,
  created_at: '2026-03-29T10:00:00Z',
  updated_at: '2026-03-29T10:00:00Z',
};

describe('Social Media API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', socialRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // GET /api/:context/social/posts
  // ===========================================

  describe('GET /api/:context/social/posts', () => {
    it('should return list of posts', async () => {
      mockListPosts.mockResolvedValueOnce([mockPost]);

      const response = await request(app)
        .get('/api/finance/social/posts')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].id).toBe('post-1');
    });

    it('should filter by status', async () => {
      mockListPosts.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/finance/social/posts')
        .query({ status: 'draft' })
        .expect(200);

      expect(mockListPosts).toHaveBeenCalledWith('finance', expect.objectContaining({ status: 'draft' }));
    });

    it('should filter by platform', async () => {
      mockListPosts.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/finance/social/posts')
        .query({ platform: 'twitter' })
        .expect(200);

      expect(mockListPosts).toHaveBeenCalledWith('finance', expect.objectContaining({ platform: 'twitter' }));
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .get('/api/invalid/social/posts')
        .expect(400);

      expect(response.body.error).toContain('context');
    });
  });

  // ===========================================
  // GET /api/:context/social/posts/:id
  // ===========================================

  describe('GET /api/:context/social/posts/:id', () => {
    it('should return a single post', async () => {
      mockGetPost.mockResolvedValueOnce(mockPost);

      const response = await request(app)
        .get('/api/finance/social/posts/post-1')
        .expect(200);

      expect(response.body.data.id).toBe('post-1');
    });

    it('should return 404 for non-existent post', async () => {
      mockGetPost.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/finance/social/posts/nonexistent')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .get('/api/invalid/social/posts/post-1')
        .expect(400);

      expect(response.body.error).toContain('context');
    });
  });

  // ===========================================
  // POST /api/:context/social/posts
  // ===========================================

  describe('POST /api/:context/social/posts', () => {
    it('should create a draft post', async () => {
      mockCreatePostDraft.mockResolvedValueOnce(mockPost);

      const response = await request(app)
        .post('/api/finance/social/posts')
        .send({ platform: 'twitter', content: 'ZenBrain v0.3.0 is live!' })
        .expect(201);

      expect(response.body.data.id).toBe('post-1');
      expect(mockCreatePostDraft).toHaveBeenCalledWith('finance', expect.objectContaining({
        platform: 'twitter',
        content: 'ZenBrain v0.3.0 is live!',
      }));
    });

    it('should require platform and content', async () => {
      const response = await request(app)
        .post('/api/finance/social/posts')
        .send({ content: 'Only content, no platform' })
        .expect(400);

      expect(response.body.error).toContain('platform');
    });

    it('should pass source_type and source_id', async () => {
      mockCreatePostDraft.mockResolvedValueOnce(mockPost);

      await request(app)
        .post('/api/finance/social/posts')
        .send({
          platform: 'twitter',
          content: 'Phase 142 released!',
          source_type: 'changelog',
          source_id: 'phase-142',
        })
        .expect(201);

      expect(mockCreatePostDraft).toHaveBeenCalledWith('finance', expect.objectContaining({
        source_type: 'changelog',
        source_id: 'phase-142',
      }));
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .post('/api/invalid/social/posts')
        .send({ platform: 'twitter', content: 'Hello!' })
        .expect(400);

      expect(response.body.error).toContain('context');
    });
  });

  // ===========================================
  // PUT /api/:context/social/posts/:id
  // ===========================================

  describe('PUT /api/:context/social/posts/:id', () => {
    it('should update a draft post', async () => {
      const updated = { ...mockPost, content: 'Updated content' };
      mockUpdatePost.mockResolvedValueOnce(updated);

      const response = await request(app)
        .put('/api/finance/social/posts/post-1')
        .send({ content: 'Updated content' })
        .expect(200);

      expect(response.body.data.content).toBe('Updated content');
    });

    it('should return 404 when post not found', async () => {
      mockUpdatePost.mockResolvedValueOnce(null);

      const response = await request(app)
        .put('/api/finance/social/posts/nonexistent')
        .send({ content: 'New content' })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .put('/api/invalid/social/posts/post-1')
        .send({ content: 'Hello!' })
        .expect(400);

      expect(response.body.error).toContain('context');
    });
  });

  // ===========================================
  // DELETE /api/:context/social/posts/:id
  // ===========================================

  describe('DELETE /api/:context/social/posts/:id', () => {
    it('should delete a draft post', async () => {
      mockDeletePost.mockResolvedValueOnce(true);

      const response = await request(app)
        .delete('/api/finance/social/posts/post-1')
        .expect(200);

      expect(response.body.ok).toBe(true);
    });

    it('should return 404 when post not found', async () => {
      mockDeletePost.mockResolvedValueOnce(false);

      const response = await request(app)
        .delete('/api/finance/social/posts/nonexistent')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .delete('/api/invalid/social/posts/post-1')
        .expect(400);

      expect(response.body.error).toContain('context');
    });
  });

  // ===========================================
  // POST /api/:context/social/posts/:id/approve
  // ===========================================

  describe('POST /api/:context/social/posts/:id/approve', () => {
    it('should approve a discord post (auto-approved)', async () => {
      const approved = { ...mockPost, platform: 'discord', status: 'approved', governance_id: 'gov-1' };
      const govAction = { id: 'gov-1', status: 'auto_approved' };
      mockRequestSocialApproval.mockResolvedValueOnce({
        post: approved as any,
        governanceAction: govAction as any,
        autoApproved: true,
      });

      const response = await request(app)
        .post('/api/finance/social/posts/post-1/approve')
        .expect(200);

      expect(response.body.data.status).toBe('approved');
      expect(response.body.autoApproved).toBe(true);
      expect(response.body.governanceId).toBe('gov-1');
    });

    it('should set twitter post to pending_approval (medium risk)', async () => {
      const pending = { ...mockPost, status: 'pending_approval', governance_id: 'gov-2' };
      const govAction = { id: 'gov-2', status: 'pending' };
      mockRequestSocialApproval.mockResolvedValueOnce({
        post: pending as any,
        governanceAction: govAction as any,
        autoApproved: false,
      });

      const response = await request(app)
        .post('/api/finance/social/posts/post-1/approve')
        .expect(200);

      expect(response.body.data.status).toBe('pending_approval');
      expect(response.body.autoApproved).toBe(false);
    });

    it('should return 404 when post not found', async () => {
      mockRequestSocialApproval.mockRejectedValueOnce(new Error('Social post not found: nonexistent'));

      const response = await request(app)
        .post('/api/finance/social/posts/nonexistent/approve')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .post('/api/invalid/social/posts/post-1/approve')
        .expect(400);

      expect(response.body.error).toContain('context');
    });

    it('should call requestSocialApproval with correct context and postId', async () => {
      const approved = { ...mockPost, status: 'approved', governance_id: 'gov-3' };
      mockRequestSocialApproval.mockResolvedValueOnce({
        post: approved as any,
        governanceAction: { id: 'gov-3', status: 'auto_approved' } as any,
        autoApproved: true,
      });

      await request(app)
        .post('/api/finance/social/posts/post-1/approve')
        .expect(200);

      expect(mockRequestSocialApproval).toHaveBeenCalledWith('finance', 'post-1');
    });
  });

  // ===========================================
  // POST /api/:context/social/posts/:id/publish
  // ===========================================

  describe('POST /api/:context/social/posts/:id/publish', () => {
    it('should publish a post successfully', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // approve step
      mockPublishPost.mockResolvedValueOnce({
        success: true,
        post_id: 'post-1',
        platform_response: { id: 'tw-123' },
      });

      const response = await request(app)
        .post('/api/finance/social/posts/post-1/publish')
        .expect(200);

      expect(response.body.data.success).toBe(true);
    });

    it('should return 400 when publish fails', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockPublishPost.mockResolvedValueOnce({
        success: false,
        error: 'Twitter API rate limit exceeded',
      });

      const response = await request(app)
        .post('/api/finance/social/posts/post-1/publish')
        .expect(400);

      expect(response.body.error).toContain('rate limit');
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .post('/api/invalid/social/posts/post-1/publish')
        .expect(400);

      expect(response.body.error).toContain('context');
    });
  });

  // ===========================================
  // POST /api/:context/social/posts/:id/schedule
  // ===========================================

  describe('POST /api/:context/social/posts/:id/schedule', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    it('should schedule a post', async () => {
      const scheduled = { ...mockPost, status: 'scheduled', scheduled_at: futureDate };
      // First call: existence check (SELECT id WHERE status IN ...)
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'post-1' }] } as any);
      // Second call: final SELECT after schedulePost to return the updated post
      mockQueryContext.mockResolvedValueOnce({ rows: [scheduled] } as any);

      const response = await request(app)
        .post('/api/finance/social/posts/post-1/schedule')
        .send({ scheduled_at: futureDate })
        .expect(200);

      expect(response.body.data.status).toBe('scheduled');
    });

    it('should require scheduled_at', async () => {
      const response = await request(app)
        .post('/api/finance/social/posts/post-1/schedule')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('scheduled_at');
    });

    it('should return 404 when post not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const response = await request(app)
        .post('/api/finance/social/posts/nonexistent/schedule')
        .send({ scheduled_at: futureDate })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .post('/api/invalid/social/posts/post-1/schedule')
        .send({ scheduled_at: futureDate })
        .expect(400);

      expect(response.body.error).toContain('context');
    });
  });

  // ===========================================
  // GET /api/:context/social/platforms
  // ===========================================

  describe('GET /api/:context/social/platforms', () => {
    it('should return platform status', async () => {
      mockGetPlatformStatus.mockReturnValueOnce({
        twitter: { available: true, name: 'Twitter / X' },
        discord: { available: false, name: 'Discord' },
        linkedin: { available: false, name: 'LinkedIn' },
      });

      const response = await request(app)
        .get('/api/finance/social/platforms')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.twitter).toBeDefined();
    });
  });

  // ===========================================
  // GET /api/:context/social/calendar
  // ===========================================

  describe('GET /api/:context/social/calendar', () => {
    it('should return scheduled posts', async () => {
      const scheduled = { ...mockPost, status: 'scheduled' as const };
      mockListPosts.mockResolvedValueOnce([scheduled]);

      const response = await request(app)
        .get('/api/finance/social/calendar')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(mockListPosts).toHaveBeenCalledWith('finance', { status: 'scheduled' });
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .get('/api/invalid/social/calendar')
        .expect(400);

      expect(response.body.error).toContain('context');
    });
  });
});
