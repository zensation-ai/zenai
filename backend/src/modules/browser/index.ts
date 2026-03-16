import type { Express } from 'express';
import type { Module } from '../../core/module';
import { browserRouter } from '../../routes/browser';
import { screenMemoryRouter } from '../../routes/screen-memory';

export class BrowserModule implements Module {
  name = 'browser';

  registerRoutes(app: Express): void {
    // Phase 2: Eingebetteter Browser
    app.use('/api', browserRouter);
    // Phase 5: Screen Memory
    app.use('/api', screenMemoryRouter);
  }
}
