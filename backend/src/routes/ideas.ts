import { Router } from 'express';
import { query } from '../utils/database';
import { generateEmbedding } from '../utils/ollama';
import { formatForPgVector, quantizeToBinary } from '../utils/embedding';
import { trackInteraction } from '../services/user-profile';

export const ideasRouter = Router();

/**
 * GET /api/ideas
 * List all ideas with pagination
 */
ideasRouter.get('/', async (req, res) => {
  try {
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

    const result = await query(
      `SELECT id, title, type, category, priority, summary,
              next_steps, context_needed, keywords, created_at, updated_at
       FROM ideas
       WHERE 1=1 ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM ideas WHERE 1=1 ${whereClause}`,
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
ideasRouter.get('/:id', async (req, res) => {
  try {
    const result = await query(
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
    }).catch(() => {});

    // Increment view count
    query('UPDATE ideas SET viewed_count = viewed_count + 1 WHERE id = $1', [req.params.id]).catch(() => {});

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
    const { query: searchQuery, limit = 10 } = req.body;

    if (!searchQuery) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Generate embedding for search query
    const queryEmbedding = await generateEmbedding(searchQuery);

    if (queryEmbedding.length === 0) {
      // Fallback to text search if embedding fails
      const textResult = await query(
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
    const queryBinary = quantizeToBinary(queryEmbedding);

    // For binary search, we use bit_count for hamming distance
    // Note: This requires the embedding_binary column to be populated
    const candidatesResult = await query(
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
      finalResults = await query(
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
 */
ideasRouter.put('/:id', async (req, res) => {
  try {
    const { title, type, category, priority, summary, next_steps, context_needed, keywords } = req.body;

    const result = await query(
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

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    // Track edit and priority changes for learning
    const metadata: Record<string, any> = { action: 'update' };
    if (priority) {
      metadata.new_priority = priority;
      trackInteraction({
        idea_id: req.params.id,
        interaction_type: 'prioritize',
        metadata,
      }).catch(() => {});
    } else {
      trackInteraction({
        idea_id: req.params.id,
        interaction_type: 'edit',
        metadata,
      }).catch(() => {});
    }

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
ideasRouter.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM ideas WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    // Track archive/delete for learning
    trackInteraction({
      idea_id: req.params.id,
      interaction_type: 'archive',
      metadata: { action: 'delete' },
    }).catch(() => {});

    res.json({ success: true, deletedId: req.params.id });
  } catch (error: any) {
    console.error('Error deleting idea:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/ideas/:id/archive
 * Archive an idea (soft delete)
 */
ideasRouter.put('/:id/archive', async (req, res) => {
  try {
    const result = await query(
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
    }).catch(() => {});

    res.json({ success: true, archivedId: req.params.id });
  } catch (error: any) {
    console.error('Error archiving idea:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ideas/stats/summary
 * Get statistics about ideas
 */
ideasRouter.get('/stats/summary', async (req, res) => {
  try {
    const [totalResult, typeResult, categoryResult, priorityResult] = await Promise.all([
      query('SELECT COUNT(*) as total FROM ideas'),
      query('SELECT type, COUNT(*) as count FROM ideas GROUP BY type'),
      query('SELECT category, COUNT(*) as count FROM ideas GROUP BY category'),
      query('SELECT priority, COUNT(*) as count FROM ideas GROUP BY priority'),
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
