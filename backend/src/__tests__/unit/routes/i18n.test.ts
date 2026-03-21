/**
 * i18n Route Tests
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockDetectLanguage = jest.fn();
const mockGetLanguageSystemPrompt = jest.fn();
const mockIsValidLanguage = jest.fn();

jest.mock('../../../services/ai-language', () => ({
  detectLanguage: (...args: unknown[]) => mockDetectLanguage(...args),
  getLanguageSystemPrompt: (...args: unknown[]) => mockGetLanguageSystemPrompt(...args),
  isValidLanguage: (...args: unknown[]) => mockIsValidLanguage(...args),
  SupportedLanguage: {},
}));

import { i18nRouter } from '../../../routes/i18n';
import { errorHandler } from '../../../middleware/errorHandler';

describe('i18n Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', i18nRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/i18n/languages', () => {
    it('should return list of supported languages', async () => {
      const res = await request(app).get('/api/i18n/languages');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(4);
      expect(res.body.data[0]).toHaveProperty('code');
      expect(res.body.data[0]).toHaveProperty('name');
    });

    it('should include German and English', async () => {
      const res = await request(app).get('/api/i18n/languages');

      const codes = res.body.data.map((l: { code: string }) => l.code);
      expect(codes).toContain('de');
      expect(codes).toContain('en');
    });
  });

  describe('POST /api/i18n/detect', () => {
    it('should detect language from text', async () => {
      mockDetectLanguage.mockReturnValue('de');

      const res = await request(app)
        .post('/api/i18n/detect')
        .send({ text: 'Hallo Welt' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.language).toBe('de');
    });

    it('should reject missing text', async () => {
      const res = await request(app)
        .post('/api/i18n/detect')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject non-string text', async () => {
      const res = await request(app)
        .post('/api/i18n/detect')
        .send({ text: 123 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/i18n/prompt/:lang', () => {
    it('should return system prompt for valid language', async () => {
      mockIsValidLanguage.mockReturnValue(true);
      mockGetLanguageSystemPrompt.mockReturnValue('Du bist ein hilfreicher Assistent.');

      const res = await request(app).get('/api/i18n/prompt/de');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.prompt).toBe('Du bist ein hilfreicher Assistent.');
    });

    it('should reject invalid language', async () => {
      mockIsValidLanguage.mockReturnValue(false);

      const res = await request(app).get('/api/i18n/prompt/xx');

      expect(res.status).toBe(400);
    });
  });
});
