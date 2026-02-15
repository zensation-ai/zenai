/**
 * Learning Tasks Service
 *
 * Enables users to assign topics for the AI to study and deepen knowledge in.
 * Tracks learning progress, generates study plans, and provides insights.
 */

import { getPool, AIContext } from '../utils/database-context';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { parseJsonb } from '../types';

// Types
export interface LearningTask {
  id: string;
  user_id: string;
  context: AIContext;
  topic: string;
  description?: string;
  category?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'paused' | 'completed' | 'archived';
  start_date: Date;
  target_completion_date?: Date;
  completed_date?: Date;
  last_study_date?: Date;
  study_count: number;
  total_study_minutes: number;
  progress_percent: number;
  learning_outline?: string;
  key_concepts: string[];
  resources: LearningResource[];
  summary?: string;
  related_ideas: string[];
  related_meetings: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface LearningResource {
  type: 'book' | 'article' | 'video' | 'course' | 'website' | 'other';
  title: string;
  url?: string;
  notes?: string;
}

export interface LearningSession {
  id: string;
  task_id: string;
  user_id: string;
  session_type: 'study' | 'practice' | 'review' | 'quiz' | 'reflection';
  duration_minutes?: number;
  notes?: string;
  key_learnings: string[];
  questions: string[];
  ai_summary?: string;
  ai_feedback?: string;
  understanding_level?: number;
  created_at: Date;
}

export interface LearningInsight {
  id: string;
  user_id: string;
  task_id?: string;
  insight_type: 'pattern' | 'recommendation' | 'milestone' | 'connection' | 'suggestion';
  title: string;
  content: string;
  confidence: number;
  is_acknowledged: boolean;
  acknowledged_at?: Date;
  created_at: Date;
}

export interface LearningStats {
  total_tasks: number;
  active_tasks: number;
  completed_tasks: number;
  total_study_minutes: number;
  total_sessions: number;
  categories: Record<string, number>;
  avg_progress: number;
  insights_count: number;
}

// Configuration
const CONFIG = {
  DEFAULT_LIMIT: 50,
  MAX_OUTLINE_LENGTH: 5000,
  MIN_SESSION_MINUTES: 5,
};

// Learning task categories
export const LEARNING_CATEGORIES = [
  'leadership',
  'technology',
  'business',
  'personal_development',
  'communication',
  'creativity',
  'productivity',
  'health',
  'finance',
  'other',
] as const;

/**
 * Create a new learning task
 */
export async function createLearningTask(
  topic: string,
  options: {
    description?: string;
    category?: string;
    priority?: 'low' | 'medium' | 'high';
    target_completion_date?: Date;
    generate_outline?: boolean;
  } = {},
  userId: string = 'default',
  context: AIContext = 'personal'
): Promise<LearningTask> {
  const pool = getPool(context);
  const client = await pool.connect();
  const id = uuidv4();

  try {
    let learningOutline: string | null = null;

    // Generate learning outline if requested
    if (options.generate_outline) {
      learningOutline = await generateLearningOutline(topic, options.description);
    }

    const result = await client.query(
      `INSERT INTO daily_learning_tasks
       (id, user_id, context, topic, description, category, priority,
        target_completion_date, learning_outline, start_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW())
       RETURNING *`,
      [
        id,
        userId,
        context,
        topic,
        options.description || null,
        options.category || 'other',
        options.priority || 'medium',
        options.target_completion_date || null,
        learningOutline,
      ]
    );

    logger.debug('Created learning task', { id, topic, context });

    return parseTaskRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Get all learning tasks for a user
 */
export async function getLearningTasks(
  options: {
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  } = {},
  userId: string = 'default',
  context: AIContext = 'personal'
): Promise<{ tasks: LearningTask[]; total: number }> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const conditions: string[] = ['user_id = $1', 'context = $2'];
    const params: (string | number)[] = [userId, context];
    let paramIndex = 3;

    if (options.status && options.status !== 'all') {
      conditions.push(`status = $${paramIndex}`);
      params.push(options.status);
      paramIndex++;
    }

    if (options.category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(options.category);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM daily_learning_tasks WHERE ${whereClause}`,
      params
    );

    // Get tasks
    const limit = options.limit || CONFIG.DEFAULT_LIMIT;
    const offset = options.offset || 0;

    const result = await client.query(
      `SELECT * FROM daily_learning_tasks
       WHERE ${whereClause}
       ORDER BY
         CASE status
           WHEN 'active' THEN 1
           WHEN 'paused' THEN 2
           WHEN 'completed' THEN 3
           ELSE 4
         END,
         priority = 'high' DESC,
         updated_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      tasks: result.rows.map(parseTaskRow),
      total: parseInt(countResult.rows[0].total, 10),
    };
  } finally {
    client.release();
  }
}

/**
 * Get a single learning task by ID
 */
export async function getLearningTask(
  taskId: string,
  context: AIContext = 'personal'
): Promise<LearningTask | null> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT * FROM daily_learning_tasks WHERE id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return parseTaskRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Update a learning task
 */
export async function updateLearningTask(
  taskId: string,
  updates: Partial<Pick<LearningTask, 'topic' | 'description' | 'category' | 'priority' | 'status' | 'target_completion_date' | 'learning_outline' | 'summary'>>,
  context: AIContext = 'personal'
): Promise<LearningTask | null> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: (string | Date | null)[] = [];
    let paramIndex = 1;

