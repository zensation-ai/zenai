import type { Express } from 'express';
import type { Module } from '../../core/module';
import { codeExecutionRouter } from '../../routes/code-execution';

export class CodeModule implements Module {
  name = 'code';

  registerRoutes(app: Express): void {
    // Phase 31: Code Execution - Must be before context-aware routes
    app.use('/api/code', codeExecutionRouter);
  }
}
