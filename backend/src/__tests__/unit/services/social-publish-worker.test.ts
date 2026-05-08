/**
 * Unit Tests — Social Publish Worker
 *
 * Covers:
 *  - Worker processes job and calls publishPost
 *  - Worker handles publishPost failure gracefully
 *  - schedulePost updates DB status to 'scheduled'
 *  - schedulePost adds a delayed BullMQ job
 *  - schedulePost degrades gracefully when Redis unavailable
 *  - Schedule route calls schedulePost with correct args
 *  - Job data shape is correct { postId, context }
 *  - Worker uses the queue name 'social-publish'
 */

// ─── Module mocks ──────────────────────────────────────────────────────────────

// Sprint 1.5 Item 4 — the social router now uses `router.use(apiKeyAuth)`.
// This suite exercises the router with no real API key, so stub the middleware.
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (ctx: string) => ['operations', 'finance', 'people', 'strategy'].includes(ctx),
  AIContext: {},
}));

const mockPublishPost = jest.fn();
jest.mock('../../../services/social/social-publisher', () => ({
  publishPost: (...args: unknown[]) => mockPublishPost(...args),
  schedulePost: jest.fn(),
  createPostDraft: jest.fn(),
  listPosts: jest.fn(),
  getPost: jest.fn(),
  updatePost: jest.fn(),
  deletePost: jest.fn(),
  getPlatformStatus: jest.fn(),
}));

// BullMQ mock — captured so we can inspect add() calls
const mockQueueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
const mockQueueClose = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
  Worker: jest.fn().mockImplementation((_name: string, _processor: unknown, _opts: unknown) => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────────

import { processSocialPublishJob, createSocialPublishWorker } from '../../../services/queue/workers/social-publish-worker';
import { schedulePost } from '../../../services/social/social-publisher';
import { Queue, Worker } from 'bullmq';

const MockQueue = Queue as jest.MockedClass<typeof Queue>;
const MockWorker = Worker as jest.MockedClass<typeof Worker>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<{ postId: string; context: string }> = {}) {
  return {
    id: 'job-abc',
    name: 'publish:post-1',
    data: {
      postId: overrides.postId ?? 'post-1',
      context: (overrides.context ?? 'operations') as 'operations',
    },
    updateProgress: jest.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('processSocialPublishJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls publishPost with correct context and postId', async () => {
    mockPublishPost.mockResolvedValueOnce({ success: true, platformPostId: 'tw-999' });

    const job = makeJob({ postId: 'post-42', context: 'finance' });
    await processSocialPublishJob(job as any);

    expect(mockPublishPost).toHaveBeenCalledWith('finance', 'post-42');
  });

  it('returns published status on success', async () => {
    mockPublishPost.mockResolvedValueOnce({ success: true, platformPostId: 'tw-999' });

    const job = makeJob();
    const result = await processSocialPublishJob(job as any);

    expect(result).toMatchObject({ status: 'published', postId: 'post-1', context: 'operations' });
  });

  it('throws when publishPost returns success:false so BullMQ handles the failure lifecycle', async () => {
    mockPublishPost.mockResolvedValueOnce({ success: false, error: 'platform error' });

    const job = makeJob();
    await expect(processSocialPublishJob(job as any)).rejects.toThrow(
      'Publish failed for post post-1: platform error'
    );
  });

  it('updates post status to failed in DB and rethrows when publishPost throws', async () => {
    const boom = new Error('network timeout');
    mockPublishPost.mockRejectedValueOnce(boom);
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 });

    const job = makeJob({ postId: 'post-err' });

    await expect(processSocialPublishJob(job as any)).rejects.toThrow('network timeout');

    expect(mockQueryContext).toHaveBeenCalledWith(
      'operations',
      expect.stringContaining("SET status = 'failed'"),
      ['post-err']
    );
  });

  it('job data shape is { postId: string, context: AIContext }', () => {
    const job = makeJob({ postId: 'p-1', context: 'strategy' });
    expect(job.data).toEqual({ postId: 'p-1', context: 'strategy' });
    expect(typeof job.data.postId).toBe('string');
    expect(typeof job.data.context).toBe('string');
  });
});

