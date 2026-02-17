/**
 * Business Reports Routes
 *
 * AI-generated weekly/monthly business reports.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler';
// pool.query() is used intentionally — business tables are global (not per-context schema)
import { pool } from '../../utils/database';
import { reportGenerator } from '../../services/business';

export const reportsRouter = Router();

/**
 * GET /api/business/reports
 * List generated reports
 */
reportsRouter.get('/', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);

  const query = type
    ? `SELECT * FROM business_reports WHERE report_type = $1 ORDER BY period_end DESC LIMIT $2`
    : `SELECT * FROM business_reports ORDER BY period_end DESC LIMIT $1`;

  const result = type
    ? await pool.query(query, [type, limit])
    : await pool.query(query, [limit]);

  res.json({ success: true, reports: result.rows, count: result.rows.length });
}));

/**
 * POST /api/business/reports/generate
 * Generate a new business report
 */
reportsRouter.post('/generate', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const type = (req.body.type as string) || 'weekly';
  if (!['weekly', 'monthly', 'quarterly'].includes(type)) {
    throw new ValidationError('Invalid report type. Use weekly, monthly, or quarterly.');
  }

  if (type === 'monthly') {
    await reportGenerator.generateMonthlyReport();
  } else {
    await reportGenerator.generateWeeklyReport();
  }

  const result = await pool.query(`
    SELECT * FROM business_reports
    ORDER BY generated_at DESC
    LIMIT 1
  `);

  res.json({ success: true, report: result.rows[0] ?? null });
}));

/**
 * GET /api/business/reports/latest
 * Get the most recent report
 */
reportsRouter.get('/latest', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const type = (req.query.type as string) || 'weekly';

  const result = await pool.query(`
    SELECT * FROM business_reports
    WHERE report_type = $1
    ORDER BY period_end DESC
    LIMIT 1
  `, [type]);

  res.json({
    success: true,
    report: result.rows.length > 0 ? result.rows[0] : null,
  });
}));
