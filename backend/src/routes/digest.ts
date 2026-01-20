/**
 * Phase 20: Digest & Insights Routes
 *
 * Provides AI-powered daily digests and weekly insights:
 * - Generate daily summary of ideas
 * - Weekly insights with patterns and recommendations
 * - Historical digest retrieval
 * - Productivity scoring
 */

import { Router, Request, Response } from 'express';
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import axios from 'axios';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';

export const digestRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// ===========================================
// Types
// ===========================================

interface DigestData {
  id: string;
  type: 'daily' | 'weekly';
  periodStart: string;
  periodEnd: string;
  title: string;
  summary: string;
  highlights: DigestHighlight[];
  statistics: DigestStats;
  aiInsights: string[];
  recommendations: string[];
  ideasCount: number;
  topCategories: string[];
  topTypes: string[];
  productivityScore: number;
  createdAt: string;
}

interface DigestHighlight {
  id: string;
  title: string;
  type: string;
  category: string;
  reason: string;
}

interface DigestStats {
  totalIdeas: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  avgPerDay: number;
}

// ===========================================
// Generate Daily Digest
// ===========================================

/**
 * POST /api/:context/digest/generate/daily
 * Generate a daily digest for today or a specific date
 */
digestRouter.post('/:context/digest/generate/daily', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { date } = req.body; // Optional: specific date (YYYY-MM-DD)

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;
  const targetDate = date || new Date().toISOString().split('T')[0];

  // Check if digest already exists for this date
  const existingDigest = await queryContext(ctx, `
    SELECT id, type, period_start, period_end, title, summary,
           highlights, statistics, ai_insights, recommendations,
           ideas_count, top_categories, top_types, productivity_score,
           context, created_at, updated_at
    FROM digests
    WHERE type = 'daily' AND period_start = $1 AND context = $2
  `, [targetDate, ctx]);

  if (existingDigest.rows.length > 0) {
    return res.json({
      success: true,
      data: formatDigestResponse(existingDigest.rows[0]),
      cached: true
    });
  }

  // Get ideas from the target date
  const ideasResult = await queryContext(ctx, `
    SELECT id, title, type, category, priority, summary, created_at
    FROM ideas
    WHERE DATE(created_at) = $1 AND is_archived = false
    ORDER BY created_at DESC
  `, [targetDate]);

  const ideas = ideasResult.rows;

  if (ideas.length === 0) {
    return res.json({
      success: true,
      data: null,
      message: 'No ideas found for this date'
    });
  }

  // Calculate statistics
  const stats = calculateStats(ideas);

  // Get top highlights (high priority or interesting)
  const highlights = ideas
    .filter(i => i.priority === 'high' || i.type === 'insight')
    .slice(0, 5)
    .map(i => ({
      id: i.id,
      title: i.title,
      type: i.type,
      category: i.category,
      reason: i.priority === 'high' ? 'Hohe Priorität' : 'Wichtige Erkenntnis'
    }));

  // Generate AI insights
  const aiInsights = await generateAIInsights(ideas, 'daily', ctx);

  // Calculate productivity score
  const productivityScore = calculateProductivityScore(ideas, 'daily');

  // Store the digest
  const digest = await queryContext(ctx, `
    INSERT INTO digests (
      type, period_start, period_end, title, summary,
      highlights, statistics, ai_insights, recommendations,
      ideas_count, top_categories, top_types, productivity_score
    ) VALUES (
      'daily', $1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    RETURNING *
  `, [
    targetDate,
    `Täglicher Digest - ${formatGermanDate(targetDate)}`,
    aiInsights.summary,
    JSON.stringify(highlights),
    JSON.stringify(stats),
    aiInsights.insights,
    aiInsights.recommendations,
    ideas.length,
    stats.topCategories,
    stats.topTypes,
    productivityScore
  ]);

  logger.info('Daily digest generated', { context, date: targetDate, ideasCount: ideas.length });

  res.json({
    success: true,
    data: formatDigestResponse(digest.rows[0]),
    cached: false
  });
}));

// ===========================================
// Generate Weekly Digest
// ===========================================

