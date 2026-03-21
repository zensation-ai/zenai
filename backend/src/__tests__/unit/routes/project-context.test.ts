/**
 * Project Context Route Tests
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockGenerateProjectContext = jest.fn();
const mockGetQuickProjectSummary = jest.fn();
const mockScanProjectStructure = jest.fn();
const mockFormatProjectContext = jest.fn();

jest.mock('../../../services/project-context', () => ({
  generateProjectContext: (...args: unknown[]) => mockGenerateProjectContext(...args),
  getQuickProjectSummary: (...args: unknown[]) => mockGetQuickProjectSummary(...args),
  scanProjectStructure: (...args: unknown[]) => mockScanProjectStructure(...args),
  formatProjectContext: (...args: unknown[]) => mockFormatProjectContext(...args),
}));

import projectContextRouter from '../../../routes/project-context';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Project Context Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/project', projectContextRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- Analyze ----

  describe('POST /api/project/analyze', () => {
    it('should analyze a project successfully', async () => {
      mockGenerateProjectContext.mockResolvedValueOnce({
        projectInfo: { name: 'test-project', type: 'typescript' },
        summary: 'A TypeScript project',
        keyFiles: ['src/index.ts'],
        techStack: ['TypeScript', 'Node.js'],
        focusAreas: ['backend'],
      });
      mockFormatProjectContext.mockReturnValueOnce('Formatted context');

      const res = await request(app)
        .post('/api/project/analyze')
        .send({ projectPath: '/home/user/project' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.projectInfo.name).toBe('test-project');
      expect(res.body.formatted).toBe('Formatted context');
    });

    it('should return 400 if projectPath is missing', async () => {
      const res = await request(app)
        .post('/api/project/analyze')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 for relative path', async () => {
      const res = await request(app)
        .post('/api/project/analyze')
        .send({ projectPath: 'relative/path' });

      expect(res.status).toBe(400);
    });

    it('should block access to restricted paths', async () => {
      const res = await request(app)
        .post('/api/project/analyze')
        .send({ projectPath: '/etc/passwd' });

      expect(res.status).toBe(400);
    });

    it('should reject paths with null bytes', async () => {
      const res = await request(app)
        .post('/api/project/analyze')
        .send({ projectPath: '/home/user\0/project' });

      expect(res.status).toBe(400);
    });
  });

  // ---- Summary ----

  describe('POST /api/project/summary', () => {
    it('should return a quick summary', async () => {
      mockGetQuickProjectSummary.mockResolvedValueOnce({
        name: 'my-app',
        type: 'react',
        description: 'A React app',
      });

      const res = await request(app)
        .post('/api/project/summary')
        .send({ projectPath: '/home/user/my-app' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.name).toBe('my-app');
    });

    it('should return 400 if projectPath missing', async () => {
      const res = await request(app)
        .post('/api/project/summary')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ---- Structure ----

  describe('POST /api/project/structure', () => {
    it('should return project file structure', async () => {
      mockScanProjectStructure.mockResolvedValueOnce({
        rootPath: '/home/user/project',
        totalFiles: 42,
        totalDirectories: 8,
        files: [{ path: 'src/index.ts', size: 1024 }],
        directories: [{ path: 'src', fileCount: 10 }],
      });

      const res = await request(app)
        .post('/api/project/structure')
        .send({ projectPath: '/home/user/project' });

      expect(res.status).toBe(200);
      expect(res.body.structure.totalFiles).toBe(42);
      expect(res.body.structure.totalDirectories).toBe(8);
    });

    it('should return 400 for missing path', async () => {
      const res = await request(app)
        .post('/api/project/structure')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ---- Health ----

  describe('GET /api/project/health', () => {
    it('should return service availability', async () => {
      const res = await request(app).get('/api/project/health');

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.service).toBe('project-context');
    });
  });
});
