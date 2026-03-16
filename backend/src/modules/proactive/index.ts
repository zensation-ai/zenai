import type { Express } from 'express';
import type { Module } from '../../core/module';
import { proactiveEngineRouter } from '../../routes/proactive-engine';
import { autonomyRouter } from '../../routes/autonomy';
import { smartSuggestionsRouter } from '../../routes/smart-suggestions';
import { proactiveIntelligenceRouter } from '../../routes/proactive-intelligence';
import { workspaceAutomationRouter } from '../../routes/workspace-automation';

export class ProactiveModule implements Module {
  name = 'proactive';

  registerRoutes(app: Express): void {
    // Phase 54: Proactive Event Engine
    app.use('/api', proactiveEngineRouter);
    // Phase 77: Autonomy Dial
    app.use('/api', autonomyRouter);
    // Phase 69.1: Smart Suggestion Surface
    app.use('/api', smartSuggestionsRouter);
    // Phase 88: Interruptibility + Habit Engine + Focus Mode
    app.use('/api', proactiveIntelligenceRouter);
    // Phase 93: Workspace Automation
    app.use('/api', workspaceAutomationRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Start Scheduled Event Producers
    try {
      const { startScheduledEventProducers } = await import('../../services/scheduled-event-producers');
      startScheduledEventProducers();
      logger.info('Scheduled event producers started (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('Scheduled event producers failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }
  }

  async onShutdown(): Promise<void> {
    try {
      const { stopScheduledEventProducers } = await import('../../services/scheduled-event-producers');
      stopScheduledEventProducers();
    } catch { /* ignore */ }
  }
}
