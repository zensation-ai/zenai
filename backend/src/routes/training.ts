import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getPool, AIContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';

const router = Router();

// Training types
type TrainingType = 'category' | 'priority' | 'type' | 'tone' | 'general';

interface TrainingRequest {
  idea_id: string;
  training_type: TrainingType;
  corrected_category?: string;
  corrected_priority?: string;
  corrected_type?: string;
  tone_feedback?: string;
  feedback?: string;
}

interface _TrainingItem {
  id: string;
  idea_id: string;
  context: string;
  training_type: TrainingType;
  original_value: string | null;
  corrected_value: string | null;
  corrected_category: string | null;
  corrected_priority: string | null;
  corrected_type: string | null;
  tone_feedback: string | null;
  feedback: string | null;
  weight: number;
  created_at: Date;
}

// Weight multipliers for different training types
const TRAINING_WEIGHTS: Record<TrainingType, number> = {
  category: 8,
  priority: 6,
  type: 7,
  tone: 10,  // Tone adjustments have highest impact
  general: 5
};

/**
 * GET /api/:context/training
 * Fetch training history for a specific context
 */
router.get('/:context/training', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const pool = getPool(context as AIContext);

  const result = await pool.query(`
    SELECT
      t.id,
      t.idea_id,
      t.context,
      t.training_type,
      t.original_value,
      t.corrected_value,
      t.corrected_category,
      t.corrected_priority,
      t.corrected_type,
      t.tone_feedback,
      t.feedback,
      t.weight,
      t.created_at
    FROM user_training t
    ORDER BY t.created_at DESC
    LIMIT 50
  `);

  res.json({
    trainings: result.rows,
    total: result.rows.length
  });
}));

/**
 * POST /api/:context/training
 * Submit a new training correction
 */
router.post('/:context/training', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const body = req.body as TrainingRequest;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  if (!body.idea_id || !body.training_type) {
    throw new ValidationError('idea_id and training_type are required');
  }

  const pool = getPool(context as AIContext);

  // Get the original idea to store original values
  const ideaResult = await pool.query(
    'SELECT id, category, priority, type FROM ideas WHERE id = $1',
    [body.idea_id]
  );

  if (ideaResult.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const idea = ideaResult.rows[0];

  // Determine original and corrected values based on training type
  let originalValue: string | null = null;
  let correctedValue: string | null = null;

  switch (body.training_type) {
    case 'category':
      originalValue = idea.category;
      correctedValue = body.corrected_category || null;
      break;
    case 'priority':
      originalValue = idea.priority;
      correctedValue = body.corrected_priority || null;
      break;
    case 'type':
      originalValue = idea.type;
      correctedValue = body.corrected_type || null;
      break;
    case 'tone':
      originalValue = null;
      correctedValue = body.tone_feedback || null;
      break;
    case 'general':
      originalValue = null;
      correctedValue = null;
      break;
  }

  // Calculate weight based on training type
  const weight = TRAINING_WEIGHTS[body.training_type];

  const trainingId = uuidv4();

  // Insert training record
  const insertResult = await pool.query(`
    INSERT INTO user_training (
      id, idea_id, context, training_type,
      original_value, corrected_value,
      corrected_category, corrected_priority, corrected_type,
      tone_feedback, feedback, weight, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    RETURNING *
  `, [
    trainingId,
    body.idea_id,
    context,
    body.training_type,
    originalValue,
    correctedValue,
    body.corrected_category || null,
    body.corrected_priority || null,
    body.corrected_type || null,
    body.tone_feedback || null,
    body.feedback || null,
    weight
  ]);

  const training = insertResult.rows[0];

  // Apply the correction to the idea if applicable
  if (body.training_type === 'category' && body.corrected_category) {
    await pool.query(
      'UPDATE ideas SET category = $1, updated_at = NOW() WHERE id = $2',
      [body.corrected_category, body.idea_id]
    );
  } else if (body.training_type === 'priority' && body.corrected_priority) {
    await pool.query(
      'UPDATE ideas SET priority = $1, updated_at = NOW() WHERE id = $2',
      [body.corrected_priority, body.idea_id]
    );
  } else if (body.training_type === 'type' && body.corrected_type) {
    await pool.query(
      'UPDATE ideas SET type = $1, updated_at = NOW() WHERE id = $2',
      [body.corrected_type, body.idea_id]
    );
  }

  // Update user profile learning preferences if tone feedback
  if (body.training_type === 'tone' && body.tone_feedback) {
    await updateTonePreference(pool, body.tone_feedback, weight);
  }

  logger.info('Training saved', { trainingType: body.training_type, ideaId: body.idea_id, weight });

  res.status(201).json({
    success: true,
    training: training,
    message: `Training gespeichert mit Gewicht ${weight}`
  });
}));

