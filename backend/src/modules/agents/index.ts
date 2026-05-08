import type { Express } from 'express';
import type { Module } from '../../core/module';
import { agentTeamsRouter } from '../../routes/agent-teams';
import { agentIdentityRouter } from '../../routes/agent-identity';
import { autonomousAgentsRouter } from '../../routes/autonomous-agents';
import { agentEvolutionRouter } from '../../routes/agent-evolution';
import { agentBlueprintsRouter } from '../../routes/agent-blueprints';
import { agentBuilderRouter } from '../../routes/agent-builder';
import { marketplaceRouter } from '../../routes/marketplace';

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
    // Phase 143: Blueprint Registry + Marketplace
    app.use('/api/agents', agentBlueprintsRouter);
    // Phase 143: NL Agent Builder
    app.use('/api/agents', agentBuilderRouter);
    // Phase 143: Agent Marketplace
    app.use('/api/marketplace', marketplaceRouter);
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

    // Seed Built-In Blueprints
    try {
      const { blueprintRegistry } = await import('../../services/agents/blueprint-registry');
      await blueprintRegistry.registerBuiltIns();
      logger.info('Built-in agent blueprints seeded', { operation: 'startup' });
    } catch (error) {
      logger.warn('Blueprint seeding failed (non-critical)', { operation: 'startup', error: error instanceof Error ? error.message : String(error) });
    }
  }
}
