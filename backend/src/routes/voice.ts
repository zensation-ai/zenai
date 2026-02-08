/**
 * Voice / TTS Routes
 *
 * HTTP endpoints for Text-to-Speech synthesis.
 * POST /api/voice/speak  - Convert text to audio stream
 * GET  /api/voice/status - TTS service availability
 * GET  /api/voice/voices - Available voices with descriptions
 *
 * Phase 33 Sprint 4 - Feature 8
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import {
  isTTSAvailable,
  streamSpeech,
  AUDIO_CONTENT_TYPES,
  TTS_VOICES,
  type TTSVoice,
  type TTSModel,
  type TTSOutputFormat,
} from '../services/tts';
import { logger } from '../utils/logger';

export const voiceRouter = Router();

// ============================================================
// Validation Schemas
// ============================================================

const SpeakRequestSchema = z.object({
  text: z.string().min(1, 'Text is required').max(4096, 'Text must be at most 4096 characters').trim(),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
  speed: z.number().min(0.25).max(4.0).optional(),
  format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
  model: z.enum(['tts-1', 'tts-1-hd']).optional(),
});

// ============================================================
// Routes
// ============================================================

/**
 * GET /api/voice/status
 * Check TTS service availability
 */
voiceRouter.get(
  '/status',
  apiKeyAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const available = isTTSAvailable();

    res.json({
      success: true,
      data: {
        ttsAvailable: available,
        provider: 'openai',
        model: 'tts-1',
        voices: TTS_VOICES.map((v) => v.id),
      },
    });
  })
);

/**
 * GET /api/voice/voices
 * List available voices with descriptions
 */
voiceRouter.get(
  '/voices',
  apiKeyAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        voices: TTS_VOICES,
        defaultVoice: 'nova',
      },
    });
  })
);

/**
 * POST /api/voice/speak
 * Convert text to audio stream
 *
 * Request body:
 *   text: string (1-4096 chars)
 *   voice?: TTSVoice (default: 'nova')
 *   speed?: number (0.25-4.0, default: 1.0)
 *   format?: TTSOutputFormat (default: 'mp3')
 *   model?: TTSModel (default: 'tts-1')
 *
 * Response: Binary audio stream with appropriate Content-Type
 */
voiceRouter.post(
  '/speak',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    // Validate request body
    const parseResult = SpeakRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      throw new ValidationError(firstError?.message || 'Invalid request body');
    }

    const { text, voice, speed, format, model } = parseResult.data;

    if (!isTTSAvailable()) {
      throw new ValidationError('TTS service is not available. OPENAI_API_KEY required.');
    }

    const outputFormat = (format || 'mp3') as TTSOutputFormat;
    const contentType = AUDIO_CONTENT_TYPES[outputFormat];

    logger.info('TTS speak request', {
      voice: voice || 'nova',
      model: model || 'tts-1',
      format: outputFormat,
      textLength: text.length,
      operation: 'voice-speak',
    });

    // Set audio streaming headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    // Stream audio from OpenAI TTS
    const audioStream = await streamSpeech(text, {
      voice: voice as TTSVoice,
      speed,
      outputFormat,
      model: model as TTSModel,
    });

    // Pipe the audio stream to the response
    audioStream.pipe(res);

    audioStream.on('error', (error) => {
      logger.error('TTS audio stream error', error, { operation: 'voice-speak' });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Audio streaming failed' });
      } else {
        res.end();
      }
    });
  })
);
