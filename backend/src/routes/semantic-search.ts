/**
 * Semantic Search 2.0 API Routes (Phase 95)
 *
 * Universal cross-feature search endpoints.
 */

import { Router } from 'express';
import { isValidContext } from '../utils/database-context';
import type { AIContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import {
  unifiedSearch,
  getSearchSuggestions,
  getSearchHistory,
  clearSearchHistory,
  recordSearchHistory,
  getSearchFacets,
  ALL_ENTITY_TYPES,
  type SearchEntityType,
} from '../services/semantic-search';

export const semanticSearchRouter = Router();

// ─── Unified Search ─────────────────────────────────
semanticSearchRouter.post(
  '/:context/search/unified',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context');
    }

    const { query, types, timeRange, limit } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length < 1) {
      throw new ValidationError('Query must be at least 1 character');
    }

    // Validate types if provided
    if (types && Array.isArray(types)) {
      for (const t of types) {
        if (!ALL_ENTITY_TYPES.includes(t as SearchEntityType)) {
          throw new ValidationError(`Invalid type: "${t}". Valid types: ${ALL_ENTITY_TYPES.join(', ')}`);
        }
      }
    }

    const parsedLimit = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 50);

    const result = await unifiedSearch({
      query: query.trim(),
      context,
      userId,
      types: types as SearchEntityType[] | undefined,
      timeRange,
      limit: parsedLimit,
    });

    // Record search in history (fire-and-forget)
    recordSearchHistory(context, userId, query.trim(), result.totalResults).catch(() => {});

    res.json({ success: true, data: result });
  })
);

// ─── Search Suggestions ─────────────────────────────
semanticSearchRouter.get(
  '/:context/search/suggestions',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context');
    }

    const prefix = (req.query.q as string || '').trim();
    const suggestions = await getSearchSuggestions(context, userId, prefix);

    res.json({ success: true, data: suggestions });
  })
);

// ─── Search History ─────────────────────────────────
semanticSearchRouter.get(
  '/:context/search/history',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context');
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
    const history = await getSearchHistory(context, userId, limit);

    res.json({ success: true, data: history });
  })
);

// ─── Clear Search History ───────────────────────────
semanticSearchRouter.delete(
  '/:context/search/history',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context');
    }

    await clearSearchHistory(context, userId);

    res.json({ success: true, message: 'Search history cleared' });
  })
);

// ─── Available Facets ───────────────────────────────
semanticSearchRouter.get(
  '/:context/search/facets',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context');
    }

    const facets = await getSearchFacets(context, userId);

    res.json({ success: true, data: facets });
  })
);
