/**
 * Plugin System Route Tests
 *
 * Tests the REST API for plugin management.
 */

import express from 'express';
import request from 'supertest';
import { pluginsRouter } from '../../../routes/plugins';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock plugin-registry service
const mockInstallPlugin = jest.fn();
const mockActivatePlugin = jest.fn();
const mockDeactivatePlugin = jest.fn();
const mockUninstallPlugin = jest.fn();
const mockGetPlugin = jest.fn();
const mockListPlugins = jest.fn();
const mockUpdatePluginConfig = jest.fn();

jest.mock('../../../services/plugins/plugin-registry', () => ({
  installPlugin: (...args: unknown[]) => mockInstallPlugin(...args),
  activatePlugin: (...args: unknown[]) => mockActivatePlugin(...args),
  deactivatePlugin: (...args: unknown[]) => mockDeactivatePlugin(...args),
  uninstallPlugin: (...args: unknown[]) => mockUninstallPlugin(...args),
  getPlugin: (...args: unknown[]) => mockGetPlugin(...args),
  listPlugins: (...args: unknown[]) => mockListPlugins(...args),
  updatePluginConfig: (...args: unknown[]) => mockUpdatePluginConfig(...args),
}));

// Mock plugin-types
jest.mock('../../../services/plugins/plugin-types', () => ({
  PluginStatus: {},
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Plugin System Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', pluginsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockListPlugins.mockResolvedValue([
      { id: 'pomodoro-timer', name: 'Pomodoro Timer', status: 'active' },
    ]);
    mockGetPlugin.mockResolvedValue({ id: 'pomodoro-timer', name: 'Pomodoro Timer', status: 'active' });
    mockInstallPlugin.mockResolvedValue({ id: 'new-plugin', name: 'New Plugin', status: 'inactive' });
    mockActivatePlugin.mockResolvedValue({ id: 'p1', status: 'active' });
    mockDeactivatePlugin.mockResolvedValue({ id: 'p1', status: 'inactive' });
    mockUninstallPlugin.mockResolvedValue(undefined);
    mockUpdatePluginConfig.mockResolvedValue({ id: 'p1', config: { key: 'value' } });
  });

  // ===========================================
  // List Plugins
  // ===========================================

  describe('GET /api/:context/plugins', () => {
    it('should list installed plugins', async () => {
      const res = await request(app).get('/api/personal/plugins');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/plugins');
      expect(res.status).toBe(400);
    });

    it('should reject invalid status filter', async () => {
      const res = await request(app).get('/api/personal/plugins?status=bad');
      expect(res.status).toBe(400);
    });

    it('should pass status filter to service', async () => {
      await request(app).get('/api/personal/plugins?status=active');
      expect(mockListPlugins).toHaveBeenCalledWith('personal', 'active');
    });
  });

  // ===========================================
  // Marketplace
  // ===========================================

  describe('GET /api/:context/plugins/marketplace', () => {
    it('should return marketplace plugins', async () => {
      const res = await request(app).get('/api/personal/plugins/marketplace');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('name');
    });
  });

  // ===========================================
  // Get Single Plugin
  // ===========================================

  describe('GET /api/:context/plugins/:id', () => {
    it('should return plugin details', async () => {
      const res = await request(app).get('/api/personal/plugins/pomodoro-timer');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('pomodoro-timer');
    });

    it('should return 404 for non-existent plugin', async () => {
      mockGetPlugin.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/personal/plugins/unknown');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Install Plugin
  // ===========================================

  describe('POST /api/:context/plugins', () => {
    const validManifest = { id: 'test-plugin', name: 'Test', version: '1.0.0' };

    it('should install a new plugin', async () => {
      mockGetPlugin.mockResolvedValueOnce(null); // not already installed
      const res = await request(app)
        .post('/api/personal/plugins')
        .send({ manifest: validManifest });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 409 if plugin already installed', async () => {
      const res = await request(app)
        .post('/api/personal/plugins')
        .send({ manifest: validManifest });
      expect(res.status).toBe(409);
    });

    it('should return 400 for invalid manifest', async () => {
      const res = await request(app)
        .post('/api/personal/plugins')
        .send({ manifest: { id: 'x' } }); // missing name and version
      expect(res.status).toBe(400);
    });

    it('should return 400 when manifest is missing', async () => {
      const res = await request(app)
        .post('/api/personal/plugins')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Activate/Deactivate
  // ===========================================

  describe('PUT /api/:context/plugins/:id/activate', () => {
    it('should activate a plugin', async () => {
      const res = await request(app).put('/api/personal/plugins/pomodoro-timer/activate');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 if plugin not found', async () => {
      mockActivatePlugin.mockRejectedValueOnce(new Error('Plugin not found'));
      const res = await request(app).put('/api/personal/plugins/unknown/activate');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/:context/plugins/:id/deactivate', () => {
    it('should deactivate a plugin', async () => {
      const res = await request(app).put('/api/personal/plugins/pomodoro-timer/deactivate');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 if plugin not found', async () => {
      mockDeactivatePlugin.mockRejectedValueOnce(new Error('Plugin not found'));
      const res = await request(app).put('/api/personal/plugins/unknown/deactivate');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Config
  // ===========================================

  describe('PUT /api/:context/plugins/:id/config', () => {
    it('should update plugin config', async () => {
      const res = await request(app)
        .put('/api/personal/plugins/pomodoro-timer/config')
        .send({ config: { interval: 25 } });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for invalid config', async () => {
      const res = await request(app)
        .put('/api/personal/plugins/pomodoro-timer/config')
        .send({ config: 'not-an-object' });
      expect(res.status).toBe(400);
    });

    it('should return 404 if plugin not found', async () => {
      mockUpdatePluginConfig.mockRejectedValueOnce(new Error('Plugin not found'));
      const res = await request(app)
        .put('/api/personal/plugins/unknown/config')
        .send({ config: { key: 'val' } });
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Uninstall
  // ===========================================

  describe('DELETE /api/:context/plugins/:id', () => {
    it('should uninstall a plugin', async () => {
      const res = await request(app).delete('/api/personal/plugins/pomodoro-timer');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Plugin uninstalled');
    });

    it('should return 404 if plugin not found', async () => {
      mockUninstallPlugin.mockRejectedValueOnce(new Error('Plugin not found'));
      const res = await request(app).delete('/api/personal/plugins/unknown');
      expect(res.status).toBe(404);
    });
  });
});
