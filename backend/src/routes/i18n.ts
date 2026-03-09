/**
 * Phase 52: i18n Routes
 *
 * Language detection, AI prompt configuration, and supported languages.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import {
  detectLanguage,
  getLanguageSystemPrompt,
  isValidLanguage,
  SupportedLanguage,
} from '../services/ai-language';

export const i18nRouter = Router();

const SUPPORTED_LANGUAGES: { code: SupportedLanguage; name: string }[] = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
];

/**
 * GET /api/i18n/languages — List available languages
 */
i18nRouter.get(
  '/i18n/languages',
  apiKeyAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, data: SUPPORTED_LANGUAGES });
  })
);

/**
 * POST /api/i18n/detect — Detect language from text
 */
i18nRouter.post(
  '/i18n/detect',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      throw new ValidationError('text is required');
    }
    const detected = detectLanguage(text);
    res.json({ success: true, data: { language: detected } });
  })
);

/**
 * GET /api/i18n/prompt/:lang — Get AI system prompt for language
 */
i18nRouter.get(
  '/i18n/prompt/:lang',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { lang } = req.params;
    if (!isValidLanguage(lang)) {
      throw new ValidationError('Invalid language. Supported: de, en, fr, es');
    }
    const prompt = getLanguageSystemPrompt(lang);
    res.json({ success: true, data: { prompt } });
  })
);
