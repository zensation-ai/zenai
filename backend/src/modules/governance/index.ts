import type { Express } from 'express';
import type { Module } from '../../core/module';
import { governanceRouter } from '../../routes/governance';
import { contextRulesRouter } from '../../routes/context-rules';

export class GovernanceModule implements Module {
  name = 'governance';

  registerRoutes(app: Express): void {
    // Phase 54: Governance & Audit Trail
    app.use('/api', governanceRouter);
    // Phase 54: Programmatic Context Engineering
    app.use('/api', contextRulesRouter);
  }
}
