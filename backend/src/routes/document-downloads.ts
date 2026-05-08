/**
 * Document Download Route
 *
 * Serves generated documents (PPTX, XLSX, PDF, DOCX) by ID from
 * the in-memory document store. No /:context/ prefix because
 * generated documents are context-independent. IDs are UUIDv4.
 *
 * @module routes/document-downloads
 */

import express, { Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler';
import { documentStore } from '../services/documents/document-store';
import { logger } from '../utils/logger';

export const documentDownloadRouter = express.Router();

/**
 * GET /api/documents/:id/download
 * Download a generated document by ID.
 */
documentDownloadRouter.get(
  '/documents/:id/download',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const doc = documentStore.get(id);
    if (!doc) {
      throw new NotFoundError('Dokument nicht gefunden oder abgelaufen.');
    }

    logger.info('Document download', { id: doc.id, type: doc.type, title: doc.title });

    // RFC 6266: ASCII fallback + UTF-8 encoded filename
    const filename = `${doc.title}.${doc.extension}`;
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    const utf8Filename = encodeURIComponent(filename);

    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`,
      'Content-Length': String(doc.buffer.length),
      'Cache-Control': 'no-store',
    });

    res.send(doc.buffer);
  })
);
