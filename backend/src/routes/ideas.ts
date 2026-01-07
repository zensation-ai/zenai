import { Router, Request, Response, NextFunction } from 'express';
import { queryContext, AIContext, isValidContext, isValidUUID } from '../utils/database-context';
import { generateEmbedding } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';
import { trackInteraction } from '../services/user-profile';
import { triggerWebhook } from '../services/webhooks';
import { learnFromCorrection, learnFromThought } from '../services/learning-engine';

export const ideasRouter = Router();

/**
 * Get context from request header or query param, default to 'personal'
 */
function getContext(req: Request): AIContext {
  const context = (req.headers['x-ai-context'] as string) || (req.query.context as string) || 'personal';
  return isValidContext(context) ? context : 'personal';
}

/**
 * Middleware to validate UUID parameter
 */
function validateUUID(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id;
  if (id && !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid ID format. Must be a valid UUID.' });
  }
  next();
}

/**
 * GET /api/ideas/stats/summary
 * Get statistics about ideas (excluding archived)
 * NOTE: Must be defined BEFORE /:id route to avoid being caught by it
 */
ideasRouter.get('/stats/summary', async (req, res) => {
  try {
    const ctx = getContext(req);
    const [totalResult, typeResult, categoryResult, priorityResult] = await Promise.all([
      queryContext(ctx, 'SELECT COUNT(*) as total FROM ideas WHERE is_archived = false'),
      queryContext(ctx, 'SELECT type, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY type'),
      queryContext(ctx, 'SELECT category, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY category'),
      queryContext(ctx, 'SELECT priority, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY priority'),
    ]);

    res.json({
      total: parseInt(totalResult.rows[0].total),
      byType: typeResult.rows.reduce((acc, row) => ({ ...acc, [row.type]: parseInt(row.count) }), {}),
      byCategory: categoryResult.rows.reduce((acc, row) => ({ ...acc, [row.category]: parseInt(row.count) }), {}),
      byPriority: priorityResult.rows.reduce((acc, row) => ({ ...acc, [row.priority]: parseInt(row.count) }), {}),
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ideas
 * List all ideas with pagination
 */
ideasRouter.get('/', async (req, res) => {
  try {
    const ctx = getContext(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const type = req.query.type as string;
    const category = req.query.category as string;
    const priority = req.query.priority as string;

    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (type) {
      whereClause += ` AND type = $${paramIndex++}`;
      params.push(type);
    }
    if (category) {
      whereClause += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    if (priority) {
      whereClause += ` AND priority = $${paramIndex++}`;
      params.push(priority);
    }

    const result = await queryContext(
      ctx,
      `SELECT id, title, type, category, priority, summary,
              next_steps, context_needed, keywords, created_at, updated_at
       FROM ideas
       WHERE is_archived = false ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const countResult = await queryContext(
      ctx,
      `SELECT COUNT(*) as total FROM ideas WHERE is_archived = false ${whereClause}`,
      params
    );

    res.json({
      ideas: result.rows.map(row => ({
        ...row,
        next_steps: typeof row.next_steps === 'string' ? JSON.parse(row.next_steps) : row.next_steps,
        context_needed: typeof row.context_needed === 'string' ? JSON.parse(row.context_needed) : row.context_needed,
        keywords: typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords,
      })),
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit,
        offset,
        hasMore: offset + limit < parseInt(countResult.rows[0].total),
      },
    });
  } catch (error: any) {
    console.error('Error fetching ideas:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ideas/:id
 * Get a single idea by ID
 */
ideasRouter.get('/:id', validateUUID, async (req, res) => {
  try {
    const ctx = getContext(req);
    const result = await queryContext(
      ctx,
      `SELECT id, title, type, category, priority, summary,
              next_steps, context_needed, keywords, raw_transcript,
              created_at, updated_at
       FROM ideas WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    const row = result.rows[0];

    // Track view interaction for learning
    trackInteraction({
      idea_id: req.params.id,
      interaction_type: 'view',
    }).catch((err) => console.log('Background view tracking skipped:', err.message));

    // Increment view count
    queryContext(ctx, 'UPDATE ideas SET viewed_count = viewed_count + 1 WHERE id = $1', [req.params.id])
      .catch((err) => console.log('Background view count update skipped:', err.message));

    res.json({
      ...row,
      next_steps: typeof row.next_steps === 'string' ? JSON.parse(row.next_steps) : row.next_steps,
      context_needed: typeof row.context_needed === 'string' ? JSON.parse(row.context_needed) : row.context_needed,
      keywords: typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords,
    });
  } catch (error: any) {
    console.error('Error fetching idea:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ideas/search
 * Semantic search for similar ideas using 2-stage search
 * Stage 1: Fast binary search for candidates
 * Stage 2: Rerank with full precision embeddings
 */
ideasRouter.post('/search', async (req, res) => {
  const startTime = Date.now();

  try {
    const ctx = getContext(req);
    const { query: searchQuery, limit = 10 } = req.body;

    if (!searchQuery) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Generate embedding for search query
    const queryEmbedding = await generateEmbedding(searchQuery);

    if (queryEmbedding.length === 0) {
      // Fallback to text search if embedding fails
      const textResult = await queryContext(
        ctx,
        `SELECT id, title, type, category, priority, summary,
                next_steps, context_needed, keywords, created_at
         FROM ideas
         WHERE title ILIKE $1 OR summary ILIKE $1 OR raw_transcript ILIKE $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [`%${searchQuery}%`, limit]
      );

      return res.json({
        ideas: textResult.rows,
        searchType: 'text-fallback',
        processingTime: Date.now() - startTime,
      });
    }

    // 2-Stage Vector Search

    // Stage 1: Fast binary search (get top 50 candidates)
    const binarySearchStart = Date.now();
    // Note: queryBinary could be used for Hamming distance search with embedding_binary column
    // Currently using standard vector search for simplicity

    // For binary search, we use bit_count for hamming distance
    // Note: This requires the embedding_binary column to be populated
    const candidatesResult = await queryContext(
      ctx,
      `SELECT id, title, embedding
       FROM ideas
       WHERE embedding IS NOT NULL
       ORDER BY embedding <-> $1
       LIMIT 50`,
      [formatForPgVector(queryEmbedding)]
    );

    const binarySearchTime = Date.now() - binarySearchStart;

    // Stage 2: Rerank with full precision (if we have candidates)
    const rerankStart = Date.now();
    const candidateIds = candidatesResult.rows.map(r => r.id);

    let finalResults;
    if (candidateIds.length > 0) {
      finalResults = await queryContext(
        ctx,
        `SELECT id, title, type, category, priority, summary,
                next_steps, context_needed, keywords, created_at,
                embedding <-> $1 as distance
         FROM ideas
         WHERE id = ANY($2)
         ORDER BY distance
         LIMIT $3`,
        [formatForPgVector(queryEmbedding), candidateIds, limit]
      );
    } else {
      finalResults = { rows: [] };
    }

    const rerankTime = Date.now() - rerankStart;
    const totalTime = Date.now() - startTime;

    res.json({
      ideas: finalResults.rows.map(row => ({
        ...row,
        next_steps: typeof row.next_steps === 'string' ? JSON.parse(row.next_steps) : row.next_steps,
        context_needed: typeof row.context_needed === 'string' ? JSON.parse(row.context_needed) : row.context_needed,
        keywords: typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords,
        similarity: row.distance ? 1 - row.distance : null,
      })),
      searchType: '2-stage-vector',
      performance: {
        totalMs: totalTime,
        binarySearchMs: binarySearchTime,
        rerankMs: rerankTime,
        candidatesFound: candidateIds.length,
      },
    });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/ideas/:id
 * Update an idea
 *
 * WICHTIG: Bei Änderungen von type/category/priority lernt das System
 * dass die ursprüngliche LLM-Klassifizierung falsch war!
 */
ideasRouter.put('/:id', validateUUID, async (req, res) => {
  try {
    const ctx = getContext(req);
    const { title, type, category, priority, summary, next_steps, context_needed, keywords } = req.body;

    // Hole alte Werte um Korrekturen zu erkennen
    const oldIdea = await queryContext(
      ctx,
      'SELECT type, category, priority FROM ideas WHERE id = $1',
      [req.params.id]
    );

    if (oldIdea.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    const old = oldIdea.rows[0];

    const result = await queryContext(
      ctx,
      `UPDATE ideas SET
        title = COALESCE($2, title),
        type = COALESCE($3, type),
        category = COALESCE($4, category),
        priority = COALESCE($5, priority),
        summary = COALESCE($6, summary),
        next_steps = COALESCE($7, next_steps),
        context_needed = COALESCE($8, context_needed),
        keywords = COALESCE($9, keywords),
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        title,
        type,
        category,
        priority,
        summary,
        next_steps ? JSON.stringify(next_steps) : null,
        context_needed ? JSON.stringify(context_needed) : null,
        keywords ? JSON.stringify(keywords) : null,
      ]
    );

    // KRITISCH: User-Korrektur erkennen und lernen!
    // Dies verhindert, dass LLM-Fehlinterpretationen sich verfestigen
    const hasTypeChange = type && type !== old.type;
    const hasCategoryChange = category && category !== old.category;
    const hasPriorityChange = priority && priority !== old.priority;

    if (hasTypeChange || hasCategoryChange || hasPriorityChange) {
      console.log(`User correction detected on idea ${req.params.id}`);

      // Lernen aus der Korrektur (async, non-blocking)
      learnFromCorrection(req.params.id, {
        oldType: hasTypeChange ? old.type : undefined,
        newType: hasTypeChange ? type : undefined,
        oldCategory: hasCategoryChange ? old.category : undefined,
        newCategory: hasCategoryChange ? category : undefined,
        oldPriority: hasPriorityChange ? old.priority : undefined,
        newPriority: hasPriorityChange ? priority : undefined,
      }).catch(err => console.log('Background correction learning skipped:', err.message));

      // Zusätzlich: Lerne stark von der korrigierten Idee
      learnFromThought(req.params.id, 'default', true).catch(err =>
        console.log('Background learning from corrected idea skipped:', err.message)
      );
    }

    // Track edit and priority changes for interaction tracking
    const metadata: Record<string, any> = { action: 'update' };
    if (hasPriorityChange) {
      metadata.new_priority = priority;
      metadata.old_priority = old.priority;
      trackInteraction({
        idea_id: req.params.id,
        interaction_type: 'prioritize',
        metadata,
      }).catch((err) => console.log('Background prioritize tracking skipped:', err.message));
    } else {
      trackInteraction({
        idea_id: req.params.id,
        interaction_type: 'edit',
        metadata,
      }).catch((err) => console.log('Background edit tracking skipped:', err.message));
    }

    // Phase 4: Trigger webhook
    triggerWebhook('idea.updated', {
      id: req.params.id,
      ...result.rows[0]
    }).catch((err) => console.log('Background webhook skipped:', err.message));

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating idea:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/ideas/:id
 * Delete an idea
 */
ideasRouter.delete('/:id', validateUUID, async (req, res) => {
  try {
    const ctx = getContext(req);
    const result = await queryContext(ctx, 'DELETE FROM ideas WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    // Track archive/delete for learning
    trackInteraction({
      idea_id: req.params.id,
      interaction_type: 'archive',
      metadata: { action: 'delete' },
    }).catch((err) => console.log('Background delete tracking skipped:', err.message));

    // Phase 4: Trigger webhook
    triggerWebhook('idea.deleted', {
      id: req.params.id
    }).catch((err) => console.log('Background webhook skipped:', err.message));

    res.json({ success: true, deletedId: req.params.id });
  } catch (error: any) {
    console.error('Error deleting idea:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/ideas/:id/priority
 * Update idea priority (from swipe actions)
 *
 * WICHTIG: Dies ist eine User-Korrektur und löst starkes Lernen aus!
 */
ideasRouter.put('/:id/priority', validateUUID, async (req, res) => {
  try {
    const ctx = getContext(req);
    const { priority } = req.body;

    if (!priority || !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority. Must be low, medium, or high' });
    }

    // Hole alte Priorität für Korrektur-Lernen
    const oldResult = await queryContext(
      ctx,
      'SELECT priority FROM ideas WHERE id = $1',
      [req.params.id]
    );

    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    const oldPriority = oldResult.rows[0].priority;

    const result = await queryContext(
      ctx,
      'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1 RETURNING id, title, priority',
      [req.params.id, priority]
    );

    // Lerne aus der Prioritäts-Korrektur (wenn geändert)
    if (oldPriority !== priority) {
      learnFromCorrection(req.params.id, {
        oldPriority,
        newPriority: priority,
      }).catch(err => console.log('Background priority correction learning skipped:', err.message));

      // Lerne stark von dieser Idee
      learnFromThought(req.params.id, 'default', true).catch(err =>
        console.log('Background learning skipped:', err.message)
      );
    }

    trackInteraction({
      idea_id: req.params.id,
      interaction_type: 'prioritize',
      metadata: { new_priority: priority, old_priority: oldPriority, source: 'swipe' },
    }).catch((err) => console.log('Background priority tracking skipped:', err.message));

    res.json({ success: true, idea: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating priority:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ideas/:id/swipe
 * Handle swipe actions from iOS app
 */
ideasRouter.post('/:id/swipe', validateUUID, async (req, res) => {
  try {
    const ctx = getContext(req);
    const { action } = req.body;
    const ideaId = req.params.id;

    if (!action || !['priority', 'later', 'archive'].includes(action)) {
      return res.status(400).json({
        error: 'Invalid action. Must be priority, later, or archive'
      });
    }

    let result;
    switch (action) {
      case 'priority':
        result = await queryContext(
          ctx,
          'UPDATE ideas SET priority = $2, updated_at = NOW() WHERE id = $1 RETURNING id, title, priority',
          [ideaId, 'high']
        );
        trackInteraction({
          idea_id: ideaId,
          interaction_type: 'prioritize',
          metadata: { new_priority: 'high', source: 'swipe' },
        }).catch((err) => console.log('Background swipe priority tracking skipped:', err.message));
        break;

      case 'archive':
        result = await queryContext(
          ctx,
          'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 RETURNING id, title',
          [ideaId]
        );
        trackInteraction({
          idea_id: ideaId,
          interaction_type: 'archive',
          metadata: { source: 'swipe' },
        }).catch((err) => console.log('Background swipe archive tracking skipped:', err.message));
        triggerWebhook('idea.archived', { id: ideaId })
          .catch((err) => console.log('Background archive webhook skipped:', err.message));
        break;

      case 'later':
        // Just track the interaction, no changes to the idea
        result = await queryContext(
          ctx,
          'SELECT id, title FROM ideas WHERE id = $1',
          [ideaId]
        );
        trackInteraction({
          idea_id: ideaId,
          interaction_type: 'view',
          metadata: { action: 'review_later', source: 'swipe' },
        }).catch((err) => console.log('Background swipe later tracking skipped:', err.message));
        break;
    }

    if (!result || result.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    res.json({ success: true, action, idea: result.rows[0] });
  } catch (error: any) {
    console.error('Error handling swipe action:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/ideas/:id/archive
 * Archive an idea (soft delete)
 */
ideasRouter.put('/:id/archive', validateUUID, async (req, res) => {
  try {
    const ctx = getContext(req);
    const result = await queryContext(
      ctx,
      'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    trackInteraction({
      idea_id: req.params.id,
      interaction_type: 'archive',
      metadata: { action: 'archive' },
    }).catch((err) => console.log('Background archive tracking skipped:', err.message));

    // Phase 4: Trigger webhook
    triggerWebhook('idea.archived', {
      id: req.params.id
    }).catch((err) => console.log('Background archive webhook skipped:', err.message));

    res.json({ success: true, archivedId: req.params.id });
  } catch (error: any) {
    console.error('Error archiving idea:', error);
    res.status(500).json({ error: error.message });
  }
});
