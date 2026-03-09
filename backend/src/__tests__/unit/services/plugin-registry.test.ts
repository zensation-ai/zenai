jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn(() => true),
}));

import { queryContext } from '../../../utils/database-context';
import {
  installPlugin,
  activatePlugin,
  deactivatePlugin,
  listPlugins,
  uninstallPlugin,
  getPlugin,
  updatePluginConfig,
  getActivePlugins,
} from '../../../services/plugins/plugin-registry';
import { PluginManifest } from '../../../services/plugins/plugin-types';

var mockQueryContext = queryContext as jest.Mock;

const sampleManifest: PluginManifest = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  description: 'A test plugin',
  author: 'Test',
  permissions: ['read_ideas'],
  entryPoints: [{ type: 'tool', toolName: 'test_tool', description: 'Test' }],
};

const sampleRow = {
  id: 'uuid-1',
  plugin_id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  status: 'inactive',
  config: {},
  manifest: sampleManifest,
  permissions: ['read_ideas'],
  error_message: null,
  installed_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('Plugin Registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('installPlugin', () => {
    test('inserts plugin and returns instance', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [sampleRow] });
      const result = await installPlugin('personal', sampleManifest);
      expect(result.pluginId).toBe('test-plugin');
      expect(result.status).toBe('inactive');
      expect(mockQueryContext).toHaveBeenCalledWith('personal', expect.stringContaining('INSERT'), expect.any(Array));
    });
  });

  describe('activatePlugin', () => {
    test('updates status to active', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...sampleRow, status: 'active' }] });
      const result = await activatePlugin('personal', 'test-plugin');
      expect(result.status).toBe('active');
    });
  });

  describe('deactivatePlugin', () => {
    test('updates status to inactive', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...sampleRow, status: 'inactive' }] });
      const result = await deactivatePlugin('personal', 'test-plugin');
      expect(result.status).toBe('inactive');
    });
  });

  describe('listPlugins', () => {
    test('returns all plugins', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [sampleRow, { ...sampleRow, id: 'uuid-2', plugin_id: 'p2', name: 'P2' }],
      });
      const result = await listPlugins('personal');
      expect(result).toHaveLength(2);
    });

    test('filters by status', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...sampleRow, status: 'active' }] });
      const result = await listPlugins('personal', 'active');
      expect(result).toHaveLength(1);
      expect(mockQueryContext).toHaveBeenCalledWith('personal', expect.stringContaining('status'), expect.arrayContaining(['active']));
    });
  });

  describe('getPlugin', () => {
    test('returns plugin if found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [sampleRow] });
      const result = await getPlugin('personal', 'test-plugin');
      expect(result).not.toBeNull();
      expect(result!.pluginId).toBe('test-plugin');
    });

    test('returns null if not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      const result = await getPlugin('personal', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('uninstallPlugin', () => {
    test('deletes plugin', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ plugin_id: 'test-plugin', name: 'Test Plugin' }] });
      await uninstallPlugin('personal', 'test-plugin');
      expect(mockQueryContext).toHaveBeenCalledWith('personal', expect.stringContaining('DELETE'), ['test-plugin']);
    });
  });

  describe('updatePluginConfig', () => {
    test('updates config', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...sampleRow, config: { key: 'value' } }] });
      const result = await updatePluginConfig('personal', 'test-plugin', { key: 'value' });
      expect(result.config).toEqual({ key: 'value' });
    });
  });

  describe('getActivePlugins', () => {
    test('returns empty map initially', () => {
      expect(getActivePlugins()).toEqual(new Map());
    });
  });
});
