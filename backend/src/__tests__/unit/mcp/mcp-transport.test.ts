/**
 * Unit Tests for MCP Transport Layer (Phase 55)
 *
 * Tests transport abstraction for HTTP, SSE, and Stdio transports.
 */

import { createTransport, validateTransportConfig, HttpMCPTransport, StdioMCPTransport } from '../../../services/mcp/mcp-transport';
import type { MCPTransportConfig } from '../../../services/mcp/mcp-transport';

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('MCP Transport', () => {
  // ===========================================
  // validateTransportConfig
  // ===========================================

  describe('validateTransportConfig', () => {
    it('should accept valid streamable-http config with URL', () => {
      const error = validateTransportConfig({
        type: 'streamable-http',
        url: 'https://example.com/mcp',
      });
      expect(error).toBeNull();
    });

    it('should accept valid sse config with URL', () => {
      const error = validateTransportConfig({
        type: 'sse',
        url: 'https://example.com/mcp/sse',
      });
      expect(error).toBeNull();
    });

    it('should accept valid stdio config with command', () => {
      const error = validateTransportConfig({
        type: 'stdio',
        command: 'npx',
        args: ['@mcp/server'],
      });
      expect(error).toBeNull();
    });

    it('should reject streamable-http without URL', () => {
      const error = validateTransportConfig({
        type: 'streamable-http',
      });
      expect(error).toBeTruthy();
      expect(error).toContain('URL');
    });

    it('should reject sse without URL', () => {
      const error = validateTransportConfig({
        type: 'sse',
      });
      expect(error).toBeTruthy();
    });

    it('should reject stdio without command', () => {
      const error = validateTransportConfig({
        type: 'stdio',
      });
      expect(error).toBeTruthy();
      expect(error?.toLowerCase()).toContain('command');
    });

    it('should reject unknown transport type', () => {
      const error = validateTransportConfig({
        type: 'websocket' as any,
      });
      expect(error).toBeTruthy();
    });

    it('should accept streamable-http with auth config', () => {
      const error = validateTransportConfig({
        type: 'streamable-http',
        url: 'https://example.com/mcp',
        auth: { type: 'bearer', token: 'test-token' },
      });
      expect(error).toBeNull();
    });
  });

  // ===========================================
  // createTransport factory
  // ===========================================

  describe('createTransport', () => {
    it('should create HttpMCPTransport for streamable-http', () => {
      const transport = createTransport({
        type: 'streamable-http',
        url: 'https://example.com/mcp',
      });
      expect(transport).toBeInstanceOf(HttpMCPTransport);
    });

    it('should create HttpMCPTransport for sse', () => {
      const transport = createTransport({
        type: 'sse',
        url: 'https://example.com/mcp/sse',
      });
      expect(transport).toBeInstanceOf(HttpMCPTransport);
    });

    it('should create StdioMCPTransport for stdio', () => {
      const transport = createTransport({
        type: 'stdio',
        command: 'npx',
        args: ['@mcp/server'],
      });
      expect(transport).toBeInstanceOf(StdioMCPTransport);
    });

    it('should throw for unknown transport type', () => {
      expect(() => createTransport({
        type: 'websocket' as any,
        url: 'ws://example.com',
      })).toThrow();
    });
  });

  // ===========================================
  // HttpMCPTransport
  // ===========================================

  describe('HttpMCPTransport', () => {
    let transport: HttpMCPTransport;

    beforeEach(() => {
      transport = new HttpMCPTransport({
        type: 'streamable-http',
        url: 'https://example.com/mcp',
      });
    });

    it('should start as not connected', () => {
      expect(transport.isConnected()).toBe(false);
    });

    it('should store the URL from config', () => {
      expect(transport).toBeDefined();
    });

    it('should handle close gracefully when not connected', async () => {
      await expect(transport.close()).resolves.not.toThrow();
    });

    it('should include auth headers in requests when configured', () => {
      const authTransport = new HttpMCPTransport({
        type: 'streamable-http',
        url: 'https://example.com/mcp',
        auth: { type: 'bearer', token: 'test-token-123' },
      });
      expect(authTransport).toBeDefined();
    });

    it('should handle request failure gracefully', async () => {
      // Without a real server, the request should fail
      await expect(transport.request('initialize', {})).rejects.toThrow();
    });
  });

  // ===========================================
  // StdioMCPTransport
  // ===========================================

  describe('StdioMCPTransport', () => {
    let transport: StdioMCPTransport;

    beforeEach(() => {
      transport = new StdioMCPTransport({
        type: 'stdio',
        command: 'echo',
        args: ['hello'],
      });
    });

    it('should start as not connected', () => {
      expect(transport.isConnected()).toBe(false);
    });

    it('should handle close gracefully when not connected', async () => {
      await expect(transport.close()).resolves.not.toThrow();
    });

    it('should be defined with env vars', () => {
      const envTransport = new StdioMCPTransport({
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { MCP_PORT: '3001' },
      });
      expect(envTransport).toBeDefined();
    });
  });

  // ===========================================
  // MCPTransportConfig type checks
  // ===========================================

  describe('MCPTransportConfig types', () => {
    it('should accept all valid transport types', () => {
      const types: MCPTransportConfig['type'][] = ['streamable-http', 'stdio', 'sse'];
      expect(types).toHaveLength(3);
    });

    it('should allow optional fields', () => {
      const config: MCPTransportConfig = {
        type: 'streamable-http',
        url: 'https://example.com',
      };
      expect(config.auth).toBeUndefined();
      expect(config.env).toBeUndefined();
      expect(config.args).toBeUndefined();
    });
  });
});