/**
 * GET /api/:context/training/stats
 * Get training statistics
 */
router.get('/:context/training/stats', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const pool = getPool(context as AIContext);

  const result = await pool.query(`
    SELECT
      COUNT(*) as total_trainings,
      COUNT(*) FILTER (WHERE training_type = 'category') as category_corrections,
      COUNT(*) FILTER (WHERE training_type = 'priority') as priority_corrections,
      COUNT(*) FILTER (WHERE training_type = 'type') as type_corrections,
      COUNT(*) FILTER (WHERE training_type = 'tone') as tone_corrections,
      COUNT(*) FILTER (WHERE training_type = 'general') as general_feedback,
      SUM(weight) as total_weight,
      AVG(weight) as avg_weight
    FROM user_training
  `);

  const stats = result.rows[0];

  res.json({
    context,
    stats: {
      totalTrainings: parseInt(stats.total_trainings) || 0,
      categoryCorrections: parseInt(stats.category_corrections) || 0,
      priorityCorrections: parseInt(stats.priority_corrections) || 0,
      typeCorrections: parseInt(stats.type_corrections) || 0,
      toneCorrections: parseInt(stats.tone_corrections) || 0,
      generalFeedback: parseInt(stats.general_feedback) || 0,
      totalWeight: parseInt(stats.total_weight) || 0,
      avgWeight: parseFloat(stats.avg_weight) || 0
    }
  });
}));

/**
 * DELETE /api/:context/training/:id
 * Delete a training record
 */
router.delete('/:context/training/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;

  if (!['personal', 'work'].includes(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const pool = getPool(context as AIContext);

  const result = await pool.query(
    'DELETE FROM user_training WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Training');
  }

  res.json({
    success: true,
    message: 'Training deleted'
  });
}));

// Define a minimal pool interface for the query method
interface DatabasePool {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Helper function to update tone preferences in user profile
 */
async function updateTonePreference(pool: DatabasePool, toneFeedback: string, weight: number): Promise<void> {
  try {
    // Check if user_profile exists
    const profileResult = await pool.query('SELECT id, preferences FROM user_profile LIMIT 1');

    if (profileResult.rows.length === 0) {
      // Create new profile with tone preference
      await pool.query(`
        INSERT INTO user_profile (id, preferences, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
      `, [
        uuidv4(),
        JSON.stringify({ tonePreferences: { [toneFeedback]: weight } })
      ]);
    } else {
      // Update existing profile
      const profile = profileResult.rows[0];
      interface ProfilePreferences {
        tonePreferences?: Record<string, number>;
        [key: string]: unknown;
      }
      const preferences: ProfilePreferences = (profile.preferences || {}) as ProfilePreferences;
      const tonePreferences: Record<string, number> = preferences.tonePreferences || {};

      // Add weight to existing preference or create new
      tonePreferences[toneFeedback] = (tonePreferences[toneFeedback] || 0) + weight;
      preferences.tonePreferences = tonePreferences;

      await pool.query(
        'UPDATE user_profile SET preferences = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(preferences), profile.id]
      );
    }
  } catch (error) {
    logger.error('Error updating tone preference', error instanceof Error ? error : undefined);
    // Don't throw - tone preference update is non-critical
  }
}

export const trainingRouter = router;
export default router;
