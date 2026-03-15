/**
 * Browser Routes - Phase 2
 *
 * Context-aware browsing history and bookmark API: /api/:context/browser/*
 */

import { Router } from 'express';
import {
  addHistoryEntry, getHistory, getHistoryEntry, deleteHistoryEntry,
  clearHistory, getDomainStats,
  createBookmark, getBookmarks, getBookmark, updateBookmark,
  deleteBookmark, getBookmarkFolders,
} from '../services/browsing-memory';
import { analyzePage } from '../services/page-analyzer';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { isValidUUID, validateContextParam } from '../utils/validation';
import { getUserId } from '../utils/user-context';

export const browserRouter = Router();

// ============================================================
// Browsing History
// ============================================================

/**
 * GET /api/:context/browser/history
 * List browsing history with filters
 */
browserRouter.get('/:context/browser/history', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { domain, category, search, from_date, to_date, limit, offset } = req.query;

  const result = await getHistory(context, {
    domain: domain as string,
    category: category as string,
    search: search as string,
    from_date: from_date as string,
    to_date: to_date as string,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
  }, userId);

  res.json({ success: true, data: result.entries, total: result.total });
}));

/**
 * GET /api/:context/browser/history/domains
 * Get domain visit statistics
 */
browserRouter.get('/:context/browser/history/domains', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

  const stats = await getDomainStats(context, limit, userId);

  res.json({ success: true, data: stats });
}));

/**
 * GET /api/:context/browser/history/:id
 * Get single history entry
 */
browserRouter.get('/:context/browser/history/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { id } = req.params;

  if (!isValidUUID(id)) { throw new ValidationError('Invalid history entry ID'); }

  const entry = await getHistoryEntry(context, id, userId);
  if (!entry) {
    throw new NotFoundError('History entry not found');
  }

  res.json({ success: true, data: entry });
}));

/**
 * POST /api/:context/browser/history
 * Record a page visit
 */
browserRouter.post('/:context/browser/history', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { url, title, domain, duration_seconds, content_text, metadata } = req.body;

  if (!url || !domain) {
    throw new ValidationError('url and domain are required');
  }

  // Optionally analyze content
  let content_summary: string | undefined;
  let keywords: string[] | undefined;
  let category: string | undefined;

  if (content_text && req.query.analyze === 'true') {
    const analysis = await analyzePage({ url, title: title || '', text: content_text, domain });
    if (analysis) {
      content_summary = analysis.summary;
      keywords = analysis.keywords;
      category = analysis.category;
    }
  }

  const entry = await addHistoryEntry(context, {
    url,
    title,
    domain,
    duration_seconds,
    content_summary,
    content_text,
    keywords,
    category,
    metadata,
  }, userId);

  res.status(201).json({ success: true, data: entry });
}));

/**
 * DELETE /api/:context/browser/history/:id
 * Delete a single history entry
 */
browserRouter.delete('/:context/browser/history/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { id } = req.params;

  if (!isValidUUID(id)) { throw new ValidationError('Invalid history entry ID'); }

  const deleted = await deleteHistoryEntry(context, id, userId);
  if (!deleted) {
    throw new NotFoundError('History entry not found');
  }

  res.json({ success: true, message: 'History entry deleted' });
}));

/**
 * DELETE /api/:context/browser/history
 * Clear browsing history (optionally before a date)
 */
browserRouter.delete('/:context/browser/history', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { before } = req.query;

  const count = await clearHistory(context, before as string, userId);

  res.json({ success: true, message: `${count} history entries deleted`, count });
}));

// ============================================================
// Bookmarks
// ============================================================

/**
 * GET /api/:context/browser/bookmarks
 * List bookmarks with filters
 */
browserRouter.get('/:context/browser/bookmarks', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { folder, tag, search, limit, offset } = req.query;

  const result = await getBookmarks(context, {
    folder: folder as string,
    tag: tag as string,
    search: search as string,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
  }, userId);

  res.json({ success: true, data: result.bookmarks, total: result.total });
}));

/**
 * GET /api/:context/browser/bookmarks/folders
 * Get bookmark folder structure
 */
browserRouter.get('/:context/browser/bookmarks/folders', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);

  const folders = await getBookmarkFolders(context, userId);

  res.json({ success: true, data: folders });
}));

/**
 * GET /api/:context/browser/bookmarks/:id
 * Get single bookmark
 */
browserRouter.get('/:context/browser/bookmarks/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { id } = req.params;

  if (!isValidUUID(id)) { throw new ValidationError('Invalid bookmark ID'); }

  const bookmark = await getBookmark(context, id, userId);
  if (!bookmark) {
    throw new NotFoundError('Bookmark not found');
  }

  res.json({ success: true, data: bookmark });
}));

/**
 * POST /api/:context/browser/bookmarks
 * Create a bookmark
 */
browserRouter.post('/:context/browser/bookmarks', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { url, title, description, folder, tags, ai_summary, favicon_url, metadata } = req.body;

  if (!url) {
    throw new ValidationError('url is required');
  }

  const bookmark = await createBookmark(context, {
    url, title, description, folder, tags, ai_summary, favicon_url, metadata,
  }, userId);

  res.status(201).json({ success: true, data: bookmark });
}));

/**
 * PUT /api/:context/browser/bookmarks/:id
 * Update a bookmark
 */
browserRouter.put('/:context/browser/bookmarks/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { id } = req.params;

  if (!isValidUUID(id)) { throw new ValidationError('Invalid bookmark ID'); }

  const updated = await updateBookmark(context, id, req.body, userId);
  if (!updated) {
    throw new NotFoundError('Bookmark not found');
  }

  res.json({ success: true, data: updated });
}));

/**
 * DELETE /api/:context/browser/bookmarks/:id
 * Delete a bookmark
 */
browserRouter.delete('/:context/browser/bookmarks/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const userId = getUserId(req);
  const { id } = req.params;

  if (!isValidUUID(id)) { throw new ValidationError('Invalid bookmark ID'); }

  const deleted = await deleteBookmark(context, id, userId);
  if (!deleted) {
    throw new NotFoundError('Bookmark not found');
  }

  res.json({ success: true, message: 'Bookmark deleted' });
}));

// ============================================================
// AI Analysis
// ============================================================

/**
 * POST /api/:context/browser/analyze
 * Analyze page content with AI
 */
browserRouter.post('/:context/browser/analyze', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  validateContextParam(req.params.context); // validates context, throws on invalid
  const { url, title, text, domain } = req.body;

  if (!url || !text) {
    throw new ValidationError('url and text are required');
  }

  const analysis = await analyzePage({
    url,
    title: title || '',
    text,
    domain: domain || new URL(url).hostname,
  });

  if (!analysis) {
    return res.status(503).json({ success: false, error: 'Analysis service unavailable' });
  }

  res.json({ success: true, data: analysis });
}));
