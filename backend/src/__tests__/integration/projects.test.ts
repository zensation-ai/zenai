/**
 * Integration Tests for Projects API - Phase 37
 *
 * Tests the Projects router endpoints with mocked services.
 * Uses supertest to simulate HTTP requests.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { projectsRouter } from '../../routes/projects';

// Mock all external dependencies
jest.mock('../../services/projects', () => ({
  createProject: jest.fn(),
  getProjects: jest.fn(),
  getProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
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
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
} from '../../services/projects';
import { errorHandler } from '../../middleware/errorHandler';

var mockCreateProject = createProject as jest.MockedFunction<typeof createProject>;
var mockGetProjects = getProjects as jest.MockedFunction<typeof getProjects>;
var mockGetProject = getProject as jest.MockedFunction<typeof getProject>;
var mockUpdateProject = updateProject as jest.MockedFunction<typeof updateProject>;
var mockDeleteProject = deleteProject as jest.MockedFunction<typeof deleteProject>;

const UUID_1 = '550e8400-e29b-41d4-a716-446655440001';

const sampleProject = {
  id: UUID_1,
  name: 'Phase 37 Planner',
  description: 'Full planner implementation',
  color: '#4A90D9',
  icon: '📋',
  status: 'active' as const,
  context: 'work',
  sort_order: 0,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  task_count: 5,
};

describe('Projects API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', projectsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // GET /api/:context/projects
  // ===========================================

  describe('GET /api/:context/projects', () => {
    it('should return list of projects', async () => {
      mockGetProjects.mockResolvedValueOnce([sampleProject] as any);

      const res = await request(app).get('/api/work/projects');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Phase 37 Planner');
      expect(res.body.count).toBe(1);
    });

    it('should pass query filters', async () => {
      mockGetProjects.mockResolvedValueOnce([] as any);

      await request(app).get('/api/personal/projects').query({ status: 'active', limit: '50', offset: '5' });

      expect(mockGetProjects).toHaveBeenCalledWith('personal', expect.objectContaining({
        status: 'active',
        limit: 50,
        offset: 5,
      }));
    });

    it('should cap limit at 500', async () => {
      mockGetProjects.mockResolvedValueOnce([] as any);

      await request(app).get('/api/work/projects').query({ limit: '9999' });

      expect(mockGetProjects).toHaveBeenCalledWith('work', expect.objectContaining({ limit: 500 }));
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/projects');
      expect(res.status).toBe(400);
    });

    it('should return empty array when no projects', async () => {
      mockGetProjects.mockResolvedValueOnce([] as any);

      const res = await request(app).get('/api/creative/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ===========================================
  // GET /api/:context/projects/:id
  // ===========================================

  describe('GET /api/:context/projects/:id', () => {
    it('should return a single project', async () => {
      mockGetProject.mockResolvedValueOnce(sampleProject as any);

      const res = await request(app).get(`/api/work/projects/${UUID_1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(UUID_1);
    });

    it('should return 404 when project not found', async () => {
      mockGetProject.mockResolvedValueOnce(null as any);

      const res = await request(app).get(`/api/work/projects/${UUID_1}`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app).get('/api/work/projects/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // POST /api/:context/projects
  // ===========================================

  describe('POST /api/:context/projects', () => {
    it('should create a new project', async () => {
      mockCreateProject.mockResolvedValueOnce(sampleProject as any);

      const res = await request(app)
        .post('/api/work/projects')
        .send({ name: 'Phase 37 Planner', description: 'Full planner' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Phase 37 Planner');
    });

    it('should require name', async () => {
      const res = await request(app)
        .post('/api/work/projects')
        .send({ description: 'No name' });

      expect(res.status).toBe(400);
    });

    it('should reject empty name', async () => {
      const res = await request(app)
        .post('/api/work/projects')
        .send({ name: '   ' });

      expect(res.status).toBe(400);
    });

    it('should trim name whitespace', async () => {
      mockCreateProject.mockResolvedValueOnce(sampleProject as any);

      await request(app)
        .post('/api/personal/projects')
        .send({ name: '  My Project  ' });

      expect(mockCreateProject).toHaveBeenCalledWith('personal', expect.objectContaining({
        name: 'My Project',
      }));
    });

    it('should pass all optional fields', async () => {
      mockCreateProject.mockResolvedValueOnce(sampleProject as any);

      await request(app)
        .post('/api/work/projects')
        .send({
          name: 'Full project',
          description: 'Desc',
          color: '#FF0000',
          icon: '🚀',
          status: 'on_hold',
          sort_order: 5,
          metadata: { sprint: 1 },
        });

      expect(mockCreateProject).toHaveBeenCalledWith('work', expect.objectContaining({
        name: 'Full project',
        color: '#FF0000',
        icon: '🚀',
        status: 'on_hold',
        sort_order: 5,
      }));
    });
  });

  // ===========================================
  // PUT /api/:context/projects/:id
  // ===========================================

  describe('PUT /api/:context/projects/:id', () => {
    it('should update a project', async () => {
      const updated = { ...sampleProject, name: 'Updated' };
      mockUpdateProject.mockResolvedValueOnce(updated as any);

      const res = await request(app)
        .put(`/api/work/projects/${UUID_1}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated');
    });

    it('should return 404 for non-existent project', async () => {
      mockUpdateProject.mockResolvedValueOnce(null as any);

      const res = await request(app)
        .put(`/api/work/projects/${UUID_1}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app)
        .put('/api/work/projects/bad-id')
        .send({ name: 'Updated' });

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // DELETE /api/:context/projects/:id
  // ===========================================

  describe('DELETE /api/:context/projects/:id', () => {
    it('should archive a project', async () => {
      mockDeleteProject.mockResolvedValueOnce(true as any);

      const res = await request(app).delete(`/api/work/projects/${UUID_1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('archived');
    });

    it('should return 404 for non-existent project', async () => {
      mockDeleteProject.mockResolvedValueOnce(false as any);

      const res = await request(app).delete(`/api/work/projects/${UUID_1}`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app).delete('/api/work/projects/bad');
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Context validation
  // ===========================================

  describe('Context validation', () => {
    it.each(['personal', 'work', 'learning', 'creative'])('should accept context "%s"', async (ctx) => {
      mockGetProjects.mockResolvedValueOnce([] as any);

      const res = await request(app).get(`/api/${ctx}/projects`);
      expect(res.status).toBe(200);
    });

    it.each(['invalid', 'admin', 'public'])('should reject invalid context "%s"', async (ctx) => {
      const res = await request(app).get(`/api/${ctx}/projects`);
      expect([400, 404]).toContain(res.status);
    });
  });
});