/**
 * POST /api/:context/digest/generate/weekly
 * Generate a weekly digest for the current or previous week
 */
digestRouter.post('/:context/digest/generate/weekly', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { weekOffset = 0 } = req.body; // 0 = current week, -1 = last week

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;

  // Calculate week boundaries (handle Sunday correctly)
  const today = new Date();
  const dayOfWeek = today.getDay();
  // Sunday (0) should go back 6 days, Monday (1) stays, etc.
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysToMonday + (weekOffset * 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const periodStart = monday.toISOString().split('T')[0];
  const periodEnd = sunday.toISOString().split('T')[0];

  // Check if digest already exists
  const existingDigest = await queryContext(ctx, `
    SELECT * FROM digests
    WHERE type = 'weekly' AND period_start = $1 AND period_end = $2
  `, [periodStart, periodEnd]);

  if (existingDigest.rows.length > 0) {
    return res.json({
      success: true,
      data: formatDigestResponse(existingDigest.rows[0]),
      cached: true
    });
  }

  // Get ideas from the week
  const ideasResult = await queryContext(ctx, `
    SELECT id, title, type, category, priority, summary, created_at
    FROM ideas
    WHERE created_at >= $1 AND created_at < $2::date + INTERVAL '1 day'
      AND is_archived = false
    ORDER BY created_at DESC
  `, [periodStart, periodEnd]);

  const ideas = ideasResult.rows;

  if (ideas.length === 0) {
    return res.json({
      success: true,
      data: null,
      message: 'No ideas found for this week'
    });
  }

  // Calculate statistics
  const stats = calculateStats(ideas);

  // Get weekly highlights
  const highlights = selectWeeklyHighlights(ideas);

  // Generate AI insights (more comprehensive for weekly)
  const aiInsights = await generateAIInsights(ideas, 'weekly', ctx);

  // Calculate productivity score
  const productivityScore = calculateProductivityScore(ideas, 'weekly');

  // Store the digest
  const digest = await queryContext(ctx, `
    INSERT INTO digests (
      type, period_start, period_end, title, summary,
      highlights, statistics, ai_insights, recommendations,
      ideas_count, top_categories, top_types, productivity_score
    ) VALUES (
      'weekly', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    RETURNING *
  `, [
    periodStart,
    periodEnd,
    `Wöchentliche Insights - KW ${getWeekNumber(monday)}`,
    aiInsights.summary,
    JSON.stringify(highlights),
    JSON.stringify(stats),
    aiInsights.insights,
    aiInsights.recommendations,
    ideas.length,
    stats.topCategories,
    stats.topTypes,
    productivityScore
  ]);

  logger.info('Weekly digest generated', {
    context,
    periodStart,
    periodEnd,
    ideasCount: ideas.length
  });

  res.json({
    success: true,
    data: formatDigestResponse(digest.rows[0]),
    cached: false
  });
}));

// ===========================================
// Get Digest History
// ===========================================

/**
 * GET /api/:context/digest/history
 * Get historical digests
 */
digestRouter.get('/:context/digest/history', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { type, limit = '10' } = req.query;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;

  let query = `
    SELECT * FROM digests
    WHERE 1=1
  `;
  const params: any[] = [];

  if (type === 'daily' || type === 'weekly') {
    params.push(type);
    query += ` AND type = $${params.length}`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit as string));

  const result = await queryContext(ctx, query, params);

  res.json({
    success: true,
    data: result.rows.map(formatDigestResponse)
  });
}));

// ===========================================
// Get Latest Digest
// ===========================================

/**
 * GET /api/:context/digest/latest
 * Get the most recent digest
 */
digestRouter.get('/:context/digest/latest', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { type } = req.query;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;

  let query = `
    SELECT * FROM digests
    WHERE 1=1
  `;
  const params: any[] = [];

  if (type === 'daily' || type === 'weekly') {
    params.push(type);
    query += ` AND type = $${params.length}`;
  }

  query += ` ORDER BY created_at DESC LIMIT 1`;

  const result = await queryContext(ctx, query, params);

  if (result.rows.length === 0) {
    return res.json({
      success: true,
      data: null,
      message: 'No digest found'
    });
  }

  res.json({
    success: true,
    data: formatDigestResponse(result.rows[0])
  });
}));

