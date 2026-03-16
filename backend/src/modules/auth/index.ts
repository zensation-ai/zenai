import type { Express } from 'express';
import type { Module } from '../../core/module';
import { authRouter } from '../../routes/auth';

export class AuthModule implements Module {
  name = 'auth';

  registerRoutes(app: Express): void {
    // Phase 56: Auth - Registration, Login, OAuth, MFA, Sessions
    app.use('/api/auth', authRouter);
  }
}
