import type { Express } from 'express';
import type { Module } from '../../core/module';
import { securityRouter } from '../../routes/security';

export class SecurityModule implements Module {
  name = 'security';

  registerRoutes(app: Express): void {
    // Phase 62: Enterprise Security
    app.use('/api/security', securityRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Initialize field-level encryption
    try {
      const { initEncryption } = await import('../../services/security/field-encryption');
      const encryptionAvailable = initEncryption();
      logger.info('Field encryption initialized', { operation: 'startup', available: encryptionAvailable });
    } catch (error) {
      logger.warn('Field encryption initialization failed (non-critical)', {
        operation: 'startup',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
