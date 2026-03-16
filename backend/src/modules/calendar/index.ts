import type { Express } from 'express';
import type { Module } from '../../core/module';
import { calendarRouter } from '../../routes/calendar';
import { calendarAccountsRouter } from '../../routes/calendar-accounts';
import { mapsRouter } from '../../routes/maps';

export class CalendarModule implements Module {
  name = 'calendar';

  registerRoutes(app: Express): void {
    // Phase 35: AI Calendar - Context-aware
    app.use('/api', calendarRouter);
    // Phase 40: Calendar Accounts & AI
    app.use('/api', calendarAccountsRouter);
    // Phase 41: Google Maps
    app.use('/api', mapsRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Start CalDAV Sync Scheduler
    try {
      const { startCalDAVScheduler } = await import('../../services/caldav-sync');
      startCalDAVScheduler();
      logger.info('CalDAV sync scheduler started (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('CalDAV Scheduler failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }
  }

  async onShutdown(): Promise<void> {
    try {
      const { stopCalDAVScheduler } = await import('../../services/caldav-sync');
      stopCalDAVScheduler();
    } catch { /* ignore */ }
  }
}