// ===========================================
// Get Productivity Goals
// ===========================================

/**
 * GET /api/:context/digest/goals
 * Get productivity goals
 */
digestRouter.get('/:context/digest/goals', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;

  const result = await queryContext(ctx, `
    SELECT * FROM productivity_goals WHERE id = 1
  `);

  if (result.rows.length === 0) {
    // Initialize defaults
    await queryContext(ctx, `
      INSERT INTO productivity_goals (id) VALUES (1) ON CONFLICT DO NOTHING
    `);
    return res.json({
      success: true,
      data: {
        dailyIdeasTarget: 3,
        weeklyIdeasTarget: 15,
        focusCategories: [],
        enabledInsights: true,
        digestTime: '09:00'
      }
    });
  }

  const row = result.rows[0];
  res.json({
    success: true,
    data: {
      dailyIdeasTarget: row.daily_ideas_target,
      weeklyIdeasTarget: row.weekly_ideas_target,
      focusCategories: row.focus_categories || [],
      enabledInsights: row.enabled_insights,
      digestTime: row.digest_time
    }
  });
}));

/**
 * PUT /api/:context/digest/goals
 * Update productivity goals
 */
digestRouter.put('/:context/digest/goals', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { dailyIdeasTarget, weeklyIdeasTarget, focusCategories, enabledInsights, digestTime } = req.body;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;

  await queryContext(ctx, `
    UPDATE productivity_goals SET
      daily_ideas_target = COALESCE($1, daily_ideas_target),
      weekly_ideas_target = COALESCE($2, weekly_ideas_target),
      focus_categories = COALESCE($3, focus_categories),
      enabled_insights = COALESCE($4, enabled_insights),
      digest_time = COALESCE($5, digest_time),
      updated_at = NOW()
    WHERE id = 1
  `, [dailyIdeasTarget, weeklyIdeasTarget, focusCategories, enabledInsights, digestTime]);

  res.json({
    success: true,
    message: 'Productivity goals updated'
  });
}));

// ===========================================
// Helper Functions
// ===========================================

function calculateStats(ideas: any[]): DigestStats & { topCategories: string[], topTypes: string[] } {
  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  ideas.forEach(idea => {
    byType[idea.type] = (byType[idea.type] || 0) + 1;
    byCategory[idea.category] = (byCategory[idea.category] || 0) + 1;
    byPriority[idea.priority] = (byPriority[idea.priority] || 0) + 1;
  });

  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  const topTypes = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type);

  // Calculate unique days for accurate avgPerDay
  const uniqueDays = new Set(ideas.map(i =>
    new Date(i.created_at).toISOString().split('T')[0]
  )).size || 1;

  return {
    totalIdeas: ideas.length,
    byType,
    byCategory,
    byPriority,
    avgPerDay: Math.round((ideas.length / uniqueDays) * 10) / 10,
    topCategories,
    topTypes
  };
}

function selectWeeklyHighlights(ideas: any[]): DigestHighlight[] {
  const highlights: DigestHighlight[] = [];

  // High priority items
  const highPriority = ideas.filter(i => i.priority === 'high').slice(0, 3);
  highPriority.forEach(i => {
    highlights.push({
      id: i.id,
      title: i.title,
      type: i.type,
      category: i.category,
      reason: 'Hohe Priorität'
    });
  });

  // Key insights
  const insights = ideas.filter(i => i.type === 'insight').slice(0, 2);
  insights.forEach(i => {
    if (!highlights.find(h => h.id === i.id)) {
      highlights.push({
        id: i.id,
        title: i.title,
        type: i.type,
        category: i.category,
        reason: 'Wichtige Erkenntnis'
      });
    }
  });

  return highlights.slice(0, 5);
}

