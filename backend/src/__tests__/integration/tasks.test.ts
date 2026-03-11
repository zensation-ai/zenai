/**
 * Integration Tests for Tasks API - Phase 37
 *
 * Tests the Tasks router endpoints with mocked services.
 * Uses supertest to simulate HTTP requests.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { tasksRouter } from '../../routes/tasks';

// Mock all external dependencies
jest.mock('../../services/tasks', () => ({
  createTask: jest.fn(),
  getTasks: jest.fn(),
  getTask: jest.fn(),
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
  reorderTasks: jest.fn(),
  getTasksForGantt: jest.fn(),
  addDependency: jest.fn(),
  removeDependency: jest.fn(),
  getTaskDependencies: jest.fn(),
  convertIdeaToTask: jest.fn(),
  TaskStatus: {},
}));

jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req: any, _res: any, next: any) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  reorderTasks,
  getTasksForGantt,
  addDependency,
  removeDependency,
  getTaskDependencies,
  convertIdeaToTask,
} from '../../services/tasks';
import { errorHandler } from '../../middleware/errorHandler';

var mockCreateTask = createTask as jest.MockedFunction<typeof createTask>;
var mockGetTasks = getTasks as jest.MockedFunction<typeof getTasks>;
var mockGetTask = getTask as jest.MockedFunction<typeof getTask>;
var mockUpdateTask = updateTask as jest.MockedFunction<typeof updateTask>;
var mockDeleteTask = deleteTask as jest.MockedFunction<typeof deleteTask>;
var mockReorderTasks = reorderTasks as jest.MockedFunction<typeof reorderTasks>;
var mockGetTasksForGantt = getTasksForGantt as jest.MockedFunction<typeof getTasksForGantt>;
var mockAddDependency = addDependency as jest.MockedFunction<typeof addDependency>;
var mockRemoveDependency = removeDependency as jest.MockedFunction<typeof removeDependency>;
var mockGetTaskDependencies = getTaskDependencies as jest.MockedFunction<typeof getTaskDependencies>;
var mockConvertIdeaToTask = convertIdeaToTask as jest.MockedFunction<typeof convertIdeaToTask>;

// Sample data
const UUID_1 = '550e8400-e29b-41d4-a716-446655440001';
const UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const UUID_3 = '550e8400-e29b-41d4-a716-446655440003';

const sampleTask = {
  id: UUID_1,
  title: 'Write tests',
  description: 'Write integration tests for Phase 37',
  status: 'todo' as const,
  priority: 'high' as const,
  project_id: UUID_2,
  due_date: '2026-02-15T10:00:00Z',
  start_date: '2026-02-12T10:00:00Z',
  sort_order: 0,
  context: 'work',
  labels: ['testing'],
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleDependency = {
  id: UUID_3,
  task_id: UUID_1,
  depends_on_id: UUID_2,
  dependency_type: 'finish_to_start' as const,
  created_at: new Date().toISOString(),
};

describe('Tasks API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', tasksRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // GET /api/:context/tasks - List Tasks
  // ===========================================

  describe('GET /api/:context/tasks', () => {
    it('should return list of tasks', async () => {
      mockGetTasks.mockResolvedValueOnce([sampleTask] as any);

      const res = await request(app).get('/api/work/tasks');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Write tests');
      expect(res.body.count).toBe(1);
    });

    it('should pass query filters to service', async () => {
      mockGetTasks.mockResolvedValueOnce([] as any);

      await request(app)
        .get('/api/personal/tasks')
        .query({ status: 'todo', priority: 'high', project_id: UUID_2, limit: '50', offset: '10' });

      expect(mockGetTasks).toHaveBeenCalledWith('personal', expect.objectContaining({
        status: 'todo',
        priority: 'high',
        project_id: UUID_2,
        limit: 50,
        offset: 10,
      }));
    });

    it('should cap limit at 500', async () => {
      mockGetTasks.mockResolvedValueOnce([] as any);

      await request(app).get('/api/work/tasks').query({ limit: '9999' });

      expect(mockGetTasks).toHaveBeenCalledWith('work', expect.objectContaining({ limit: 500 }));
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/tasks');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return empty array when no tasks', async () => {
      mockGetTasks.mockResolvedValueOnce([] as any);

      const res = await request(app).get('/api/learning/tasks');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });
  });

  // ===========================================
  // GET /api/:context/tasks/gantt - Gantt Data
  // ===========================================

  describe('GET /api/:context/tasks/gantt', () => {
    it('should return gantt tasks', async () => {
      mockGetTasksForGantt.mockResolvedValueOnce([sampleTask] as any);

      const res = await request(app).get('/api/work/tasks/gantt');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should pass project_id filter', async () => {
      mockGetTasksForGantt.mockResolvedValueOnce([] as any);

      await request(app).get('/api/work/tasks/gantt').query({ project_id: UUID_2 });

      expect(mockGetTasksForGantt).toHaveBeenCalledWith('work', { project_id: UUID_2 });
    });

    it('should call without filters when no project_id', async () => {
      mockGetTasksForGantt.mockResolvedValueOnce([] as any);

      await request(app).get('/api/work/tasks/gantt');

      expect(mockGetTasksForGantt).toHaveBeenCalledWith('work', undefined);
    });
  });

  // ===========================================
  // GET /api/:context/tasks/:id - Get Task
  // ===========================================

  describe('GET /api/:context/tasks/:id', () => {
    it('should return a single task', async () => {
      mockGetTask.mockResolvedValueOnce(sampleTask as any);

      const res = await request(app).get(`/api/work/tasks/${UUID_1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(UUID_1);
    });

    it('should return 404 when task not found', async () => {
      mockGetTask.mockResolvedValueOnce(null as any);

      const res = await request(app).get(`/api/work/tasks/${UUID_1}`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app).get('/api/work/tasks/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================
  // POST /api/:context/tasks - Create Task
  // ===========================================

  describe('POST /api/:context/tasks', () => {
    it('should create a new task', async () => {
      mockCreateTask.mockResolvedValueOnce(sampleTask as any);

      const res = await request(app)
        .post('/api/work/tasks')
        .send({ title: 'Write tests', priority: 'high', project_id: UUID_2 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Write tests');
    });

    it('should require title', async () => {
      const res = await request(app)
        .post('/api/work/tasks')
        .send({ description: 'No title' });

      expect(res.status).toBe(400);
    });

    it('should reject empty title', async () => {
      const res = await request(app)
        .post('/api/work/tasks')
        .send({ title: '   ' });

      expect(res.status).toBe(400);
    });

    it('should trim title whitespace', async () => {
      mockCreateTask.mockResolvedValueOnce(sampleTask as any);

      await request(app)
        .post('/api/personal/tasks')
        .send({ title: '  Write tests  ' });

      expect(mockCreateTask).toHaveBeenCalledWith('personal', expect.objectContaining({
        title: 'Write tests',
      }));
    });

    it('should pass all optional fields', async () => {
      mockCreateTask.mockResolvedValueOnce(sampleTask as any);

      await request(app)
        .post('/api/work/tasks')
        .send({
          title: 'Full task',
          description: 'Desc',
          status: 'in_progress',
          priority: 'urgent',
          project_id: UUID_2,
          due_date: '2026-03-01T00:00:00Z',
          start_date: '2026-02-15T00:00:00Z',
          assignee: 'Alex',
          estimated_hours: 8,
          labels: ['frontend', 'urgent'],
          metadata: { sprint: 1 },
        });

      expect(mockCreateTask).toHaveBeenCalledWith('work', expect.objectContaining({
        title: 'Full task',
        description: 'Desc',
        status: 'in_progress',
        priority: 'urgent',
        assignee: 'Alex',
        estimated_hours: 8,
      }));
    });
  });

  // ===========================================
  // PUT /api/:context/tasks/:id - Update Task
  // ===========================================

  describe('PUT /api/:context/tasks/:id', () => {
    it('should update a task', async () => {
      const updated = { ...sampleTask, status: 'done' as const };
      mockUpdateTask.mockResolvedValueOnce(updated as any);

      const res = await request(app)
        .put(`/api/work/tasks/${UUID_1}`)
        .send({ status: 'done' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('done');
    });

    it('should return 404 for non-existent task', async () => {
      mockUpdateTask.mockResolvedValueOnce(null as any);

      const res = await request(app)
        .put(`/api/work/tasks/${UUID_1}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app)
        .put('/api/work/tasks/bad-id')
        .send({ title: 'Updated' });

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // DELETE /api/:context/tasks/:id
  // ===========================================

  describe('DELETE /api/:context/tasks/:id', () => {
    it('should cancel a task', async () => {
      mockDeleteTask.mockResolvedValueOnce(true as any);

      const res = await request(app).delete(`/api/work/tasks/${UUID_1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('cancelled');
    });

    it('should return 404 when task not found', async () => {
      mockDeleteTask.mockResolvedValueOnce(false as any);

      const res = await request(app).delete(`/api/work/tasks/${UUID_1}`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app).delete('/api/work/tasks/bad');

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // POST /api/:context/tasks/reorder
  // ===========================================

  describe('POST /api/:context/tasks/reorder', () => {
    it('should reorder tasks in a column', async () => {
      mockReorderTasks.mockResolvedValueOnce(undefined as any);

      const res = await request(app)
        .post('/api/work/tasks/reorder')
        .send({ status: 'todo', taskIds: [UUID_1, UUID_2, UUID_3] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockReorderTasks).toHaveBeenCalledWith('work', 'todo', [UUID_1, UUID_2, UUID_3]);
    });

    it('should reject invalid status', async () => {
      const res = await request(app)
        .post('/api/work/tasks/reorder')
        .send({ status: 'invalid', taskIds: [UUID_1] });

      expect(res.status).toBe(400);
    });

    it('should reject empty taskIds', async () => {
      const res = await request(app)
        .post('/api/work/tasks/reorder')
        .send({ status: 'todo', taskIds: [] });

      expect(res.status).toBe(400);
    });

    it('should reject missing taskIds', async () => {
      const res = await request(app)
        .post('/api/work/tasks/reorder')
        .send({ status: 'todo' });

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // POST /api/:context/tasks/from-idea/:ideaId
  // ===========================================

  describe('POST /api/:context/tasks/from-idea/:ideaId', () => {
    it('should convert idea to task', async () => {
      mockConvertIdeaToTask.mockResolvedValueOnce(sampleTask as any);

      const res = await request(app)
        .post(`/api/work/tasks/from-idea/${UUID_2}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockConvertIdeaToTask).toHaveBeenCalledWith('work', UUID_2, undefined);
    });

    it('should pass project_id to service', async () => {
      mockConvertIdeaToTask.mockResolvedValueOnce(sampleTask as any);

      await request(app)
        .post(`/api/work/tasks/from-idea/${UUID_2}`)
        .send({ project_id: UUID_3 });

      expect(mockConvertIdeaToTask).toHaveBeenCalledWith('work', UUID_2, UUID_3);
    });

    it('should reject invalid idea UUID', async () => {
      const res = await request(app)
        .post('/api/work/tasks/from-idea/bad-id')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Dependencies
  // ===========================================

  describe('GET /api/:context/tasks/:id/dependencies', () => {
    it('should return task dependencies', async () => {
      mockGetTaskDependencies.mockResolvedValueOnce([sampleDependency] as any);

      const res = await request(app).get(`/api/work/tasks/${UUID_1}/dependencies`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject invalid task UUID', async () => {
      const res = await request(app).get('/api/work/tasks/bad/dependencies');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/tasks/:id/dependencies', () => {
    it('should add a dependency', async () => {
      mockAddDependency.mockResolvedValueOnce(sampleDependency as any);

      const res = await request(app)
        .post(`/api/work/tasks/${UUID_1}/dependencies`)
        .send({ depends_on_id: UUID_2, dependency_type: 'finish_to_start' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockAddDependency).toHaveBeenCalledWith('work', UUID_1, UUID_2, 'finish_to_start');
    });

    it('should reject missing depends_on_id', async () => {
      const res = await request(app)
        .post(`/api/work/tasks/${UUID_1}/dependencies`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject self-dependency', async () => {
      const res = await request(app)
        .post(`/api/work/tasks/${UUID_1}/dependencies`)
        .send({ depends_on_id: UUID_1 });

      expect(res.status).toBe(400);
    });

    it('should reject invalid depends_on_id UUID', async () => {
      const res = await request(app)
        .post(`/api/work/tasks/${UUID_1}/dependencies`)
        .send({ depends_on_id: 'not-uuid' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/:context/tasks/:id/dependencies/:depId', () => {
    it('should remove a dependency', async () => {
      mockRemoveDependency.mockResolvedValueOnce(true as any);

      const res = await request(app).delete(`/api/work/tasks/${UUID_1}/dependencies/${UUID_3}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent dependency', async () => {
      mockRemoveDependency.mockResolvedValueOnce(false as any);

      const res = await request(app).delete(`/api/work/tasks/${UUID_1}/dependencies/${UUID_3}`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid dependency UUID', async () => {
      const res = await request(app).delete(`/api/work/tasks/${UUID_1}/dependencies/bad`);
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Context validation across all contexts
  // ===========================================

  describe('Context validation', () => {
    it.each(['personal', 'work', 'learning', 'creative'])('should accept context "%s"', async (ctx) => {
      mockGetTasks.mockResolvedValueOnce([] as any);

      const res = await request(app).get(`/api/${ctx}/tasks`);
      expect(res.status).toBe(200);
    });

    it.each(['invalid', 'admin', 'public', ''])('should reject invalid context "%s"', async (ctx) => {
      const res = await request(app).get(`/api/${ctx}/tasks`);
      expect([400, 404]).toContain(res.status);
    });
  });
});
