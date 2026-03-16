import type { Express } from 'express';
import type { Module } from '../../core/module';
import { unifiedInboxRouter } from '../../routes/unified-inbox';

export class InboxModule implements Module {
  name = 'inbox';

  registerRoutes(app: Express): void {
    // Phase 8: Unified Inbox
    app.use('/api', unifiedInboxRouter);
  }
}
