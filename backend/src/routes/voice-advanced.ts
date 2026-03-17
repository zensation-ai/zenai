/**
 * Phase 90: Advanced Voice Routes
 *
 * Endpoints for emotion detection, voice personas, and voice command parsing.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { isValidContext, queryContext } from '../utils/database-context';
import { getUserId } from '../utils/user-context';
import { detectFromText, detectFromProsody, combineSignals } from '../services/voice/emotion-detection';
import { listPersonas, getPersona, getPersonaById, getPersonaPromptAddendum } from '../services/voice/voice-personas';
import { parseCommand } from '../services/voice/voice-commands';
import { logger } from '../utils/logger';

export const voiceAdvancedRouter = Router();

// ============================================================
// Validation Schemas
// ============================================================

const EmotionDetectSchema = z.object({
  text: z.string().optional(),
  speechRate: z.number().min(0).max(500).optional(),
  avgPitch: z.number().min(0).max(1000).optional(),
  pitchVariation: z.number().min(0).max(500).optional(),
  volume: z.number().min(0).max(1).optional(),
  pauseFrequency: z.number().min(0).max(100).optional(),
});

const SetPersonaSchema = z.object({
  personaId: z.string().min(1).max(100),
});

const CommandParseSchema = z.object({
  transcript: z.string().min(1).max(4096).trim(),
});

const EmotionSettingsSchema = z.object({
  emotion_detection_enabled: z.boolean().optional(),
  adaptive_responses_enabled: z.boolean().optional(),
});

// ============================================================
// Context Validation
// ============================================================

function validateContext(context: string): asserts context is 'personal' | 'work' | 'learning' | 'creative' {
  if (!isValidContext(context)) {
    throw new ValidationError(`Invalid context: ${context}. Must be personal, work, learning, or creative.`);
  }
}

// ============================================================
// Routes
// ============================================================

/**
 * POST /api/:context/voice/emotion/detect
 * Detect emotion from text and/or prosodic signals
 */
voiceAdvancedRouter.post(
  '/:context/voice/emotion/detect',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req);
    const { context } = req.params;
    validateContext(context);

    const parseResult = EmotionDetectSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues[0]?.message || 'Invalid request body');
    }

    const signals = parseResult.data;

    // Need at least text or prosody signals
    const hasProsody = signals.speechRate !== undefined || signals.avgPitch !== undefined ||
      signals.volume !== undefined || signals.pitchVariation !== undefined;

    if (!signals.text && !hasProsody) {
      throw new ValidationError('At least text or prosodic signals (speechRate, avgPitch, volume) must be provided');
    }

    try {
      let result;

      if (signals.text && hasProsody) {
        // Combined detection
        const textEmotion = detectFromText(signals.text);
        const prosodyEmotion = detectFromProsody({
          speechRate: signals.speechRate,
          avgPitch: signals.avgPitch,
          pitchVariation: signals.pitchVariation,
          volume: signals.volume,
          pauseFrequency: signals.pauseFrequency,
        });
        result = combineSignals(textEmotion, prosodyEmotion);
      } else if (signals.text) {
        result = detectFromText(signals.text);
      } else {
        result = detectFromProsody({
          speechRate: signals.speechRate,
          avgPitch: signals.avgPitch,
          pitchVariation: signals.pitchVariation,
          volume: signals.volume,
          pauseFrequency: signals.pauseFrequency,
        });
      }

      logger.debug('Emotion detection complete', {
        context,
        primary: result.primary,
        confidence: result.confidence,
        hasText: !!signals.text,
        hasProsody,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
    if (error instanceof ValidationError) { throw error; }
    logger.error('Voice: Emotions-Erkennung fehlgeschlagen', error instanceof Error ? error : undefined, { context: req.params.context as 'personal' | 'work' | 'learning' | 'creative' });
    res.status(500).json({ success: false, error: 'Emotions-Erkennung fehlgeschlagen' });
  }
  })
);

/**
 * GET /api/:context/voice/personas
 * List all available voice personas
 */
voiceAdvancedRouter.get(
  '/:context/voice/personas',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req);
    const { context } = req.params;
    validateContext(context);

    try {
      const personas = listPersonas();

      res.json({
        success: true,
        data: {
          personas,
          contextDefault: getPersona(context),
        },
      });
    } catch (error) {
      logger.error('Voice: Personas-Liste fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Sprachpersonas konnten nicht geladen werden' });
    }
  })
);

/**
 * GET /api/:context/voice/personas/active
 * Get the active persona for the current context
 */
