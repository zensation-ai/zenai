/**
 * Global AI Search Routes
 *
 * Unified search endpoint across the entire ZenAI platform.
 * Searches ideas, documents, voice memos, meetings, AI memory, and chat history.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { AIContext, isValidContext } from '../utils/database-context';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { globalSearch, SearchResultType } from '../services/global-search';

const router = Router();

const VALID_TYPES: SearchResultType[] = ['idea', 'document', 'voice_memo', 'meeting', 'fact', 'chat'];

/**
 * POST /api/search/global
 * Execute a global search across all content types
 *
 * Body: {
 *   query: string,           // Search query (min 2 chars)
 *   contexts?: string[],     // Filter by contexts (default: all)
 *   types?: string[],        // Filter by result types (default: all)
 *   limit?: number,          // Max results (default: 20, max: 50)
 *   includeMemory?: boolean  // Include AI memory in search (default: true)
 * }
 */
router.post('/global', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const { query, contexts, types, limit, includeMemory } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    throw new ValidationError('Query must be at least 2 characters.');
  }

  // Validate contexts if provided
  const validContexts: AIContext[] = [];
  if (contexts && Array.isArray(contexts)) {
    for (const ctx of contexts) {
      if (!isValidContext(ctx)) {
        throw new ValidationError(`Invalid context: "${ctx}". Use "personal", "work", "learning", or "creative".`);
      }
      validContexts.push(ctx as AIContext);
    }
  }

  // Validate types if provided
  if (types && Array.isArray(types)) {
    for (const t of types) {
      if (!VALID_TYPES.includes(t as SearchResultType)) {
        throw new ValidationError(`Invalid type: "${t}". Use: ${VALID_TYPES.join(', ')}.`);
      }
    }
  }

  const result = await globalSearch.search({
    query: query.trim(),
    contexts: validContexts.length > 0 ? validContexts : undefined,
    types: types as SearchResultType[] | undefined,
    limit: typeof limit === 'number' ? Math.min(Math.max(limit, 1), 50) : undefined,
    includeMemory: includeMemory !== false,
  });

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/search/quick
 * Quick search with query parameter (for autocomplete/typeahead)
 */
router.get('/quick', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const context = req.query.context as string;

  if (!query || query.trim().length < 2) {
    return res.json({ success: true, data: { query: '', totalResults: 0, results: [] } });
  }

  const contexts = context && isValidContext(context) ? [context as AIContext] : undefined;

  const result = await globalSearch.search({
    query: query.trim(),
    contexts,
    limit: 8,
    includeMemory: false, // Quick search skips memory for speed
  });

  res.json({
    success: true,
    data: result,
  });
}));

export const globalSearchRouter = router;