describe('createSocialPublishWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockWorker.mockClear();
  });

  it('creates a Worker on the social-publish queue', () => {
    createSocialPublishWorker({ url: 'redis://localhost:6379' });

    expect(MockWorker).toHaveBeenCalledWith(
      'social-publish',
      expect.any(Function),
      expect.objectContaining({ concurrency: 2 })
    );
  });

  it('uses concurrency=2', () => {
    createSocialPublishWorker({ url: 'redis://localhost:6379' });

    const callOpts = MockWorker.mock.calls[0][2] as { concurrency: number };
    expect(callOpts.concurrency).toBe(2);
  });

  it('returns null and logs a warning when Worker constructor throws', () => {
    MockWorker.mockImplementationOnce(() => { throw new Error('BullMQ unavailable'); });

    const { logger } = require('../../../utils/logger');
    const result = createSocialPublishWorker({ url: 'redis://localhost:6379' });

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('schedulePost', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 });
    MockQueue.mockClear();
    mockQueueAdd.mockClear();
    mockQueueClose.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // NOTE: schedulePost in social-publisher.ts is the real implementation;
  // the mock at top only affects the route test below. For these tests we
  // import the real module via a separate jest.isolateModules block.

  it('updates social_posts status to scheduled and sets scheduled_at', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';

    // Re-import real module bypassing the top-level mock
    const { schedulePost: realSchedulePost } = jest.requireActual('../../../services/social/social-publisher') as typeof import('../../../services/social/social-publisher');

    const scheduledAt = new Date('2026-04-01T10:00:00Z');
    await realSchedulePost('operations', 'post-99', scheduledAt);

    expect(mockQueryContext).toHaveBeenCalledWith(
      'operations',
      expect.stringContaining("SET status = 'scheduled'"),
      ['post-99', scheduledAt]
    );
  });

  it('adds a delayed BullMQ job with correct postId and context', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';

    const { schedulePost: realSchedulePost } = jest.requireActual('../../../services/social/social-publisher') as typeof import('../../../services/social/social-publisher');

    const scheduledAt = new Date(Date.now() + 60_000); // 1 minute from now
    await realSchedulePost('finance', 'post-delay', scheduledAt);

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'publish:post-delay',
      { postId: 'post-delay', context: 'finance' },
      expect.objectContaining({ delay: expect.any(Number) })
    );
  });

  it('degrades gracefully when REDIS_URL is not set (no throw, no queue add)', async () => {
    delete process.env.REDIS_URL;

    const { schedulePost: realSchedulePost } = jest.requireActual('../../../services/social/social-publisher') as typeof import('../../../services/social/social-publisher');

    await expect(realSchedulePost('operations', 'post-nq', new Date())).resolves.toBeUndefined();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('still resolves (no throw) when BullMQ Queue.add fails', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockQueueAdd.mockRejectedValueOnce(new Error('redis down'));

    const { schedulePost: realSchedulePost } = jest.requireActual('../../../services/social/social-publisher') as typeof import('../../../services/social/social-publisher');

    await expect(realSchedulePost('operations', 'post-fail', new Date())).resolves.toBeUndefined();
  });
});

describe('Schedule route', () => {
  let app: ReturnType<typeof import('express').default>;
  let mockSchedulePost: jest.MockedFunction<typeof schedulePost>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();

    mockSchedulePost = schedulePost as jest.MockedFunction<typeof schedulePost>;
    mockSchedulePost.mockResolvedValue(undefined);

    // Post exists check
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ id: 'post-sched' }], rowCount: 1 })
      // Return updated post
      .mockResolvedValueOnce({ rows: [{ id: 'post-sched', status: 'scheduled', scheduled_at: '2026-04-01T10:00:00Z' }], rowCount: 1 });

    const express = require('express');
    const socialRouter = require('../../../routes/social').default;
    app = express();
    app.use(express.json());
    app.use('/api', socialRouter);
  });

  it('calls schedulePost with context, postId, and a Date when schedule endpoint is hit', async () => {
    const request = require('supertest');
    await request(app)
      .post('/api/operations/social/posts/post-sched/schedule')
      .send({ scheduled_at: '2026-04-01T10:00:00Z' })
      .expect(200);

    expect(mockSchedulePost).toHaveBeenCalledWith(
      'operations',
      'post-sched',
      expect.any(Date)
    );
  });

  it('returns 400 if scheduled_at is missing', async () => {
    const request = require('supertest');
    const res = await request(app)
      .post('/api/operations/social/posts/post-sched/schedule')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scheduled_at/);
    expect(mockSchedulePost).not.toHaveBeenCalled();
  });
});