voiceAdvancedRouter.get(
  '/:context/voice/personas/active',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    try {
      // Check DB for user's active persona preference
      const result = await queryContext(
        context,
        'SELECT active_persona_id FROM voice_settings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );

      const activePersonaId = result.rows[0]?.active_persona_id;
      let persona;

      if (activePersonaId) {
        persona = getPersonaById(activePersonaId);
      }

      // Fall back to context default
      if (!persona) {
        persona = getPersona(context);
      }

      const promptAddendum = getPersonaPromptAddendum(persona);

      res.json({
        success: true,
        data: {
          persona,
          promptAddendum,
        },
      });
    } catch (error) {
      logger.error('Voice: Aktive Persona fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Aktive Sprachpersona konnte nicht geladen werden' });
    }
  })
);

/**
 * PUT /api/:context/voice/personas/active
 * Set the active persona for the current context
 */
voiceAdvancedRouter.put(
  '/:context/voice/personas/active',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    const parseResult = SetPersonaSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues[0]?.message || 'Invalid request body');
    }

    const { personaId } = parseResult.data;

    // Validate persona exists
    const persona = getPersonaById(personaId);
    if (!persona) {
      throw new ValidationError(`Unknown persona: ${personaId}. Use GET /voice/personas to see available options.`);
    }

    try {
      // Upsert voice settings with active persona
      const existing = await queryContext(context,
        'SELECT id FROM voice_settings WHERE user_id = $1 LIMIT 1',
        [userId]
      );

      if (existing.rows.length > 0) {
        await queryContext(context,
          'UPDATE voice_settings SET active_persona_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
          [personaId, existing.rows[0].id, userId]
        );
      } else {
        await queryContext(context,
          'INSERT INTO voice_settings (active_persona_id, user_id) VALUES ($1, $2)',
          [personaId, userId]
        );
      }

      logger.info('Active voice persona updated', { context, personaId, userId });

      res.json({
        success: true,
        data: {
          persona,
          promptAddendum: getPersonaPromptAddendum(persona),
        },
      });
    } catch (error) {
      if (error instanceof ValidationError) { throw error; }
      logger.error('Voice: Persona-Aktualisierung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: personaId });
      res.status(500).json({ success: false, error: 'Sprachpersona konnte nicht aktualisiert werden' });
    }
  })
);

/**
 * POST /api/:context/voice/command/parse
 * Parse a voice transcript for structured commands
 */
voiceAdvancedRouter.post(
  '/:context/voice/command/parse',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req);
    const { context } = req.params;
    validateContext(context);

    const parseResult = CommandParseSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues[0]?.message || 'Invalid request body');
    }

    try {
      const { transcript } = parseResult.data;
      const command = parseCommand(transcript);

      res.json({
        success: true,
        data: command,
      });
    } catch (error) {
      logger.error('Voice: Kommando-Parsing fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Sprachbefehl konnte nicht verarbeitet werden' });
    }
  })
);

/**
 * GET /api/:context/voice/emotion/settings
 * Get emotion detection settings for the current context
 */
voiceAdvancedRouter.get(
  '/:context/voice/emotion/settings',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    try {
      const result = await queryContext(
        context,
        'SELECT emotion_detection_enabled, adaptive_responses_enabled FROM voice_settings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );

      const settings = result.rows[0] || {
        emotion_detection_enabled: true,
        adaptive_responses_enabled: true,
      };

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Voice: Emotions-Einstellungen fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Emotions-Einstellungen konnten nicht geladen werden' });
    }
  })
);

/**
 * PUT /api/:context/voice/emotion/settings
 * Update emotion detection settings
 */
voiceAdvancedRouter.put(
  '/:context/voice/emotion/settings',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    const parseResult = EmotionSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues[0]?.message || 'Invalid request body');
    }

    const data = parseResult.data;

    try {
      const existing = await queryContext(context,
        'SELECT id FROM voice_settings WHERE user_id = $1 LIMIT 1',
        [userId]
      );

      let result;
      if (existing.rows.length > 0) {
        result = await queryContext(context, `
          UPDATE voice_settings
          SET emotion_detection_enabled = COALESCE($1, emotion_detection_enabled),
              adaptive_responses_enabled = COALESCE($2, adaptive_responses_enabled),
              updated_at = NOW()
          WHERE id = $3 AND user_id = $4
          RETURNING emotion_detection_enabled, adaptive_responses_enabled
        `, [
          data.emotion_detection_enabled ?? null,
          data.adaptive_responses_enabled ?? null,
          existing.rows[0].id,
          userId,
        ]);
      } else {
        result = await queryContext(context, `
          INSERT INTO voice_settings (emotion_detection_enabled, adaptive_responses_enabled, user_id)
          VALUES ($1, $2, $3)
          RETURNING emotion_detection_enabled, adaptive_responses_enabled
        `, [
          data.emotion_detection_enabled ?? true,
          data.adaptive_responses_enabled ?? true,
          userId,
        ]);
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      logger.error('Voice: Emotions-Einstellungen Aktualisierung fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Emotions-Einstellungen konnten nicht aktualisiert werden' });
    }
  })
);
