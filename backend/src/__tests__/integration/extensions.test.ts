/**
 * Integration Tests for Extension System API
 *
 * Tests the extension marketplace and lifecycle routes:
 * - GET    /api/extensions           - List available extensions
 * - GET    /api/extensions/installed - List installed extensions
 * - GET    /api/extensions/:id       - Get extension details
 * - POST   /api/extensions/:id/install   - Install extension
 * - POST   /api/extensions/:id/uninstall - Uninstall extension
 * - POST   /api/extensions/:id/enable    - Enable extension
 * - POST   /api/extensions/:id/disable   - Disable extension
 * - POST   /api/extensions/:id/execute   - Execute extension action
 */

import express, { Express } from 'express';
import request from 'supertest';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockListExtensions = jest.fn();
const mockGetInstalledExtensions = jest.fn();
const mockGetExtension = jest.fn();
const mockInstallExtension = jest.fn();
const mockUninstallExtension = jest.fn();
const mockEnableExtension = jest.fn();
const mockDisableExtension = jest.fn();

jest.mock('../../services/extensions/extension-registry', () => ({
  getExtensionRegistry: jest.fn(() => ({
    listExtensions: mockListExtensions,
    getInstalledExtensions: mockGetInstalledExtensions,
    getExtension: mockGetExtension,
    installExtension: mockInstallExtension,
    uninstallExtension: mockUninstallExtension,
    enableExtension: mockEnableExtension,
    disableExtension: mockDisableExtension,
  })),
}));

const mockExecute = jest.fn();
jest.mock('../../services/extensions/extension-sandbox', () => ({
  getExtensionSandbox: jest.fn(() => ({
    execute: mockExecute,
  })),
}));

import { errorHandler } from '../../middleware/errorHandler';

// Dynamic import after mocks
let extensionsRouter: any;

describe('Extensions API Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    const mod = await import('../../routes/extensions');
    extensionsRouter = mod.default || mod.extensionsRouter || mod;
    // The module exports default Router
    app = express();
    app.use(express.json());
    app.use('/api/extensions', extensionsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // GET /api/extensions - List Available
  // ============================================================

  describe('GET /api/extensions', () => {
    it('should list all available extensions', async () => {
      const mockExts = [
        { id: 'pomodoro', name: 'Pomodoro Timer', type: 'tool', category: 'productivity' },
        { id: 'markdown-export', name: 'Markdown Export', type: 'tool', category: 'developer' },
      ];
      mockListExtensions.mockResolvedValueOnce(mockExts);

      const response = await request(app)
        .get('/api/extensions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('should filter by type parameter', async () => {
      mockListExtensions.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/extensions?type=tool')
        .expect(200);

      expect(mockListExtensions).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: 'tool' }),
      );
    });

    it('should filter by category parameter', async () => {
      mockListExtensions.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/extensions?category=productivity')
        .expect(200);

      expect(mockListExtensions).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ category: 'productivity' }),
      );
    });

    it('should ignore invalid type values', async () => {
      mockListExtensions.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/extensions?type=invalid_type')
        .expect(200);

      expect(mockListExtensions).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: undefined }),
      );
    });

    it('should return empty array when no extensions found', async () => {
      mockListExtensions.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/extensions')
        .expect(200);

      expect(response.body.data).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });
  });

  // ============================================================
  // GET /api/extensions/installed
  // ============================================================

  describe('GET /api/extensions/installed', () => {
    it('should list installed extensions for user', async () => {
      const installed = [{ id: 'pomodoro', enabled: true }];
      mockGetInstalledExtensions.mockResolvedValueOnce(installed);

      const response = await request(app)
        .get('/api/extensions/installed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  // ============================================================
  // GET /api/extensions/:id
  // ============================================================

  describe('GET /api/extensions/:id', () => {
    it('should return extension details', async () => {
      const ext = { id: 'pomodoro', name: 'Pomodoro Timer', version: '1.0.0' };
      mockGetExtension.mockResolvedValueOnce(ext);

      const response = await request(app)
        .get('/api/extensions/pomodoro')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', 'pomodoro');
    });

    it('should return 404 for non-existent extension', async () => {
      mockGetExtension.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/extensions/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /api/extensions/:id/install
  // ============================================================

  describe('POST /api/extensions/:id/install', () => {
    it('should install extension with permissions', async () => {
      const userExt = { extensionId: 'pomodoro', enabled: true, permissions: ['storage'] };
      mockInstallExtension.mockResolvedValueOnce(userExt);

      const response = await request(app)
        .post('/api/extensions/pomodoro/install')
        .send({ permissions: ['storage'] })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('extensionId', 'pomodoro');
    });

    it('should reject missing permissions array', async () => {
      const response = await request(app)
        .post('/api/extensions/pomodoro/install')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('permissions');
    });

    it('should return 404 if extension not found during install', async () => {
      mockInstallExtension.mockRejectedValueOnce(new Error('Extension not found'));

      const response = await request(app)
        .post('/api/extensions/nonexistent/install')
        .send({ permissions: [] })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 409 if already installed', async () => {
      mockInstallExtension.mockRejectedValueOnce(new Error('Extension already installed'));

      const response = await request(app)
        .post('/api/extensions/pomodoro/install')
        .send({ permissions: [] })
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /api/extensions/:id/uninstall
  // ============================================================

  describe('POST /api/extensions/:id/uninstall', () => {
    it('should uninstall extension', async () => {
      mockUninstallExtension.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/extensions/pomodoro/uninstall')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 if extension not installed', async () => {
      mockUninstallExtension.mockRejectedValueOnce(new Error('Not installed'));

      const response = await request(app)
        .post('/api/extensions/pomodoro/uninstall')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /api/extensions/:id/enable & /disable
  // ============================================================

  describe('POST /api/extensions/:id/enable', () => {
    it('should enable an installed extension', async () => {
      mockEnableExtension.mockResolvedValueOnce({ id: 'pomodoro', enabled: true });

      const response = await request(app)
        .post('/api/extensions/pomodoro/enable')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/extensions/:id/disable', () => {
    it('should disable an installed extension', async () => {
      mockDisableExtension.mockResolvedValueOnce({ id: 'pomodoro', enabled: false });

      const response = await request(app)
        .post('/api/extensions/pomodoro/disable')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
