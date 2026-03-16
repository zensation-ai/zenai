import type { Express } from 'express';
import type { Module } from '../../core/module';
import { contactsRouter } from '../../routes/contacts';

export class ContactsModule implements Module {
  name = 'contacts';

  registerRoutes(app: Express): void {
    // Phase 3: Kontakte & CRM
    app.use('/api', contactsRouter);
  }
}
