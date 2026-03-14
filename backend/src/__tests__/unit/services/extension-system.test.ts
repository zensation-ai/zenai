/**
 * Phase 75: Extension System Tests
 *
 * Tests for Extension Registry, Sandbox, and Routes.
 */

import express from 'express';
import request from 'supertest';

// ===========================================
// Mocks
// ===========================================

const mockPoolQuery = jest.fn();

jest.mock('../../../utils/database-context', () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

jest.mock('../../../middleware/jwt-auth', () => ({
  jwtAuth: (_req: any, _res: any, next: any) => {
    _req.jwtUser = { id: 'user-001', email: 'test@test.com', role: 'admin' };
    _req.user = { id: 'user-001', provider: 'jwt' };
    _req.apiKey = { id: 'jwt:user-001', name: 'JWT:test@test.com', scopes: ['read', 'write', 'admin'], rateLimit: 1000 };
    next();
  },
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => 'user-001',
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

// Import after mocks
import {
  getExtensionRegistry,
  resetExtensionRegistry,
  CATALOG,
} from '../../../services/extensions/extension-registry';
import {
  getExtensionSandbox,
  resetExtensionSandbox,
} from '../../../services/extensions/extension-sandbox';
import { extensionsRouter } from '../../../routes/extensions';
import { errorHandler } from '../../../middleware/errorHandler';

// ===========================================
// Test Setup
// ===========================================

let app: express.Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/extensions', extensionsRouter);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPoolQuery.mockReset();
  resetExtensionRegistry();
  resetExtensionSandbox();
});

// ===========================================
// Extension Registry Tests
// ===========================================

describe('ExtensionRegistry', () => {
  describe('CATALOG', () => {
    it('should have 5 built-in extensions', () => {
      expect(CATALOG).toHaveLength(5);
    });

    it('should include all extension types', () => {
      const types = CATALOG.map(e => e.type);
      expect(types).toContain('widget');
      expect(types).toContain('theme');
      expect(types).toContain('integration');
      expect(types).toContain('tool');
      expect(types).toContain('agent');
    });

    it('should have valid manifest for each extension', () => {
      for (const ext of CATALOG) {
        expect(ext.manifest).toBeDefined();
        expect(ext.manifest.name).toBeTruthy();
        expect(ext.manifest.description).toBeTruthy();
        expect(ext.manifest.permissions).toBeInstanceOf(Array);
      }
    });
  });

  describe('listExtensions', () => {
    it('should list built-in extensions when DB is unavailable', async () => {
      mockPoolQuery.mockRejectedValue(new Error('table not found'));

      const registry = getExtensionRegistry();
      const result = await registry.listExtensions('user-001');

      expect(result).toHaveLength(5);
      expect(result[0]).toHaveProperty('installed');
      expect(result[0]).toHaveProperty('enabled');
    });

    it('should merge DB extensions with built-in catalog', async () => {
      // First call: DB extensions query
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ext-custom',
          name: 'Custom Extension',
          version: '1.0.0',
          type: 'tool',
          manifest: { name: 'Custom', description: 'A custom ext', permissions: [], icon: 'star', type: 'tool', category: 'productivity', author: 'User', version: '1.0.0', entry_point: 'custom' },
          entry_point: 'custom',
          permissions: [],
          author: 'User',
          category: 'productivity',
          created_at: '2026-01-01T00:00:00Z',
        }],
      });
      // Second call: user extensions query
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const registry = getExtensionRegistry();
      const result = await registry.listExtensions('user-001');

      expect(result).toHaveLength(6); // 5 built-in + 1 custom
    });

    it('should filter by type', async () => {
      mockPoolQuery.mockRejectedValue(new Error('table not found'));

      const registry = getExtensionRegistry();
      const result = await registry.listExtensions('user-001', { type: 'widget' });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('widget');
    });

    it('should filter by search query', async () => {
      mockPoolQuery.mockRejectedValue(new Error('table not found'));

      const registry = getExtensionRegistry();
      const result = await registry.listExtensions('user-001', { search: 'pomodoro' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Pomodoro Timer');
    });

    it('should mark installed extensions', async () => {
      // DB extensions
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      // User installs
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          extension_id: 'ext-pomodoro-timer',
          enabled: true,
          installed_at: '2026-03-01T00:00:00Z',
          permissions_granted: ['tasks.read'],
        }],
      });

      const registry = getExtensionRegistry();
      const result = await registry.listExtensions('user-001');

      const pomodoro = result.find(e => e.id === 'ext-pomodoro-timer');
      expect(pomodoro?.installed).toBe(true);
      expect(pomodoro?.enabled).toBe(true);
    });
  });

  describe('getExtension', () => {
    it('should return built-in extension by ID', async () => {
      const registry = getExtensionRegistry();
      const ext = await registry.getExtension('ext-pomodoro-timer');

      expect(ext).toBeDefined();
      expect(ext?.name).toBe('Pomodoro Timer');
    });

    it('should return null for unknown extension', async () => {
      mockPoolQuery.mockRejectedValue(new Error('not found'));

      const registry = getExtensionRegistry();
      const ext = await registry.getExtension('ext-nonexistent');

      expect(ext).toBeNull();
    });
  });

  describe('installExtension', () => {
    it('should install an extension', async () => {
      // INSERT ... ON CONFLICT DO NOTHING RETURNING * - returns the row if inserted
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1234',
          user_id: 'user-001',
          extension_id: 'ext-pomodoro-timer',
          enabled: true,
          permissions_granted: ['tasks.read'],
          installed_at: '2026-03-14T00:00:00Z',
        }],
      });

      const registry = getExtensionRegistry();
      const result = await registry.installExtension('user-001', 'ext-pomodoro-timer', ['tasks.read']);

      expect(result.extension_id).toBe('ext-pomodoro-timer');
      expect(result.enabled).toBe(true);
    });

    it('should reject invalid permissions', async () => {
      const registry = getExtensionRegistry();

      await expect(
        registry.installExtension('user-001', 'ext-pomodoro-timer', ['invalid.perm'])
      ).rejects.toThrow('Invalid permissions');
    });

    it('should reject if already installed', async () => {
      // ON CONFLICT DO NOTHING returns empty rows when already installed
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const registry = getExtensionRegistry();

      await expect(
        registry.installExtension('user-001', 'ext-pomodoro-timer', ['tasks.read'])
      ).rejects.toThrow('already installed');
    });

    it('should reject unknown extension', async () => {
      mockPoolQuery.mockRejectedValue(new Error('not found'));

      const registry = getExtensionRegistry();

      await expect(
        registry.installExtension('user-001', 'ext-nonexistent', [])
      ).rejects.toThrow('Extension not found');
    });
  });

  describe('uninstallExtension', () => {
    it('should uninstall an extension', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      const registry = getExtensionRegistry();
      await expect(
        registry.uninstallExtension('user-001', 'ext-pomodoro-timer')
      ).resolves.toBeUndefined();
    });

    it('should throw if not installed', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });

      const registry = getExtensionRegistry();
      await expect(
        registry.uninstallExtension('user-001', 'ext-nonexistent')
      ).rejects.toThrow('not installed');
    });
  });

  describe('enableExtension / disableExtension', () => {
    it('should enable an extension', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ue-1',
          user_id: 'user-001',
          extension_id: 'ext-pomodoro-timer',
          enabled: true,
          permissions_granted: [],
          installed_at: '2026-03-14T00:00:00Z',
        }],
      });

      const registry = getExtensionRegistry();
      const result = await registry.enableExtension('user-001', 'ext-pomodoro-timer');

      expect(result.enabled).toBe(true);
    });

    it('should disable an extension', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ue-1',
          user_id: 'user-001',
          extension_id: 'ext-pomodoro-timer',
          enabled: false,
          permissions_granted: [],
          installed_at: '2026-03-14T00:00:00Z',
        }],
      });

      const registry = getExtensionRegistry();
      const result = await registry.disableExtension('user-001', 'ext-pomodoro-timer');

      expect(result.enabled).toBe(false);
    });

    it('should throw if not installed', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const registry = getExtensionRegistry();
      await expect(
        registry.enableExtension('user-001', 'ext-nonexistent')
      ).rejects.toThrow('not installed');
    });
  });
});