    if (updates.topic !== undefined) {
      setClauses.push(`topic = $${paramIndex}`);
      params.push(updates.topic);
      paramIndex++;
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      params.push(updates.description);
      paramIndex++;
    }
    if (updates.category !== undefined) {
      setClauses.push(`category = $${paramIndex}`);
      params.push(updates.category);
      paramIndex++;
    }
    if (updates.priority !== undefined) {
      setClauses.push(`priority = $${paramIndex}`);
      params.push(updates.priority);
      paramIndex++;
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      params.push(updates.status);
      paramIndex++;

      // Set completed_date if completing
      if (updates.status === 'completed') {
        setClauses.push(`completed_date = NOW()`);
      }
    }
    if (updates.target_completion_date !== undefined) {
      setClauses.push(`target_completion_date = $${paramIndex}`);
      params.push(updates.target_completion_date);
      paramIndex++;
    }
    if (updates.learning_outline !== undefined) {
      setClauses.push(`learning_outline = $${paramIndex}`);
      params.push(updates.learning_outline);
      paramIndex++;
    }
    if (updates.summary !== undefined) {
      setClauses.push(`summary = $${paramIndex}`);
      params.push(updates.summary);
      paramIndex++;
    }

    params.push(taskId);

    const result = await client.query(
      `UPDATE daily_learning_tasks
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return null;
    }

    logger.debug('Updated learning task', { taskId, updates: Object.keys(updates) });

    return parseTaskRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Delete (archive) a learning task
 */
export async function deleteLearningTask(
  taskId: string,
  context: AIContext = 'personal'
): Promise<boolean> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE daily_learning_tasks
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [taskId]
    );

    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Log a study session for a task
 */
export async function logStudySession(
  taskId: string,
  session: {
    session_type?: 'study' | 'practice' | 'review' | 'quiz' | 'reflection';
    duration_minutes?: number;
    notes?: string;
    key_learnings?: string[];
    questions?: string[];
    understanding_level?: number;
  },
  userId: string = 'default',
  context: AIContext = 'personal'
): Promise<LearningSession> {
  const pool = getPool(context);
  const client = await pool.connect();
  const sessionId = uuidv4();

  try {
    await client.query('BEGIN');

    // Create the session
    const sessionResult = await client.query(
      `INSERT INTO learning_sessions
       (id, task_id, user_id, session_type, duration_minutes, notes,
        key_learnings, questions, understanding_level, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        sessionId,
        taskId,
        userId,
        session.session_type || 'study',
        session.duration_minutes || null,
        session.notes || null,
        JSON.stringify(session.key_learnings || []),
        JSON.stringify(session.questions || []),
        session.understanding_level || null,
      ]
    );

