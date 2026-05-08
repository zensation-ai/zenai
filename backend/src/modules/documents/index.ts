import type { Express } from 'express';
import type { Module } from '../../core/module';
import { documentAnalysisRouter } from '../../routes/document-analysis';
import { documentDownloadRouter } from '../../routes/document-downloads';
import documentsRouter from '../../routes/documents';

export class DocumentsModule implements Module {
  name = 'documents';

  registerRoutes(app: Express): void {
    // Phase 32: Document Analysis - Must be before context-aware routes
    app.use('/api/documents', documentAnalysisRouter);
    // Phase 32: Document Vault - KI-erkennbarer Dokumentenspeicher (context-aware)
    app.use('/api', documentsRouter);
    // Generated document downloads (no context prefix — documents are context-independent)
    app.use('/api', documentDownloadRouter);
  }
}
