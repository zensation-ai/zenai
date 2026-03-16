import type { Express } from 'express';
import type { Module } from '../../core/module';
import projectContextRouter from '../../routes/project-context';

export class ProjectContextModule implements Module {
  name = 'project-context';

  registerRoutes(app: Express): void {
    // Phase 31: Project Context - Codebase Analysis
    app.use('/api/project', projectContextRouter);
    app.use('/api/:context/project', projectContextRouter);
  }
}
