/**
 * Export Routes
 *
 * Route definitions for all export endpoints (PDF, Markdown, CSV, JSON, Backup).
 * Handler implementations are in export-handlers.ts (Phase 122 decomposition).
 *
 * @module routes/export
 */

import { Router } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import {
  handleExportIdeasPdf,
  handleExportSingleIdeaPdf,
  handleExportIdeasMarkdown,
  handleExportSingleIdeaMarkdown,
  handleExportIdeasCsv,
  handleExportIdeasJson,
  handleExportIncubatorMarkdown,
  handleExportMeetingsPdf,
  handleExportMeetingsCsv,
  handleExportBackup,
  handleExportData,
  handleGetExportHistory,
  handleCreateExportHistory,
} from './export-handlers';

export const exportRouter = Router();

// ============================================
// PDF Export
// ============================================

exportRouter.get('/ideas/pdf', apiKeyAuth, asyncHandler(handleExportIdeasPdf));
exportRouter.get('/ideas/:id/pdf', apiKeyAuth, asyncHandler(handleExportSingleIdeaPdf));

// ============================================
// Markdown Export
// ============================================

exportRouter.get('/ideas/markdown', apiKeyAuth, asyncHandler(handleExportIdeasMarkdown));
exportRouter.get('/ideas/:id/markdown', apiKeyAuth, asyncHandler(handleExportSingleIdeaMarkdown));

// ============================================
// CSV Export
// ============================================

exportRouter.get('/ideas/csv', apiKeyAuth, asyncHandler(handleExportIdeasCsv));

// ============================================
// JSON Export (Backup)
// ============================================

exportRouter.get('/ideas/json', apiKeyAuth, asyncHandler(handleExportIdeasJson));

// ============================================
// Incubator Export
// ============================================

exportRouter.get('/incubator/markdown', apiKeyAuth, asyncHandler(handleExportIncubatorMarkdown));

// ============================================
// Meetings Export
// ============================================

exportRouter.get('/meetings/pdf', apiKeyAuth, asyncHandler(handleExportMeetingsPdf));
exportRouter.get('/meetings/csv', apiKeyAuth, asyncHandler(handleExportMeetingsCsv));

// ============================================
// Full Backup
// ============================================

exportRouter.get('/backup', apiKeyAuth, requireScope('admin'), asyncHandler(handleExportBackup));

// ============================================
// Unified Data Export
// ============================================

exportRouter.get('/data', apiKeyAuth, asyncHandler(handleExportData));

// ============================================
// Export History
// ============================================

exportRouter.get('/history', apiKeyAuth, asyncHandler(handleGetExportHistory));
exportRouter.post('/history', apiKeyAuth, asyncHandler(handleCreateExportHistory));
