/**
 * Learning Tasks Route Tests
 */

import express from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-4111-a111-111111111111';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
}));

const mockCreateLearningTask = jest.fn();
const mockGetLearningTasks = jest.fn();
const mockGetLearningTask = jest.fn();
const mockUpdateLearningTask = jest.fn();
const mockDeleteLearningTask = jest.fn();
const mockLogStudySession = jest.fn();
const mockGetStudySessions = jest.fn();
const mockGetLearningStats = jest.fn();
const mockGetLearningInsights = jest.fn();
const mockAcknowledgeInsight = jest.fn();
const mockGetDailyLearningSummary = jest.fn();
const mockGenerateLearningOutline = jest.fn();
const mockUpdateTaskProgress = jest.fn();

jest.mock('../../../services/learning-tasks', () => ({
  createLearningTask: (...args: unknown[]) => mockCreateLearningTask(...args),
  getLearningTasks: (...args: unknown[]) => mockGetLearningTasks(...args),
  getLearningTask: (...args: unknown[]) => mockGetLearningTask(...args),
  updateLearningTask: (...args: unknown[]) => mockUpdateLearningTask(...args),
  deleteLearningTask: (...args: unknown[]) => mockDeleteLearningTask(...args),
  logStudySession: (...args: unknown[]) => mockLogStudySession(...args),
  getStudySessions: (...args: unknown[]) => mockGetStudySessions(...args),
  getLearningStats: (...args: unknown[]) => mockGetLearningStats(...args),
  getLearningInsights: (...args: unknown[]) => mockGetLearningInsights(...args),
  acknowledgeInsight: (...args: unknown[]) => mockAcknowledgeInsight(...args),
  getDailyLearningSummary: (...args: unknown[]) => mockGetDailyLearningSummary(...args),
  generateLearningOutline: (...args: unknown[]) => mockGenerateLearningOutline(...args),
  updateTaskProgress: (...args: unknown[]) => mockUpdateTaskProgress(...args),
  LEARNING_CATEGORIES: ['programming', 'science', 'languages', 'math', 'general'],
}));

jest.mock('../../../services/active-recall', () => ({
  generateChallenge: jest.fn().mockResolvedValue({ question: 'What is X?' }),
  evaluateRecall: jest.fn().mockResolvedValue({ score: 0.8, feedback: 'Good' }),
  getReviewSchedule: jest.fn().mockResolvedValue([]),
}));

import { learningTasksRouter } from '../../../routes/learning-tasks';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Learning Tasks Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', learningTasksRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/:context/learning-tasks', () => {
    it('should list learning tasks', async () => {
      mockGetLearningTasks.mockResolvedValue({ tasks: [{ id: '1' }], total: 1 });

      const res = await request(app).get('/api/personal/learning-tasks');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tasks).toHaveLength(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/learning-tasks');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/learning-tasks', () => {
    it('should create a learning task', async () => {
      mockCreateLearningTask.mockResolvedValue({ id: VALID_UUID, topic: 'TypeScript' });

      const res = await request(app)
        .post('/api/personal/learning-tasks')
        .send({ topic: 'TypeScript', category: 'programming' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.task.topic).toBe('TypeScript');
    });

    it('should reject missing topic', async () => {
      const res = await request(app)
        .post('/api/personal/learning-tasks')
        .send({ category: 'programming' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid category', async () => {
      const res = await request(app)
        .post('/api/personal/learning-tasks')
        .send({ topic: 'Test', category: 'invalid_category' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid priority', async () => {
      const res = await request(app)
        .post('/api/personal/learning-tasks')
        .send({ topic: 'Test', priority: 'urgent' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/learning-tasks/:id', () => {
    it('should return a single task with sessions', async () => {
      mockGetLearningTask.mockResolvedValue({ id: VALID_UUID, topic: 'TS' });
      mockGetStudySessions.mockResolvedValue([]);

      const res = await request(app).get(`/api/personal/learning-tasks/${VALID_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.task.id).toBe(VALID_UUID);
    });

    it('should return 404 for non-existent task', async () => {
      mockGetLearningTask.mockResolvedValue(null);

      const res = await request(app).get(`/api/personal/learning-tasks/${VALID_UUID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/:context/learning-tasks/:id', () => {
    it('should update a learning task', async () => {
      mockUpdateLearningTask.mockResolvedValue({ id: VALID_UUID, status: 'completed' });

      const res = await request(app)
        .put(`/api/personal/learning-tasks/${VALID_UUID}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid status', async () => {
      const res = await request(app)
        .put(`/api/personal/learning-tasks/${VALID_UUID}`)
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/:context/learning-tasks/:id', () => {
    it('should delete a learning task', async () => {
      mockDeleteLearningTask.mockResolvedValue(true);

      const res = await request(app).delete(`/api/personal/learning-tasks/${VALID_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent task', async () => {
      mockDeleteLearningTask.mockResolvedValue(false);

      const res = await request(app).delete(`/api/personal/learning-tasks/${VALID_UUID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/:context/learning-stats', () => {
    it('should return learning statistics', async () => {
      mockGetLearningStats.mockResolvedValue({ totalTasks: 5, completedTasks: 2 });

      const res = await request(app).get('/api/personal/learning-stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats.totalTasks).toBe(5);
    });
  });

  describe('GET /api/:context/learning-categories', () => {
    it('should return available categories', async () => {
      const res = await request(app).get('/api/personal/learning-categories');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.categories).toContain('programming');
    });
  });
});