// ===========================================
// Extension Sandbox Tests
// ===========================================

describe('ExtensionSandbox', () => {
  describe('executeExtension', () => {
    it('should execute with valid permissions', async () => {
      // Log insert
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const sandbox = getExtensionSandbox();
      const result = await sandbox.executeExtension({
        extensionId: 'ext-pomodoro-timer',
        action: 'start',
        params: { duration: 25 },
        userId: 'user-001',
        permissionsGranted: ['tasks.read', 'notifications.send'],
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should reject with missing permissions', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const sandbox = getExtensionSandbox();
      const result = await sandbox.executeExtension({
        extensionId: 'ext-pomodoro-timer',
        action: 'start',
        params: {},
        userId: 'user-001',
        permissionsGranted: [], // Missing required permissions
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing permissions');
    });

    it('should return error for unknown extension', async () => {
      const sandbox = getExtensionSandbox();
      mockPoolQuery.mockRejectedValue(new Error('not found'));

      const result = await sandbox.executeExtension({
        extensionId: 'ext-nonexistent',
        action: 'test',
        params: {},
        userId: 'user-001',
        permissionsGranted: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should enforce rate limiting', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const sandbox = getExtensionSandbox();

      // Execute many times rapidly
      const results: boolean[] = [];
      for (let i = 0; i < 105; i++) {
        const r = await sandbox.executeExtension({
          extensionId: 'ext-dark-code-theme',
          action: 'apply',
          params: {},
          userId: 'rate-limit-test',
          permissionsGranted: ['ui.theme'],
        });
        results.push(r.success);
      }

      // Should have at least one failure due to rate limit
      expect(results.filter(r => !r).length).toBeGreaterThan(0);
    });
  });
});

// ===========================================
// Route Tests
// ===========================================

describe('Extension Routes', () => {
  describe('GET /api/extensions', () => {
    it('should list all extensions', async () => {
      mockPoolQuery.mockRejectedValue(new Error('no table'));

      const res = await request(app).get('/api/extensions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);
    });

    it('should filter by type', async () => {
      mockPoolQuery.mockRejectedValue(new Error('no table'));

      const res = await request(app).get('/api/extensions?type=agent');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('agent');
    });

    it('should filter by search', async () => {
      mockPoolQuery.mockRejectedValue(new Error('no table'));

      const res = await request(app).get('/api/extensions?search=github');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('GitHub Commits');
    });
  });

  describe('GET /api/extensions/installed', () => {
    it('should return empty when no extensions installed', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/extensions/installed');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('should return installed extensions', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ue-1',
          user_id: 'user-001',
          extension_id: 'ext-pomodoro-timer',
          enabled: true,
          permissions_granted: ['tasks.read'],
          installed_at: '2026-03-14T00:00:00Z',
        }],
      });

      const res = await request(app).get('/api/extensions/installed');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Pomodoro Timer');
    });
  });

  describe('GET /api/extensions/:id', () => {
    it('should return extension details', async () => {
      const res = await request(app).get('/api/extensions/ext-ai-summarizer');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('AI Summarizer');
    });

    it('should return 404 for unknown extension', async () => {
      mockPoolQuery.mockRejectedValue(new Error('not found'));

      const res = await request(app).get('/api/extensions/ext-nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/extensions/:id/install', () => {
    it('should install extension with permissions', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'test-uuid-1234',
            user_id: 'user-001',
            extension_id: 'ext-pomodoro-timer',
            enabled: true,
            permissions_granted: ['tasks.read'],
            installed_at: '2026-03-14T00:00:00Z',
          }],
        });

      const res = await request(app)
        .post('/api/extensions/ext-pomodoro-timer/install')
        .send({ permissions: ['tasks.read'] });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should reject without permissions array', async () => {
      const res = await request(app)
        .post('/api/extensions/ext-pomodoro-timer/install')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('permissions');
    });

    it('should return 409 if already installed', async () => {
      // ON CONFLICT DO NOTHING returns empty rows when already installed
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/extensions/ext-pomodoro-timer/install')
        .send({ permissions: ['tasks.read'] });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/extensions/:id/uninstall', () => {
    it('should uninstall extension', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .post('/api/extensions/ext-pomodoro-timer/uninstall');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 if not installed', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });

      const res = await request(app)
        .post('/api/extensions/ext-nonexistent/uninstall');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/extensions/:id/enable', () => {
    it('should enable extension', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ue-1',
          enabled: true,
          extension_id: 'ext-pomodoro-timer',
        }],
      });

      const res = await request(app)
        .post('/api/extensions/ext-pomodoro-timer/enable');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/extensions/:id/disable', () => {
    it('should disable extension', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ue-1',
          enabled: false,
          extension_id: 'ext-pomodoro-timer',
        }],
      });

      const res = await request(app)
        .post('/api/extensions/ext-pomodoro-timer/disable');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/extensions/:id/execute', () => {
    it('should reject without action', async () => {
      const res = await request(app)
        .post('/api/extensions/ext-pomodoro-timer/execute')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('action');
    });

    it('should reject for uninstalled extension', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // getInstalledExtensions

      const res = await request(app)
        .post('/api/extensions/ext-pomodoro-timer/execute')
        .send({ action: 'start', params: {} });

      expect(res.status).toBe(404);
    });
  });
});
