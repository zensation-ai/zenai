/**
 * Unit Tests for MCP Discovery Service (Phase 71)
 *
 * Tests the built-in catalog, search, filtering, and auto-config features.
 */

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  mcpDiscoveryService,
  MCP_SERVER_CATALOG,
  ALL_CATEGORIES,
  MCPServerCategory,
} from '../../../services/mcp/mcp-discovery';
import { mcpAutoConfigService, SETUP_TEMPLATES } from '../../../services/mcp/mcp-auto-config';

// ===========================================
// Discovery Service Tests
// ===========================================

describe('MCP Discovery Service', () => {
  describe('catalog', () => {
    it('should have 8 servers in the catalog', () => {
      expect(MCP_SERVER_CATALOG.length).toBe(8);
    });

    it('should have all required fields for each server', () => {
      for (const server of MCP_SERVER_CATALOG) {
        expect(server.name).toBeTruthy();
        expect(server.displayName).toBeTruthy();
        expect(server.description).toBeTruthy();
        expect(ALL_CATEGORIES).toContain(server.category);
        expect(server.repoUrl).toBeTruthy();
        expect(typeof server.popularity).toBe('number');
        expect(server.popularity).toBeGreaterThanOrEqual(0);
        expect(server.popularity).toBeLessThanOrEqual(100);
        expect(typeof server.estimatedTools).toBe('number');
        expect(typeof server.premium).toBe('boolean');
        expect(Array.isArray(server.requiredCredentials)).toBe(true);
      }
    });

    it('should include the 8 priority servers', () => {
      const names = MCP_SERVER_CATALOG.map(s => s.name);
      expect(names).toContain('slack');
      expect(names).toContain('google-drive');
      expect(names).toContain('github');
      expect(names).toContain('linear');
      expect(names).toContain('notion');
      expect(names).toContain('google-calendar');
      expect(names).toContain('figma');
      expect(names).toContain('hubspot');
    });

    it('should have 6 categories', () => {
      expect(ALL_CATEGORIES.length).toBe(6);
      expect(ALL_CATEGORIES).toEqual([
        'communication',
        'productivity',
        'development',
        'design',
        'crm',
        'storage',
      ]);
    });
  });

  describe('discoverServers', () => {
    it('should return all servers when no filters', () => {
      const result = mcpDiscoveryService.discoverServers();
      expect(result.servers.length).toBe(8);
      expect(result.total).toBe(8);
      expect(result.categories).toEqual(ALL_CATEGORIES);
    });

    it('should sort by popularity descending', () => {
      const result = mcpDiscoveryService.discoverServers();
      for (let i = 1; i < result.servers.length; i++) {
        expect(result.servers[i - 1].popularity).toBeGreaterThanOrEqual(result.servers[i].popularity);
      }
    });

    it('should filter by category', () => {
      const result = mcpDiscoveryService.discoverServers(undefined, 'development');
      expect(result.servers.length).toBeGreaterThan(0);
      for (const server of result.servers) {
        expect(server.category).toBe('development');
      }
    });

    it('should filter by communication category', () => {
      const result = mcpDiscoveryService.discoverServers(undefined, 'communication');
      expect(result.servers.length).toBeGreaterThan(0);
      expect(result.servers.some(s => s.name === 'slack')).toBe(true);
    });

    it('should filter by query', () => {
      const result = mcpDiscoveryService.discoverServers('github');
      expect(result.servers.length).toBeGreaterThan(0);
      expect(result.servers[0].name).toBe('github');
    });

    it('should filter by query and category combined', () => {
      const result = mcpDiscoveryService.discoverServers('calendar', 'productivity');
      expect(result.servers.length).toBeGreaterThan(0);
      expect(result.servers[0].name).toBe('google-calendar');
    });

    it('should return empty for no matching query', () => {
      const result = mcpDiscoveryService.discoverServers('nonexistent-xyz-server');
      expect(result.servers.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle empty query string', () => {
      const result = mcpDiscoveryService.discoverServers('');
      expect(result.servers.length).toBe(8);
    });

    it('should handle invalid category gracefully', () => {
      const result = mcpDiscoveryService.discoverServers(undefined, 'invalid' as MCPServerCategory);
      // Invalid category is not in ALL_CATEGORIES, so no filter is applied
      expect(result.servers.length).toBe(8);
    });
  });

  describe('searchServers', () => {
    it('should search by display name', () => {
      const results = mcpDiscoveryService.searchServers('Slack');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('slack');
    });

    it('should search by description keywords', () => {
      const results = mcpDiscoveryService.searchServers('issues');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(s => s.name === 'github')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const results = mcpDiscoveryService.searchServers('NOTION');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('notion');
    });

    it('should search by npm package name', () => {
      const results = mcpDiscoveryService.searchServers('server-slack');
      expect(results.length).toBe(1);
    });

    it('should return all for empty query', () => {
      const results = mcpDiscoveryService.searchServers('');
      expect(results.length).toBe(8);
    });
  });

  describe('getByName', () => {
    it('should return server by name', () => {
      const server = mcpDiscoveryService.getByName('github');
      expect(server).not.toBeNull();
      expect(server?.displayName).toBe('GitHub');
    });

    it('should return null for unknown name', () => {
      const server = mcpDiscoveryService.getByName('nonexistent');
      expect(server).toBeNull();
    });
  });

  describe('getCategories', () => {
    it('should return all categories', () => {
      const categories = mcpDiscoveryService.getCategories();
      expect(categories.length).toBe(6);
    });
  });
});

// ===========================================
// Auto-Config Service Tests
// ===========================================

describe('MCP Auto-Config Service', () => {
  describe('getSetupTemplate', () => {
    it('should return template for known server', () => {
      const template = mcpAutoConfigService.getSetupTemplate('github');
      expect(template).not.toBeNull();
      expect(template?.name).toBe('github');
      expect(template?.transport).toBe('stdio');
      expect(template?.command).toBe('npx');
      expect(template?.args).toContain('@modelcontextprotocol/server-github');
    });

    it('should return null for unknown server', () => {
      const template = mcpAutoConfigService.getSetupTemplate('nonexistent');
      expect(template).toBeNull();
    });

    it('should have templates for all 8 priority servers', () => {
      const names = ['slack', 'google-drive', 'github', 'linear', 'notion', 'google-calendar', 'figma', 'hubspot'];
      for (const name of names) {
        const template = mcpAutoConfigService.getSetupTemplate(name);
        expect(template).not.toBeNull();
      }
    });

    it('should return a copy (not a reference)', () => {
      const t1 = mcpAutoConfigService.getSetupTemplate('github');
      const t2 = mcpAutoConfigService.getSetupTemplate('github');
      expect(t1).toEqual(t2);
      expect(t1).not.toBe(t2);
    });
  });

  describe('validateCredentials', () => {
    it('should validate required credentials', () => {
      const result = mcpAutoConfigService.validateCredentials('github', {});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should pass with valid credentials', () => {
      const result = mcpAutoConfigService.validateCredentials('github', {
        GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test123',
      });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject empty credential values', () => {
      const result = mcpAutoConfigService.validateCredentials('github', {
        GITHUB_PERSONAL_ACCESS_TOKEN: '  ',
      });
      expect(result.valid).toBe(false);
    });

    it('should return error for unknown server', () => {
      const result = mcpAutoConfigService.validateCredentials('nonexistent', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Unknown server');
    });

    it('should validate multiple required credentials', () => {
      const result = mcpAutoConfigService.validateCredentials('google-drive', {
        GOOGLE_CLIENT_ID: 'some-id',
        // Missing GOOGLE_CLIENT_SECRET
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
    });

    it('should pass when all required credentials provided', () => {
      const result = mcpAutoConfigService.validateCredentials('google-drive', {
        GOOGLE_CLIENT_ID: 'some-id',
        GOOGLE_CLIENT_SECRET: 'some-secret',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('buildServerConfig', () => {
    it('should build config for stdio server', () => {
      const config = mcpAutoConfigService.buildServerConfig('github', {
        GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test',
      });
      expect(config).not.toBeNull();
      expect(config?.name).toBe('GitHub');
      expect(config?.transport).toBe('stdio');
      expect(config?.command).toBe('npx');
      expect(config?.args).toContain('@modelcontextprotocol/server-github');
      expect(config?.envVars?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('ghp_test');
      expect(config?.enabled).toBe(true);
    });

    it('should return null for unknown server', () => {
      const config = mcpAutoConfigService.buildServerConfig('nonexistent', {});
      expect(config).toBeNull();
    });

    it('should handle empty credentials', () => {
      const config = mcpAutoConfigService.buildServerConfig('github', {});
      expect(config).not.toBeNull();
      expect(config?.envVars).toBeUndefined();
    });
  });

  describe('listTemplateNames', () => {
    it('should list all template names', () => {
      const names = mcpAutoConfigService.listTemplateNames();
      expect(names.length).toBe(8);
      expect(names).toContain('github');
      expect(names).toContain('slack');
    });
  });

  describe('hasTemplate', () => {
    it('should return true for known server', () => {
      expect(mcpAutoConfigService.hasTemplate('github')).toBe(true);
    });

    it('should return false for unknown server', () => {
      expect(mcpAutoConfigService.hasTemplate('nonexistent')).toBe(false);
    });
  });
});
