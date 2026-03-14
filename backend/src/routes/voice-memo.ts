import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { structureWithOllama, generateEmbedding } from '../utils/ollama';
import { quantizeToInt8, quantizeToBinary, formatForPgVector } from '../utils/embedding';
import { queryContext, AIContext } from '../utils/database-context';
import { transcribeAudio, checkWhisperAvailable } from '../services/whisper';
import { analyzeRelationships } from '../services/knowledge-graph';
import { trackInteraction, suggestPriority } from '../services/user-profile';
import { triggerWebhook } from '../services/webhooks';
import { learnFromThought, suggestFromLearning } from '../services/learning-engine';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import type { StructuredIdea } from '../types';
// SECURITY Sprint 2: Zod validation for input
import { VoiceMemoTextSchema, validateBody } from '../utils/schemas';
// Phase 24: Cache Invalidation - CRITICAL for ideas to appear after refresh
import { invalidateCacheForContext } from '../middleware/response-cache';
// Phase 35: Smart Intent Detection
import { detectIntents } from '../services/intent-detector';
import { dispatchIntents } from '../services/intent-handlers';
import { getUserId } from '../utils/user-context';

export const voiceMemoRouter = Router();

// Configure multer for audio file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // SECURITY: Only allow specific audio formats
    // Removed 'application/octet-stream' to prevent arbitrary file uploads
    const allowedTypes = [
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/webm',
      'audio/ogg',
      'audio/m4a',
      'audio/mp4',
      'audio/x-m4a',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      logger.warn('Invalid audio format rejected', { mimetype: file.mimetype, operation: 'voiceMemoUpload' });
      cb(new Error(`Invalid audio format: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`));
    }
  },
});

/**
 * Helper function to store idea in database
 * Note: This legacy endpoint defaults to 'personal' context for backward compatibility
 * Use /api/:context/voice-memo for explicit context selection
 */
async function storeIdea(
  ideaId: string,
  structured: StructuredIdea,
  transcript: string,
  embedding: number[],
  context: AIContext = 'personal',
  userId?: string
) {
  const embeddingInt8 = quantizeToInt8(embedding);
  const embeddingBinary = quantizeToBinary(embedding);

  // CRITICAL: is_archived must be explicitly set to false because the personal/work
  // schema tables were created with CREATE TABLE AS SELECT which doesn't copy DEFAULT values.
  // Without this, is_archived would be NULL and the idea wouldn't appear in queries.
  if (embedding.length > 0) {
    await queryContext(
      context,
      `INSERT INTO ideas (
        id, title, type, category, priority, summary,
        next_steps, context_needed, keywords,
        raw_transcript, embedding, embedding_int8, embedding_binary,
        context, is_archived, user_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, NOW(), NOW()
      )`,
      [
        ideaId,
        structured.title,
        structured.type,
        structured.category,
        structured.priority,
        structured.summary,
        JSON.stringify(structured.next_steps),
        JSON.stringify(structured.context_needed),
        JSON.stringify(structured.keywords),
        transcript,
        formatForPgVector(embedding),
        JSON.stringify(embeddingInt8),
        embeddingBinary,
        context,
        false, // is_archived - explicitly set to avoid NULL
        userId,
      ]
    );

    // Emit idea.created event for proactive engine
    import('../services/event-system').then(({ emitSystemEvent }) =>
      emitSystemEvent({ context, eventType: 'idea.created', eventSource: 'voice_memo', payload: { ideaId, title: structured.title } })
    ).catch(err => { logger.warn('Failed to emit idea.created event', { error: err instanceof Error ? err.message : String(err) }); });
  } else {
    await queryContext(
      context,
      `INSERT INTO ideas (
        id, title, type, category, priority, summary,
        next_steps, context_needed, keywords,
        raw_transcript, context, is_archived, user_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13, NOW(), NOW()
      )`,
      [
        ideaId,
        structured.title,
        structured.type,
        structured.category,
        structured.priority,
        structured.summary,
        JSON.stringify(structured.next_steps),
        JSON.stringify(structured.context_needed),
        JSON.stringify(structured.keywords),
        transcript,
        context,
        false, // is_archived - explicitly set to avoid NULL
        userId,
      ]
    );

    // Emit idea.created event for proactive engine
    import('../services/event-system').then(({ emitSystemEvent }) =>
      emitSystemEvent({ context, eventType: 'idea.created', eventSource: 'voice_memo', payload: { ideaId, title: structured.title } })
    ).catch(err => { logger.warn('Failed to emit idea.created event', { error: err instanceof Error ? err.message : String(err) }); });
  }
}

