import { Router } from 'express';
import { query } from '../utils/database';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, ConflictError, NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export const companiesRouter = Router();

interface Company {
  id: string;
  name: string;
  description: string | null;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/companies
 * List all companies
 */
companiesRouter.get('/', apiKeyAuth, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM companies ORDER BY name');
  const companies = result.rows.map(formatCompany);
  res.json({ companies });
}));

/**
 * POST /api/companies
 * Create a new company
 */
companiesRouter.post('/', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const { id, name, description, settings } = req.body;

  if (!id || !name) {
    throw new ValidationError('id and name are required', { id: 'required', name: 'required' });
  }

  // Validate id format (alphanumeric, hyphens, underscores)
  if (!/^[a-z0-9_-]+$/i.test(id)) {
    throw new ValidationError(
      'id must contain only letters, numbers, hyphens, and underscores',
      { id: 'invalid format' }
    );
  }

  try {
    const result = await query(
      `INSERT INTO companies (id, name, description, settings)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, name, description || null, JSON.stringify(settings || {})]
    );

    res.status(201).json({ success: true, company: formatCompany(result.rows[0]) });
  } catch (error: any) {
    if (error.code === '23505') {
      throw new ConflictError('Company with this ID already exists');
    }
    throw error;
  }
}));

/**
 * GET /api/companies/:id
 * Get a single company with stats
 */
companiesRouter.get('/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  const [companyResult, statsResult] = await Promise.all([
    query('SELECT * FROM companies WHERE id = $1', [req.params.id]),
    query(
      `SELECT
        (SELECT COUNT(*) FROM ideas WHERE company_id = $1 AND is_archived = false) as ideas_count,
        (SELECT COUNT(*) FROM meetings WHERE company_id = $1) as meetings_count`,
      [req.params.id]
    ),
  ]);

  if (companyResult.rows.length === 0) {
    throw new NotFoundError('Company');
  }

  const company = formatCompany(companyResult.rows[0]);
  const stats = {
    ideas_count: parseInt(statsResult.rows[0].ideas_count),
    meetings_count: parseInt(statsResult.rows[0].meetings_count),
  };

  res.json({ company, stats });
}));

/**
 * PUT /api/companies/:id
 * Update a company
 */
companiesRouter.put('/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const { name, description, settings } = req.body;

  const result = await query(
    `UPDATE companies
     SET name = COALESCE($2, name),
         description = COALESCE($3, description),
         settings = COALESCE($4, settings),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      req.params.id,
      name || null,
      description,
      settings ? JSON.stringify(settings) : null,
    ]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Company');
  }

  res.json({ success: true, company: formatCompany(result.rows[0]) });
}));

/**
 * DELETE /api/companies/:id
 * Delete a company (only if no ideas/meetings)
 */
companiesRouter.delete('/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  // Don't allow deleting the personal company
  if (req.params.id === 'personal') {
    throw new ValidationError('Cannot delete the personal company');
  }

  // Check if company has any ideas or meetings
  const usageCheck = await query(
    `SELECT
      (SELECT COUNT(*) FROM ideas WHERE company_id = $1) as ideas_count,
      (SELECT COUNT(*) FROM meetings WHERE company_id = $1) as meetings_count`,
    [req.params.id]
  );

  const ideasCount = parseInt(usageCheck.rows[0].ideas_count);
  const meetingsCount = parseInt(usageCheck.rows[0].meetings_count);

  if (ideasCount > 0 || meetingsCount > 0) {
    throw new ValidationError(
      'Cannot delete company with existing ideas or meetings',
      { ideas_count: ideasCount.toString(), meetings_count: meetingsCount.toString() }
    );
  }

  const result = await query('DELETE FROM companies WHERE id = $1 RETURNING id', [req.params.id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Company');
  }

  res.json({ success: true, deleted_id: req.params.id });
}));

/**
 * GET /api/companies/:id/ideas
 * Get all ideas for a company
 */
companiesRouter.get('/:id/ideas', apiKeyAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const [ideasResult, countResult] = await Promise.all([
    query(
      `SELECT id, title, type, category, priority, summary, created_at
       FROM ideas
       WHERE company_id = $1 AND is_archived = false
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    ),
    query('SELECT COUNT(*) as total FROM ideas WHERE company_id = $1 AND is_archived = false', [req.params.id]),
  ]);

  res.json({
    ideas: ideasResult.rows,
    pagination: {
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
    },
  });
}));

/**
 * GET /api/companies/:id/meetings
 * Get all meetings for a company
 */
companiesRouter.get('/:id/meetings', apiKeyAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const [meetingsResult, countResult] = await Promise.all([
    query(
      `SELECT *
       FROM meetings
       WHERE company_id = $1
       ORDER BY date DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    ),
    query('SELECT COUNT(*) as total FROM meetings WHERE company_id = $1', [req.params.id]),
  ]);

  res.json({
    meetings: meetingsResult.rows.map((row) => ({
      ...row,
      participants: typeof row.participants === 'string' ? JSON.parse(row.participants) : row.participants,
    })),
    pagination: {
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
    },
  });
}));

/**
 * GET /api/companies/:id/stats
 * Get detailed stats for a company
 */
companiesRouter.get('/:id/stats', apiKeyAuth, asyncHandler(async (req, res) => {
  const [
    ideasByType,
    ideasByCategory,
    ideasByPriority,
    meetingsByType,
    recentActivity,
  ] = await Promise.all([
    query(
      `SELECT type, COUNT(*) as count FROM ideas WHERE company_id = $1 AND is_archived = false GROUP BY type`,
      [req.params.id]
    ),
    query(
      `SELECT category, COUNT(*) as count FROM ideas WHERE company_id = $1 AND is_archived = false GROUP BY category`,
      [req.params.id]
    ),
    query(
      `SELECT priority, COUNT(*) as count FROM ideas WHERE company_id = $1 AND is_archived = false GROUP BY priority`,
      [req.params.id]
    ),
    query(
      `SELECT meeting_type, COUNT(*) as count FROM meetings WHERE company_id = $1 GROUP BY meeting_type`,
      [req.params.id]
    ),
    query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM ideas WHERE company_id = $1 AND is_archived = false
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 30`,
      [req.params.id]
    ),
  ]);

  res.json({
    ideas: {
      by_type: ideasByType.rows.reduce((acc, row) => ({ ...acc, [row.type]: parseInt(row.count) }), {}),
      by_category: ideasByCategory.rows.reduce((acc, row) => ({ ...acc, [row.category]: parseInt(row.count) }), {}),
      by_priority: ideasByPriority.rows.reduce((acc, row) => ({ ...acc, [row.priority]: parseInt(row.count) }), {}),
    },
    meetings: {
      by_type: meetingsByType.rows.reduce((acc, row) => ({ ...acc, [row.meeting_type]: parseInt(row.count) }), {}),
    },
    recent_activity: recentActivity.rows.map((row) => ({
      date: row.date,
      count: parseInt(row.count),
    })),
  });
}));

// Helper function
function formatCompany(row: any): Company {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
