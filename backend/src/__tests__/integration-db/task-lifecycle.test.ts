/**
 * Phase 80: Task Lifecycle Integration Test
 *
 * Tests the task lifecycle: create, status changes, project assignment.
 * Uses supertest against the Express app with mocked services.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { tasksRouter } from '../../routes/tasks';
import { errorHandler } from '../../middleware/errorHandler';

// ============================================================
// Mocks
// ============================================================

const mockCreateTask = jest.fn();
const mockGetTasks = jest.fn();
const mockGetTask = jest.fn();
const mockUpdateTask = jest.fn();
const mockDeleteTask = jest.fn();
const mockReorderTasks = jest.fn();
const mockGetTasksForGantt = jest.fn();
const mockAddDependency = jest.fn();
const mockRemoveDependency = jest.fn();
const mockGetTaskDependencies = jest.fn();
const mockConvertIdeaToTask = jest.fn();

jest.mock('../../services/tasks', () => ({
  createTask: (...args: any[]) => mockCreateTask(...args),
  getTasks: (...args: any[]) => mockGetTasks(...args),
  getTask: (...args: any[]) => mockGetTask(...args),
  updateTask: (...args: any[]) => mockUpdateTask(...args),
  deleteTask: (...args: any[]) => mockDeleteTask(...args),
  reorderTasks: (...args: any[]) => mockReorderTasks(...args),
  getTasksForGantt: (...args: any[]) => mockGetTasksForGantt(...args),
  addDependency: (...args: any[]) => mockAddDependency(...args),
  removeDependency: (...args: any[]) => mockRemoveDependency(...args),
  getTaskDependencies: (...args: any[]) => mockGetTaskDependencies(...args),
  convertIdeaToTask: (...args: any[]) => mockConvertIdeaToTask(...args),
  TaskStatus: {},
}));

jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/validation', () => ({
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
  validateContextParam: jest.fn((ctx: string) => {
    if (!['personal', 'work', 'learning', 'creative'].includes(ctx)) {
      throw new Error(`Invalid context: ${ctx}`);
    }
    return ctx;
  }),
}));

jest.mock('../../utils/schemas', () => ({
  validateBody: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  CreateTaskSchema: {},
  UpdateTaskSchema: {},
}));

jest.mock('../../middleware/validate-params', () => ({
  requireUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../utils/response', () => ({
  sendData: jest.fn((res: any, data: any) => res.json({ success: true, data })),
  sendList: jest.fn((res: any, data: any) => res.json({ success: true, data })),
  sendMessage: jest.fn((res: any, msg: string) => res.json({ success: true, message: msg })),
  parsePagination: jest.fn(() => ({ limit: 50, offset: 0 })),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ============================================================
// Test Data
// ============================================================

const TEST_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEST_TASK_ID = '11111111-2222-3333-aaaa-555555555555';
const TEST_PROJECT_ID = '99999999-8888-3777-aaaa-555555555555';

const mockTask = {
  id: '11111111-2222-3333-aaaa-555555555555',
  title: 'Test Task',
  description: 'Test task description',
  status: 'todo' as const,
  priority: 'medium' as const,
  project_id: null,
  due_date: null,
  position: 0,
  user_id: TEST_USER_ID,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ============================================================
// Tests
// ============================================================

describe('Task Lifecycle Integration Tests', () => {
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

  describe('Create Task', () => {
    it('should create a task in personal context', async () => {
      mockCreateTask.mockResolvedValue(mockTask);

      const res = await request(app)
        .post('/api/personal/tasks')
        .send({ title: 'Test Task', priority: 'medium' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockCreateTask).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({ title: 'Test Task' }),
        TEST_USER_ID
      );
    });

    it('should create tasks across all contexts', async () => {
      for (const ctx of ['personal', 'work', 'learning', 'creative']) {
        mockCreateTask.mockResolvedValue({ ...mockTask, context: ctx });

        const res = await request(app)
          .post(`/api/${ctx}/tasks`)
          .send({ title: `Task in ${ctx}`, priority: 'high' });

        expect(res.status).toBe(200);
        expect(mockCreateTask).toHaveBeenCalledWith(
          ctx,
          expect.any(Object),
          TEST_USER_ID
        );
      }
    });

    it('should pass user_id to create function', async () => {
      mockCreateTask.mockResolvedValue(mockTask);

      await request(app)
        .post('/api/personal/tasks')
        .send({ title: 'User Task' });

      expect(mockCreateTask).toHaveBeenCalledWith(
        'personal',
        expect.any(Object),
        TEST_USER_ID
      );
    });
  });

  describe('Status Changes', () => {
    it('should update task status from todo to in_progress', async () => {
      mockUpdateTask.mockResolvedValue({ ...mockTask, status: 'in_progress' });

      const res = await request(app)
        .put(`/api/personal/tasks/${TEST_TASK_ID}`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(mockUpdateTask).toHaveBeenCalledWith(
        'personal',
        TEST_TASK_ID,
        expect.objectContaining({ status: 'in_progress' }),
        TEST_USER_ID
      );
    });

    it('should update task status from in_progress to done', async () => {
      mockUpdateTask.mockResolvedValue({ ...mockTask, status: 'done' });

      const res = await request(app)
        .put(`/api/personal/tasks/${TEST_TASK_ID}`)
        .send({ status: 'done' });

      expect(res.status).toBe(200);
    });
  });

  describe('Project Assignment', () => {
    it('should assign a task to a project', async () => {
      mockUpdateTask.mockResolvedValue({ ...mockTask, project_id: TEST_PROJECT_ID });

      const res = await request(app)
        .put(`/api/personal/tasks/${TEST_TASK_ID}`)
        .send({ project_id: TEST_PROJECT_ID });

      expect(res.status).toBe(200);
      expect(mockUpdateTask).toHaveBeenCalledWith(
        'personal',
        TEST_TASK_ID,
        expect.objectContaining({ project_id: TEST_PROJECT_ID }),
        TEST_USER_ID
      );
    });
  });

  describe('Delete Task', () => {
    it('should delete/cancel a task', async () => {
      mockDeleteTask.mockResolvedValue(true);

      const res = await request(app)
        .delete(`/api/personal/tasks/${TEST_TASK_ID}`);

      expect([200, 204]).toContain(res.status);
      expect(mockDeleteTask).toHaveBeenCalledWith(
        'personal',
        TEST_TASK_ID,
        TEST_USER_ID
      );
    });
  });

  describe('Kanban Reorder', () => {
    it('should reorder tasks in a status column', async () => {
      mockReorderTasks.mockResolvedValue(undefined);
      const taskIds = [
        '11111111-1111-1111-a111-111111111111',
        '22222222-2222-2222-a222-222222222222',
        '33333333-3333-3333-a333-333333333333',
      ];

      const res = await request(app)
        .post('/api/personal/tasks/reorder')
        .send({ status: 'todo', taskIds });

      expect(res.status).toBe(200);
      expect(mockReorderTasks).toHaveBeenCalledWith(
        'personal',
        'todo',
        taskIds,
        TEST_USER_ID
      );
    });

    it('should reject reorder with invalid status', async () => {
      const res = await request(app)
        .post('/api/personal/tasks/reorder')
        .send({ status: 'invalid', taskIds: ['11111111-1111-1111-a111-111111111111'] });

      expect([400, 422]).toContain(res.status);
    });

    it('should reject reorder with empty taskIds', async () => {
      const res = await request(app)
        .post('/api/personal/tasks/reorder')
        .send({ status: 'todo', taskIds: [] });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe('Gantt Data', () => {
    it('should return gantt data', async () => {
      mockGetTasksForGantt.mockResolvedValue({
        tasks: [mockTask],
        dependencies: [],
        projects: [],
      });

      const res = await request(app)
        .get('/api/personal/tasks/gantt');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('User isolation', () => {
    it('should always pass user_id to service functions', async () => {
      // Create
      mockCreateTask.mockResolvedValue(mockTask);
      await request(app).post('/api/personal/tasks').send({ title: 'Test' });
      expect(mockCreateTask).toHaveBeenCalledWith('personal', expect.any(Object), TEST_USER_ID);

      // Update
      mockUpdateTask.mockResolvedValue(mockTask);
      await request(app).put(`/api/personal/tasks/${TEST_TASK_ID}`).send({ title: 'Updated' });
      expect(mockUpdateTask).toHaveBeenCalledWith('personal', TEST_TASK_ID, expect.any(Object), TEST_USER_ID);

      // Delete
      mockDeleteTask.mockResolvedValue(true);
      await request(app).delete(`/api/personal/tasks/${TEST_TASK_ID}`);
      expect(mockDeleteTask).toHaveBeenCalledWith('personal', TEST_TASK_ID, TEST_USER_ID);

      // List gantt
      mockGetTasksForGantt.mockResolvedValue({ tasks: [], dependencies: [], projects: [] });
      await request(app).get('/api/personal/tasks/gantt');
      // When no project_id filter, the route passes undefined as the filter arg
      expect(mockGetTasksForGantt).toHaveBeenCalledWith('personal', undefined, TEST_USER_ID);
    });
  });
});
