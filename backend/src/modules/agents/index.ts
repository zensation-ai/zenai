import type { Express } from 'express';
import type { Module } from '../../core/module';
import { agentTeamsRouter } from '../../routes/agent-teams';
import { agentIdentityRouter } from '../../routes/agent-identity';
import { autonomousAgentsRouter } from '../../routes/autonomous-agents';
import { agentEvolutionRouter } from '../../routes/agent-evolution';

export class AgentsModule implements Module {
  name = 'agents';

  registerRoutes(app: Express): void {
    // Phase 33: Agent Teams - Multi-Agent Orchestration
    app.use('/api/agents', agentTeamsRouter);
    // Phase 64: Agent Identity + Workflow Graph
    app.use('/api', agentIdentityRouter);
    // Phase 42: Autonomous Agents - Context-aware
    app.use('/api', autonomousAgentsRouter);
    // Phase 89: Self-Evolving Agent Pipelines
    app.use('/api', agentEvolutionRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Register AI Tool Handlers
    try {
      const { registerAllToolHandlers } = await import('../../services/tool-handlers');
      registerAllToolHandlers();
      logger.info('AI Tool Handlers registered successfully', { operation: 'startup' });
    } catch (error) {
      logger.error('AI Tool Handlers registration failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Start Autonomous Agent Runtime
    try {
      const { agentRuntime } = await import('../../services/agents/agent-runtime');
      await agentRuntime.start();
      logger.info('Agent Runtime started (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('Agent Runtime failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }
  }
}