    // Update task statistics
    await client.query(
      `UPDATE daily_learning_tasks
       SET study_count = study_count + 1,
           total_study_minutes = total_study_minutes + COALESCE($2, 0),
           last_study_date = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [taskId, session.duration_minutes || 0]
    );

    await client.query('COMMIT');

    logger.debug('Logged study session', { sessionId, taskId, duration: session.duration_minutes });

    return parseSessionRow(sessionResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get study sessions for a task
 */
export async function getStudySessions(
  taskId: string,
  limit: number = 20,
  context: AIContext = 'personal'
): Promise<LearningSession[]> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    // PERFORMANCE: Explicit column selection instead of SELECT *
    const result = await client.query(
      `SELECT id, task_id, user_id, session_type, duration_minutes, notes,
              key_learnings, questions, ai_summary, ai_feedback,
              understanding_level, created_at
       FROM learning_sessions
       WHERE task_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [taskId, limit]
    );

    return result.rows.map(parseSessionRow);
  } finally {
    client.release();
  }
}

/**
 * Get learning statistics for a user
 */
export async function getLearningStats(
  userId: string = 'default',
  context: AIContext = 'personal'
): Promise<LearningStats> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT
         COUNT(*) as total_tasks,
         COUNT(*) FILTER (WHERE status = 'active') as active_tasks,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
         COALESCE(SUM(total_study_minutes), 0) as total_study_minutes,
         COALESCE(AVG(progress_percent), 0) as avg_progress
       FROM daily_learning_tasks
       WHERE user_id = $1 AND context = $2 AND status != 'archived'`,
      [userId, context]
    );

    const sessionCount = await client.query(
      `SELECT COUNT(*) as count FROM learning_sessions
       WHERE user_id = $1`,
      [userId]
    );

    const categoryResult = await client.query(
      `SELECT category, COUNT(*) as count
       FROM daily_learning_tasks
       WHERE user_id = $1 AND context = $2 AND status != 'archived'
       GROUP BY category`,
      [userId, context]
    );

    const insightsResult = await client.query(
      `SELECT COUNT(*) as count FROM learning_insights
       WHERE user_id = $1 AND is_acknowledged = false`,
      [userId]
    );

    const stats = result.rows[0];
    const categories: Record<string, number> = {};
    categoryResult.rows.forEach((row: { category: string; count: string }) => {
      categories[row.category || 'other'] = parseInt(row.count, 10);
    });

    return {
      total_tasks: parseInt(stats.total_tasks, 10),
      active_tasks: parseInt(stats.active_tasks, 10),
      completed_tasks: parseInt(stats.completed_tasks, 10),
      total_study_minutes: parseInt(stats.total_study_minutes, 10),
      total_sessions: parseInt(sessionCount.rows[0].count, 10),
      categories,
      avg_progress: Math.round(parseFloat(stats.avg_progress)),
      insights_count: parseInt(insightsResult.rows[0].count, 10),
    };
  } finally {
    client.release();
  }
}

/**
 * Generate a learning outline for a topic using AI
 * Uses OpenAI in production, Ollama in local development
 */
export async function generateLearningOutline(
  topic: string,
  description?: string
): Promise<string> {
  try {
    const { generateText } = await import('../utils/ollama');

    const prompt = `Erstelle einen strukturierten Lernplan für folgendes Thema:

Thema: ${topic}
${description ? `Beschreibung: ${description}` : ''}

