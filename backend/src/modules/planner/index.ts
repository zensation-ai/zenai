import type { Express } from 'express';
import type { Module } from '../../core/module';
import { tasksRouter } from '../../routes/tasks';
import { projectsRouter } from '../../routes/projects';

export class PlannerModule implements Module {
  name = 'planner';

  registerRoutes(app: Express): void {
    // Phase 37: Planner - Tasks & Projects
    app.use('/api', tasksRouter);
    app.use('/api', projectsRouter);
  }
}