/**
 * POST /api/voice-memo
 * Process a voice memo: transcribe → structure → embed → store
 * Accepts audio file upload OR transcript in body
 */
voiceMemoRouter.post('/', apiKeyAuth, requireScope('write'), (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      logger.error('Multer upload error', err instanceof Error ? err : undefined, { operation: 'voiceMemoUpload' });
      throw new ValidationError(err.message);
    }
    next();
  });
}, asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const startTime = Date.now();

  let transcript: string;
  let transcriptionTime = 0;

  // Check if audio file was uploaded
  if (req.file) {

    // Transcribe audio with Whisper
    const transcribeStart = Date.now();
    const transcriptionResult = await transcribeAudio(
      req.file.buffer,
      req.file.originalname
    );
    transcriptionTime = Date.now() - transcribeStart;

    transcript = transcriptionResult.text;
  } else {
    // Fall back to transcript in body
    transcript = req.body.transcript || req.body.text;
  }

  if (!transcript) {
    throw new ValidationError('No audio file or transcript provided. Upload an audio file or send {"text": "your text"} in the body.');
  }

  // Get personalized suggestions from learning engine BEFORE structuring
  const learnedSuggestion = await suggestFromLearning(transcript).catch((err) => {
    logger.warn('Learning suggestion failed, continuing without', { error: err.message });
    return null;
  });

  // 1. Structure with Ollama/Mistral
  const structured = await structureWithOllama(transcript);
  // Apply learned suggestions if confidence is high enough
  let appliedLearning = false;
  if (learnedSuggestion && learnedSuggestion.confidence >= 0.5) {
    if (learnedSuggestion.suggested_category !== structured.category) {
      structured.category = learnedSuggestion.suggested_category as typeof structured.category;
      appliedLearning = true;
    }
    if (learnedSuggestion.suggested_priority !== structured.priority) {
      structured.priority = learnedSuggestion.suggested_priority as typeof structured.priority;
      appliedLearning = true;
    }
    // Apply learned context if LLM didn't suggest one
    if (!structured.suggested_context && learnedSuggestion.suggested_context) {
      structured.suggested_context = learnedSuggestion.suggested_context as 'personal' | 'work' | 'learning' | 'creative';
    }
  }

  // 2. Generate embedding
  const embedding = await generateEmbedding(transcript);

  // 3. Store in database
  const ideaId = uuidv4();
  await storeIdea(ideaId, structured, transcript, embedding, 'personal', userId);
  const totalTime = Date.now() - startTime;

  // CRITICAL: Invalidate cache so new idea appears on refresh
  // Without this, GET /api/personal/ideas returns stale cached data!
  try {
    await invalidateCacheForContext('personal', 'ideas');
    logger.debug('Ideas cache invalidated after voice-memo', { ideaId });
  } catch {
    logger.warn('Failed to invalidate ideas cache', { ideaId });
  }

  // Background tasks: Knowledge Graph analysis, user profile tracking, webhooks, learning
  // Fire-and-forget: These run async to not block the response (void indicates intentional no-await)
  void Promise.allSettled([
    analyzeRelationships(ideaId).catch((err) =>
      logger.debug('Background relationship analysis skipped', { error: err.message })
    ),
    trackInteraction({
      idea_id: ideaId,
      interaction_type: 'edit',
      metadata: { action: 'create', source: 'voice-memo' },
    }).catch((err) =>
      logger.debug('Background tracking skipped', { error: err.message })
    ),
    triggerWebhook('idea.created', {
      id: ideaId,
      ...structured,
      source: 'voice-memo'
    }).catch((err) =>
      logger.debug('Background webhook skipped', { error: err.message })
    ),
    // Learn from this thought to improve future suggestions
    learnFromThought(ideaId).catch((err) =>
      logger.debug('Background learning skipped', { error: err.message })
    ),
  ]);

  // Phase 35: Detect intents and dispatch handlers (fire-and-forget for non-blocking)
  let detectedIntents: unknown[] = [];
  let actionsTaken: unknown[] = [];
  try {
    const intentResult = await detectIntents(transcript);
    detectedIntents = intentResult.intents;

    if (intentResult.intents.length > 0 && intentResult.primary_intent !== 'idea') {
      const intentContext: AIContext = (structured.suggested_context as AIContext) || 'personal';
      const results = await dispatchIntents(intentContext, intentResult.intents, transcript);
      actionsTaken = results
        .filter((r): r is typeof r & { created_resource: NonNullable<typeof r.created_resource> } => r.success && r.created_resource !== undefined && r.created_resource !== null)
        .map(r => ({
          type: r.intent_type,
          id: r.created_resource.id,
          summary: r.created_resource.summary,
          data: r.created_resource.data,
        }));
    }
  } catch (intentErr) {
    logger.warn('Intent detection failed, continuing without', { error: (intentErr as Error).message });
  }

  res.json({
    success: true,
    ideaId,
    transcript,
    structured,
    suggestedContext: structured.suggested_context,
    contextConfidence: structured.suggested_context ? 0.7 : 0,
    appliedLearning,
    learningConfidence: learnedSuggestion?.confidence || 0,
    detected_intents: detectedIntents,
    actions_taken: actionsTaken,
    performance: {
      totalMs: totalTime,
      transcriptionMs: transcriptionTime,
      embeddingDimensions: embedding.length,
    },
  });
}));