async function generateAIInsights(
  ideas: any[],
  type: 'daily' | 'weekly',
  context: AIContext
): Promise<{ summary: string; insights: string[]; recommendations: string[] }> {
  const ideaSummaries = ideas.slice(0, 20).map(i =>
    `- ${i.title} (${i.type}, ${i.category}, Priorität: ${i.priority})`
  ).join('\n');

  const prompt = type === 'daily'
    ? `Analysiere diese ${ideas.length} Gedanken/Ideen von heute und erstelle:
1. Eine kurze Zusammenfassung (2-3 Sätze)
2. 2-3 wichtige Erkenntnisse
3. 1-2 Empfehlungen für morgen

Gedanken:
${ideaSummaries}

Antworte auf Deutsch im JSON Format:
{
  "summary": "Zusammenfassung...",
  "insights": ["Erkenntnis 1", "Erkenntnis 2"],
  "recommendations": ["Empfehlung 1"]
}`
    : `Analysiere diese ${ideas.length} Gedanken/Ideen der Woche und erstelle:
1. Eine Wochenzusammenfassung (3-4 Sätze)
2. 3-5 wichtige Erkenntnisse und Muster
3. 2-3 strategische Empfehlungen für nächste Woche

Gedanken:
${ideaSummaries}

Antworte auf Deutsch im JSON Format:
{
  "summary": "Wochenzusammenfassung...",
  "insights": ["Erkenntnis 1", "Erkenntnis 2", "Erkenntnis 3"],
  "recommendations": ["Empfehlung 1", "Empfehlung 2"]
}`;

  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: 'mistral:q8_0',
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 500
        }
      },
      { timeout: 60000 }
    );

    const text = response.data.response;
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || 'Keine Zusammenfassung verfügbar',
        insights: parsed.insights || [],
        recommendations: parsed.recommendations || []
      };
    }
  } catch (error) {
    logger.warn('AI insights generation failed, using fallback', { error });
  }

  // Fallback without AI
  const typeCount = ideas.filter(i => i.type === 'idea').length;
  const taskCount = ideas.filter(i => i.type === 'task').length;

  return {
    summary: type === 'daily'
      ? `Heute wurden ${ideas.length} Gedanken erfasst, darunter ${typeCount} Ideen und ${taskCount} Aufgaben.`
      : `Diese Woche wurden ${ideas.length} Gedanken erfasst. Die produktivsten Kategorien waren: ${ideas.slice(0, 3).map(i => i.category).join(', ')}.`,
    insights: [
      `${ideas.length} Gedanken insgesamt erfasst`,
      ideas.filter(i => i.priority === 'high').length > 0
        ? `${ideas.filter(i => i.priority === 'high').length} hochpriorisierte Items`
        : 'Keine dringenden Items'
    ],
    recommendations: [
      'Weiter regelmäßig Gedanken festhalten',
      ideas.filter(i => i.type === 'task').length > 3
        ? 'Aufgabenliste priorisieren und abarbeiten'
        : 'Fokus auf neue Ideen entwickeln'
    ]
  };
}

function calculateProductivityScore(ideas: any[], type: 'daily' | 'weekly'): number {
  const target = type === 'daily' ? 3 : 15;
  const baseScore = Math.min(100, (ideas.length / target) * 100);

  // Bonus for high priority items
  const highPriorityBonus = ideas.filter(i => i.priority === 'high').length * 2;

  // Bonus for variety
  const uniqueCategories = new Set(ideas.map(i => i.category)).size;
  const varietyBonus = uniqueCategories * 3;

  return Math.min(100, Math.round(baseScore + highPriorityBonus + varietyBonus));
}

function formatDigestResponse(row: any): DigestData {
  return {
    id: row.id,
    type: row.type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    title: row.title,
    summary: row.summary,
    highlights: row.highlights || [],
    statistics: row.statistics || {},
    aiInsights: row.ai_insights || [],
    recommendations: row.recommendations || [],
    ideasCount: row.ideas_count,
    topCategories: row.top_categories || [],
    topTypes: row.top_types || [],
    productivityScore: parseFloat(row.productivity_score) || 0,
    createdAt: row.created_at
  };
}

function formatGermanDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}
