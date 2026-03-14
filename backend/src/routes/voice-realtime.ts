/**
 * Voice Realtime Routes
 *
 * REST endpoints for the real-time voice pipeline.
 * Separate from existing voice.ts to avoid conflicts.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { isValidContext } from '../utils/database-context';
import { voicePipeline } from '../services/voice/voice-pipeline';
import { multiTTSService } from '../services/voice/tts-service';
import { sttService } from '../services/voice/stt-service';
import { queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { getUserId } from '../utils/user-context';

export const voiceRealtimeRouter = Router();

// ============================================================
// Validation Schemas
// ============================================================

const StartSessionSchema = z.object({
  sttProvider: z.string().optional(),
  ttsProvider: z.string().optional(),
  ttsVoice: z.string().optional(),
  language: z.string().optional(),
  silenceThreshold_ms: z.number().min(500).max(5000).optional(),
});

const TTSRequestSchema = z.object({
  text: z.string().min(1).max(4096).trim(),
  voice: z.string().optional(),
  speed: z.number().min(0.25).max(4.0).optional(),
  provider: z.string().optional(),
});

const VoiceSettingsSchema = z.object({
  stt_provider: z.string().optional(),
  tts_provider: z.string().optional(),
  tts_voice: z.string().optional(),
  language: z.string().optional(),
  vad_sensitivity: z.number().min(0).max(1).optional(),
  silence_threshold_ms: z.number().min(500).max(5000).optional(),
  auto_send: z.boolean().optional(),
});

// ============================================================
// Context Validation Helper
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
 * POST /api/:context/voice/session/start
 * Start a new voice session
 */
voiceRealtimeRouter.post(
  '/:context/voice/session/start',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    const parseResult = StartSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues[0]?.message || 'Invalid request body');
    }

    const result = await voicePipeline.startSession(
      context as 'personal' | 'work' | 'learning' | 'creative',
      parseResult.data
    );

    logger.info('Voice session started via REST', {
      sessionId: result.sessionId,
      context,
      operation: 'voice-realtime',
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/:context/voice/session/:id/end
 * End a voice session
 */
voiceRealtimeRouter.post(
  '/:context/voice/session/:id/end',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;
    validateContext(context);

    await voicePipeline.endSession(id);

    res.json({
      success: true,
      data: { message: 'Session ended' },
    });
  })
);

/**
 * GET /api/:context/voice/session/:id/status
 * Get voice session status
 */
voiceRealtimeRouter.get(
  '/:context/voice/session/:id/status',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context, id } = req.params;
    validateContext(context);

    const status = voicePipeline.getSessionStatus(id);

    if (!status) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: status,
    });
  })
);

/**
 * POST /api/:context/voice/tts
 * One-shot text-to-speech
 */
voiceRealtimeRouter.post(
  '/:context/voice/tts',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    const parseResult = TTSRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues[0]?.message || 'Invalid request body');
    }

    const { text, voice, speed, provider } = parseResult.data;

    const audioBuffer = await voicePipeline.textToSpeech(text, {
      voice,
      speed,
      provider,
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length.toString());
    res.send(audioBuffer);
  })
);

/**
 * GET /api/:context/voice/voices
 * Available TTS voices from all providers
 */
voiceRealtimeRouter.get(
  '/:context/voice/voices',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    const voices = await multiTTSService.getVoices();

    res.json({
      success: true,
      data: { voices },
    });
  })
);

/**
 * GET /api/:context/voice/settings
 * Get voice settings for the current context
 */
voiceRealtimeRouter.get(
  '/:context/voice/settings',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    const result = await queryContext(
      context as 'personal' | 'work' | 'learning' | 'creative',
      'SELECT * FROM voice_settings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    const settings = result.rows[0] || {
      stt_provider: 'whisper',
      tts_provider: 'edge-tts',
      tts_voice: 'de-DE-ConradNeural',
      language: 'de-DE',
      vad_sensitivity: 0.5,
      silence_threshold_ms: 1500,
      auto_send: true,
    };

    res.json({
      success: true,
      data: settings,
    });
  })
);

/**
 * PUT /api/:context/voice/settings
 * Update voice settings
 */
voiceRealtimeRouter.put(
  '/:context/voice/settings',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    const parseResult = VoiceSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues[0]?.message || 'Invalid request body');
    }

    const data = parseResult.data;
    const ctx = context as 'personal' | 'work' | 'learning' | 'creative';

    // Check if settings exist for this user
    const existing = await queryContext(ctx,
      'SELECT id FROM voice_settings WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await queryContext(ctx, `
        UPDATE voice_settings
        SET stt_provider = COALESCE($1, stt_provider),
            tts_provider = COALESCE($2, tts_provider),
            tts_voice = COALESCE($3, tts_voice),
            language = COALESCE($4, language),
            vad_sensitivity = COALESCE($5, vad_sensitivity),
            silence_threshold_ms = COALESCE($6, silence_threshold_ms),
            auto_send = COALESCE($7, auto_send),
            updated_at = NOW()
        WHERE id = $8 AND user_id = $9
        RETURNING *
      `, [
        data.stt_provider || null,
        data.tts_provider || null,
        data.tts_voice || null,
        data.language || null,
        data.vad_sensitivity ?? null,
        data.silence_threshold_ms ?? null,
        data.auto_send ?? null,
        existing.rows[0].id,
        userId,
      ]);
    } else {
      result = await queryContext(ctx, `
        INSERT INTO voice_settings (stt_provider, tts_provider, tts_voice, language, vad_sensitivity, silence_threshold_ms, auto_send, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        data.stt_provider || 'whisper',
        data.tts_provider || 'edge-tts',
        data.tts_voice || 'de-DE-ConradNeural',
        data.language || 'de-DE',
        data.vad_sensitivity ?? 0.5,
        data.silence_threshold_ms ?? 1500,
        data.auto_send ?? true,
        userId,
      ]);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * GET /api/:context/voice/providers
 * Available STT/TTS providers
 */
voiceRealtimeRouter.get(
  '/:context/voice/providers',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const _userId = getUserId(req);
    const { context } = req.params;
    validateContext(context);

    res.json({
      success: true,
      data: {
        stt: {
          available: sttService.getAvailableProviders(),
          default: sttService.getAvailableProviders()[0] || 'whisper',
        },
        tts: {
          available: multiTTSService.getAvailableProviders(),
          default: multiTTSService.getAvailableProviders()[0] || 'edge-tts',
        },
      },
    });
  })
);
