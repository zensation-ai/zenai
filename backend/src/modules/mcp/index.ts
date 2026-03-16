import type { Express } from 'express';
import type { Module } from '../../core/module';
import { mcpServerRouter } from '../../routes/mcp-server';
import { mcpRouter, mcpConnectionsRouter } from '../../routes/mcp';
import { mcpConnectionsV2Router } from '../../routes/mcp-connections';

export class MCPModule implements Module {
  name = 'mcp';

  registerRoutes(app: Express): void {
    // Phase 55: MCP Server Exposure
    app.use('/api', mcpServerRouter);
    // Phase 44: MCP HTTP Gateway
    app.use('/api/mcp', mcpRouter);
    app.use('/api', mcpConnectionsRouter);
    // Phase 55: MCP Client + Connection Management V2
    app.use('/api', mcpConnectionsV2Router);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Initialize MCP Connection Manager
    try {
      const { mcpConnectionManager } = await import('../../services/mcp-connections');
      const contexts = ['personal', 'work', 'learning', 'creative'] as const;
      for (const ctx of contexts) {
        await mcpConnectionManager.initialize(ctx);
      }
      logger.info('MCP Connection Manager initialized (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('MCP Connection Manager failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }
  }
}