Erstelle einen detaillierten Lernplan mit:
1. Lernziele (3-5 konkrete Ziele)
2. Kernkonzepte die verstanden werden müssen
3. Empfohlene Lernschritte (mit geschätzter Zeit)
4. Praktische Übungen
5. Erfolgskriterien

Formatiere den Plan übersichtlich mit Markdown.`;

    const result = await generateText(prompt, {
      systemPrompt: 'Du bist ein Lern-Experte. Erstelle hilfreiche, strukturierte Lernpläne.',
      temperature: 0.7,
      maxTokens: 1000,
    });

    if (result) {
      return result.slice(0, CONFIG.MAX_OUTLINE_LENGTH);
    }
    return `Lernplan für: ${topic}\n\n(Automatische Generierung nicht verfügbar)`;
  } catch (error) {
    logger.error('Failed to generate learning outline', error instanceof Error ? error : undefined);
    return `Lernplan für: ${topic}\n\n(Automatische Generierung nicht verfügbar)`;
  }
}

/**
 * Update task progress based on sessions and understanding
 */
export async function updateTaskProgress(
  taskId: string,
  context: AIContext = 'personal'
): Promise<number> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    // Calculate progress based on sessions and understanding levels
    const result = await client.query(
      `SELECT
         COUNT(*) as session_count,
         AVG(understanding_level) as avg_understanding,
         SUM(duration_minutes) as total_minutes
       FROM learning_sessions
       WHERE task_id = $1`,
      [taskId]
    );

    const stats = result.rows[0];
    const sessionCount = parseInt(stats.session_count, 10) || 0;
    const avgUnderstanding = parseFloat(stats.avg_understanding) || 0;

    // Progress formula: combination of session count, time spent, and understanding
    // Max 100%
    const sessionProgress = Math.min(sessionCount * 10, 40);  // Up to 40% from sessions
    const understandingProgress = (avgUnderstanding / 5) * 40; // Up to 40% from understanding
    const timeProgress = Math.min((parseInt(stats.total_minutes, 10) || 0) / 60, 20); // Up to 20% from time

    const progress = Math.min(Math.round(sessionProgress + understandingProgress + timeProgress), 100);

    // Update task progress
    await client.query(
      `UPDATE daily_learning_tasks
       SET progress_percent = $2, updated_at = NOW()
       WHERE id = $1`,
      [taskId, progress]
    );

    return progress;
  } finally {
    client.release();
  }
}

/**
 * Get unacknowledged learning insights
 */
export async function getLearningInsights(
  userId: string = 'default',
  context: AIContext = 'personal'
): Promise<LearningInsight[]> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT li.*, dlt.topic as task_topic
       FROM learning_insights li
       LEFT JOIN daily_learning_tasks dlt ON li.task_id = dlt.id
       WHERE li.user_id = $1 AND li.is_acknowledged = false
       ORDER BY li.created_at DESC
       LIMIT 10`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      task_id: row.task_id,
      insight_type: row.insight_type,
      title: row.title,
      content: row.content,
      confidence: parseFloat(row.confidence),
      is_acknowledged: row.is_acknowledged,
      acknowledged_at: row.acknowledged_at,
      created_at: row.created_at,
    }));
  } finally {
    client.release();
  }
}

/**
 * Acknowledge a learning insight
 */
export async function acknowledgeInsight(
  insightId: string,
  context: AIContext = 'personal'
): Promise<boolean> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE learning_insights
       SET is_acknowledged = true, acknowledged_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [insightId]
    );

    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Get daily learning summary
 */
