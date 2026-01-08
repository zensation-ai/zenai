import { Router, Request, Response } from 'express';
import { getPool, AIContext } from '../utils/database-context';

const router = Router();

// Get available contexts
router.get('/contexts', (req, res) => {
  res.json({
    contexts: [
      {
        id: 'personal',
        name: 'Personal',
        icon: '🏠',
        description: 'Private ideas and thoughts'
      },
      {
        id: 'work',
        name: 'Work',
        icon: '💼',
        description: 'Work projects and business ideas'
      }
    ],
    default: 'personal'
  });
});

/**
 * GET /api/:context/ideas
 * Fetch ideas for a specific context
 */
router.get('/:context/ideas', async (req: Request, res: Response) => {
  const { context } = req.params;
  const { limit = '50', offset = '0', type, priority, category } = req.query;

  if (!['personal', 'work'].includes(context)) {
    return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
  }

  try {
    const pool = getPool(context as AIContext);

    // Build query with optional filters
    let query = `
      SELECT
        id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, raw_transcript,
        created_at, updated_at
      FROM ideas
      WHERE is_archived = false
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (type) {
      query += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (priority) {
      query += ` AND priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM ideas WHERE is_archived = false');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      ideas: result.rows,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + result.rows.length < total
      },
      context
    });

  } catch (error) {
    console.error('Error fetching ideas:', error);
    res.status(500).json({ error: 'Failed to fetch ideas' });
  }
});

/**
 * GET /api/:context/ideas/archived
 * Fetch archived ideas for a specific context
 */
router.get('/:context/ideas/archived', async (req: Request, res: Response) => {
  const { context } = req.params;
  const { limit = '50', offset = '0' } = req.query;

  if (!['personal', 'work'].includes(context)) {
    return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
  }

  try {
    const pool = getPool(context as AIContext);

    const result = await pool.query(`
      SELECT
        id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, raw_transcript,
        created_at, updated_at
      FROM ideas
      WHERE is_archived = true
      ORDER BY updated_at DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit as string), parseInt(offset as string)]);

    const countResult = await pool.query('SELECT COUNT(*) FROM ideas WHERE is_archived = true');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      ideas: result.rows,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + result.rows.length < total
      },
      context
    });

  } catch (error) {
    console.error('Error fetching archived ideas:', error);
    res.status(500).json({ error: 'Failed to fetch archived ideas' });
  }
});

/**
 * PUT /api/:context/ideas/:id/archive
 * Archive an idea
 */
router.put('/:context/ideas/:id/archive', async (req: Request, res: Response) => {
  const { context, id } = req.params;

  if (!['personal', 'work'].includes(context)) {
    return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
  }

  try {
    const pool = getPool(context as AIContext);
    const result = await pool.query(
      'UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 RETURNING id, title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    res.json({ success: true, archivedId: id, idea: result.rows[0] });

  } catch (error) {
    console.error('Error archiving idea:', error);
    res.status(500).json({ error: 'Failed to archive idea' });
  }
});

/**
 * PUT /api/:context/ideas/:id/restore
 * Restore an archived idea
 */
router.put('/:context/ideas/:id/restore', async (req: Request, res: Response) => {
  const { context, id } = req.params;

  if (!['personal', 'work'].includes(context)) {
    return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
  }

  try {
    const pool = getPool(context as AIContext);
    const result = await pool.query(
      'UPDATE ideas SET is_archived = false, updated_at = NOW() WHERE id = $1 AND is_archived = true RETURNING id, title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Archived idea not found' });
    }

    res.json({ success: true, restoredId: id, idea: result.rows[0] });

  } catch (error) {
    console.error('Error restoring idea:', error);
    res.status(500).json({ error: 'Failed to restore idea' });
  }
});

/**
 * GET /api/:context/ideas/search
 * Search ideas within a specific context
 */
router.post('/:context/ideas/search', async (req: Request, res: Response) => {
  const { context } = req.params;
  const { query: searchQuery, limit = 20 } = req.body;

  if (!['personal', 'work'].includes(context)) {
    return res.status(400).json({ error: 'Invalid context. Use "personal" or "work".' });
  }

  if (!searchQuery) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    const pool = getPool(context as AIContext);

    // Full-text search using PostgreSQL
    const result = await pool.query(`
      SELECT
        id, title, type, category, priority, summary,
        next_steps, context_needed, keywords, raw_transcript,
        created_at, updated_at,
        ts_rank(
          to_tsvector('german', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(raw_transcript, '')),
          plainto_tsquery('german', $1)
        ) as rank
      FROM ideas
      WHERE is_archived = false
        AND to_tsvector('german', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(raw_transcript, ''))
        @@ plainto_tsquery('german', $1)
      ORDER BY rank DESC
      LIMIT $2
    `, [searchQuery, limit]);

    res.json({
      ideas: result.rows,
      query: searchQuery,
      context,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error searching ideas:', error);
    res.status(500).json({ error: 'Failed to search ideas' });
  }
});

export { router as contextsRouter };
