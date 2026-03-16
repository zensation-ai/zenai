import type { Express } from 'express';
import type { Module } from '../../core/module';
import { financeRouter } from '../../routes/finance';

export class FinanceModule implements Module {
  name = 'finance';

  registerRoutes(app: Express): void {
    // Phase 4: Finanzen & Ausgaben
    app.use('/api', financeRouter);
  }
}