/**
 * POST /api/voice-memo/text
 * Process plain text (no audio file)
 * SECURITY Sprint 2: Added Zod validation for text input
 */
voiceMemoRouter.post('/text', apiKeyAuth, requireScope('write'), validateBody(VoiceMemoTextSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const startTime = Date.now();

  // SECURITY: text is now validated by Zod middleware (1-100000 chars, trimmed)
  const { text } = req.body;

  // SECURITY: Only log a preview, never the full content (may contain sensitive info)
  logger.info('Processing text', { textLength: text.length, textPreview: text.substring(0, 50) });

  // Get personalized suggestions from learning engine BEFORE structuring
  const learnedSuggestion = await suggestFromLearning(text).catch((err) => {
    logger.warn('Learning suggestion failed, continuing without', { error: err.message });
    return null;
  });

  const structured = await structureWithOllama(text);
  const embedding = await generateEmbedding(text);

  const ideaId = uuidv4();

  // Apply learned suggestions if confidence is high enough
  // CONFIDENCE_FOR_OVERRIDE ist auf 0.5 gesetzt für schnelleres Lernen
  let appliedLearning = false;
  if (learnedSuggestion && learnedSuggestion.confidence >= 0.5) {
    // Override with learned preferences if significantly different
    if (learnedSuggestion.suggested_category !== structured.category) {
      logger.info('Learning override: category', { from: structured.category, to: learnedSuggestion.suggested_category });
      structured.category = learnedSuggestion.suggested_category as typeof structured.category;
      appliedLearning = true;
    }
    if (learnedSuggestion.suggested_priority !== structured.priority) {
      logger.info('Learning override: priority', { from: structured.priority, to: learnedSuggestion.suggested_priority });
      structured.priority = learnedSuggestion.suggested_priority as typeof structured.priority;
      appliedLearning = true;
    }
  }

  // Also check keyword-based priority suggestion
  const keywords = structured.keywords || [];
  const suggestedPrio = await suggestPriority(keywords);

  await storeIdea(ideaId, structured, text, embedding, 'personal', userId);

  // CRITICAL: Invalidate cache so new idea appears on refresh
  try {
    await invalidateCacheForContext('personal', 'ideas');
    logger.debug('Ideas cache invalidated after text input', { ideaId });
  } catch {
    logger.warn('Failed to invalidate ideas cache', { ideaId });
  }

  // Background tasks including learning
  // Fire-and-forget: void indicates intentional no-await
  void Promise.allSettled([
    analyzeRelationships(ideaId).catch((err) =>
      logger.debug('Background relationship analysis skipped', { error: err.message })
    ),
    trackInteraction({
      idea_id: ideaId,
      interaction_type: 'edit',
      metadata: { action: 'create', source: 'text' },
    }).catch((err) =>
      logger.debug('Background tracking skipped', { error: err.message })
    ),
    triggerWebhook('idea.created', {
      id: ideaId,
      ...structured,
      source: 'text'
    }).catch((err) =>
      logger.debug('Background webhook skipped', { error: err.message })
    ),
    // Learn from this thought
    learnFromThought(ideaId).catch((err) =>
      logger.debug('Background learning skipped', { error: err.message })
    ),
  ]);

  // Phase 35: Detect intents and dispatch handlers
  let detectedIntents: unknown[] = [];
  let actionsTaken: unknown[] = [];
  try {
    const intentResult = await detectIntents(text);
    detectedIntents = intentResult.intents;

    if (intentResult.intents.length > 0 && intentResult.primary_intent !== 'idea') {
      const intentContext: AIContext = (structured.suggested_context as AIContext) || 'personal';
      const results = await dispatchIntents(intentContext, intentResult.intents, text);
      actionsTaken = results
        .filter((r): r is typeof r & { created_resource: NonNullable<typeof r.created_resource> } => r.success && r.created_resource !== undefined && r.created_resource !== null)
        .map(r => ({
          type: r.intent_type,
          id: r.created_resource.id,
          summary: r.created_resource.summary,
          data: r.created_resource.data,
        }));
    }
  } catch (intentErr) {
    logger.warn('Intent detection failed, continuing without', { error: (intentErr as Error).message });
  }

  res.json({
    success: true,
    ideaId,
    transcript: text,
    structured,
    suggestedContext: structured.suggested_context,
    contextConfidence: structured.suggested_context ? 0.7 : 0,
    suggestedPriority: suggestedPrio,
    appliedLearning,
    learningConfidence: learnedSuggestion?.confidence || 0,
    detected_intents: detectedIntents,
    actions_taken: actionsTaken,
    processingTime: Date.now() - startTime,
  });
}));

/**
 * POST /api/voice-memo/transcribe
 * Only transcribe audio, don't structure or store
 */
voiceMemoRouter.post('/transcribe', apiKeyAuth, upload.single('audio'), asyncHandler(async (req, res) => {
  getUserId(req); // auth check
  const startTime = Date.now();

  if (!req.file) {
    throw new ValidationError('No audio file provided');
  }

  logger.info('Transcribing audio', { filename: req.file.originalname, size: req.file.size });

  const result = await transcribeAudio(req.file.buffer, req.file.originalname);

  res.json({
    success: true,
    transcript: result.text,
    language: result.language,
    processingTime: Date.now() - startTime,
  });
}));

/**
 * GET /api/voice-memo/whisper-status
 * Check if Whisper is available
 * SECURITY: Requires authentication to prevent service discovery
 */
voiceMemoRouter.get('/whisper-status', apiKeyAuth, asyncHandler(async (_req, res) => {
  const available = await checkWhisperAvailable();
  res.json({
    whisperAvailable: available,
    // SECURITY: Don't expose model name in production
    ...(process.env.NODE_ENV !== 'production' && {
      model: process.env.WHISPER_MODEL || 'base',
    }),
  });
}));
