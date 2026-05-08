// backend/src/modules/organizations/index.ts
import { Express } from 'express';
import { Module } from '../../core/module';
import { jwtAuth } from '../../middleware/jwt-auth';
import { organizationRouter } from '../../routes/organizations';
import { workspaceRouter } from '../../routes/workspaces';

export class OrganizationsModule implements Module {
  name = 'organizations';

  registerRoutes(app: Express): void {
    app.use('/api/organizations', jwtAuth, organizationRouter);
    app.use('/api', jwtAuth, workspaceRouter);
  }
}
