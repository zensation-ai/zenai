import type { Express } from 'express';
import type { Module } from '../../core/module';
import { a2aRouter } from '../../routes/a2a';
import { unifiedAssistantRouter } from '../../routes/unified-assistant';
import { digitalTwinRouter } from '../../routes/digital-twin';

export class MiscModule implements Module {
  name = 'misc';

  registerRoutes(app: Express): void {
    // Phase 60: A2A Protocol
    app.use('/api', a2aRouter);
    // Phase 91: Unified AI Assistant
    app.use('/api', unifiedAssistantRouter);
    // Phase 92: Digital Twin Profile
    app.use('/api', digitalTwinRouter);
  }
}