export async function getDailyLearningSummary(
  userId: string = 'default',
  context: AIContext = 'personal'
): Promise<{
  tasks_studied_today: number;
  minutes_today: number;
  sessions_today: number;
  streak_days: number;
  next_recommended_task?: LearningTask;
}> {
  const pool = getPool(context);
  const client = await pool.connect();

  try {
    // Get today's stats
    const todayResult = await client.query(
      `SELECT
         COUNT(DISTINCT task_id) as tasks_studied,
         COALESCE(SUM(duration_minutes), 0) as total_minutes,
         COUNT(*) as session_count
       FROM learning_sessions
       WHERE user_id = $1
         AND created_at >= CURRENT_DATE`,
      [userId]
    );

    // Get streak (consecutive days with sessions)
    const streakResult = await client.query(
      `WITH daily_sessions AS (
         SELECT DATE(created_at) as session_date
         FROM learning_sessions
         WHERE user_id = $1
         GROUP BY DATE(created_at)
       ),
       numbered AS (
         SELECT session_date,
                session_date - ROW_NUMBER() OVER (ORDER BY session_date)::int as grp
         FROM daily_sessions
       )
       SELECT COUNT(*) as streak
       FROM numbered
       WHERE grp = (SELECT grp FROM numbered WHERE session_date = CURRENT_DATE)`,
      [userId]
    );

    // Get next recommended task (active task with oldest last_study_date)
    const nextTaskResult = await client.query(
      `SELECT * FROM daily_learning_tasks
       WHERE user_id = $1 AND context = $2 AND status = 'active'
       ORDER BY last_study_date NULLS FIRST, priority = 'high' DESC
       LIMIT 1`,
      [userId, context]
    );

    const today = todayResult.rows[0];
    const streak = parseInt(streakResult.rows[0]?.streak, 10) || 0;

    return {
      tasks_studied_today: parseInt(today.tasks_studied, 10),
      minutes_today: parseInt(today.total_minutes, 10),
      sessions_today: parseInt(today.session_count, 10),
      streak_days: streak,
      next_recommended_task: nextTaskResult.rows.length > 0
        ? parseTaskRow(nextTaskResult.rows[0])
        : undefined,
    };
  } finally {
    client.release();
  }
}

// Helper functions

function parseTaskRow(row: Record<string, unknown>): LearningTask {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    context: row.context as AIContext,
    topic: row.topic as string,
    description: row.description as string | undefined,
    category: row.category as string | undefined,
    priority: row.priority as 'low' | 'medium' | 'high',
    status: row.status as 'active' | 'paused' | 'completed' | 'archived',
    start_date: row.start_date as Date,
    target_completion_date: row.target_completion_date as Date | undefined,
    completed_date: row.completed_date as Date | undefined,
    last_study_date: row.last_study_date as Date | undefined,
    study_count: parseInt(row.study_count as string, 10) || 0,
    total_study_minutes: parseInt(row.total_study_minutes as string, 10) || 0,
    progress_percent: parseInt(row.progress_percent as string, 10) || 0,
    learning_outline: row.learning_outline as string | undefined,
    key_concepts: (parseJsonb(row.key_concepts) || []) as string[],
    resources: (parseJsonb(row.resources) || []) as LearningResource[],
    summary: row.summary as string | undefined,
    related_ideas: (parseJsonb(row.related_ideas) || []) as string[],
    related_meetings: (parseJsonb(row.related_meetings) || []) as string[],
    metadata: (parseJsonb(row.metadata) || {}) as Record<string, unknown>,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

function parseSessionRow(row: Record<string, unknown>): LearningSession {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    user_id: row.user_id as string,
    session_type: row.session_type as 'study' | 'practice' | 'review' | 'quiz' | 'reflection',
    duration_minutes: row.duration_minutes ? parseInt(row.duration_minutes as string, 10) : undefined,
    notes: row.notes as string | undefined,
    key_learnings: (parseJsonb(row.key_learnings) || []) as string[],
    questions: (parseJsonb(row.questions) || []) as string[],
    ai_summary: row.ai_summary as string | undefined,
    ai_feedback: row.ai_feedback as string | undefined,
    understanding_level: row.understanding_level ? parseInt(row.understanding_level as string, 10) : undefined,
    created_at: row.created_at as Date,
  };
}

// parseJsonb imported from ../types - centralized implementation
