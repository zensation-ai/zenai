/**
 * Integration Tests for Document Analysis API Routes
 *
 * Tests the document analysis REST endpoints:
 * - GET  /api/documents/status          - Service availability
 * - GET  /api/documents/templates       - Analysis templates
 * - POST /api/documents/followup        - Follow-up questions
 * - GET  /api/documents/history         - Analysis history
 * - GET  /api/documents/history/:id     - Single analysis
 * - DELETE /api/documents/history/:id   - Delete analysis
 * - GET  /api/documents/cache/status    - Cache status
 * - GET  /api/documents/templates/custom - Custom templates
 *
 * Phase 122 - Worker 2
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../middleware/validate-params', () => ({
  requireUUID: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockIsAvailable = jest.fn();
const mockFollowUp = jest.fn();
const mockGetHistory = jest.fn();
const mockGetAnalysisById = jest.fn();
const mockDeleteFromHistory = jest.fn();
const mockGetCacheSize = jest.fn();
const mockCleanCache = jest.fn();
const mockGetCustomTemplates = jest.fn();
const mockCreateCustomTemplate = jest.fn();

jest.mock('../../services/document-analysis', () => ({
  documentAnalysis: {
    isAvailable: (...args: unknown[]) => mockIsAvailable(...args),
    followUp: (...args: unknown[]) => mockFollowUp(...args),
    getHistory: (...args: unknown[]) => mockGetHistory(...args),
    getAnalysisById: (...args: unknown[]) => mockGetAnalysisById(...args),
    deleteFromHistory: (...args: unknown[]) => mockDeleteFromHistory(...args),
    getCacheSize: (...args: unknown[]) => mockGetCacheSize(...args),
    cleanCache: (...args: unknown[]) => mockCleanCache(...args),
    getCustomTemplates: (...args: unknown[]) => mockGetCustomTemplates(...args),
    createCustomTemplate: (...args: unknown[]) => mockCreateCustomTemplate(...args),
    analyze: jest.fn(),
    analyzeStream: jest.fn(),
    compareDocuments: jest.fn(),
    saveToHistory: jest.fn(),
    computeCacheKey: jest.fn(),
    updateCustomTemplate: jest.fn(),
    deleteCustomTemplate: jest.fn(),
    getCustomTemplateById: jest.fn(),
    analyzeWithCustomTemplate: jest.fn(),
  },
  isValidDocumentType: jest.fn(() => true),
  validateFileMagicNumber: jest.fn(() => true),
  getDocumentTypeLabel: jest.fn((t: string) => {
    const map: Record<string, string> = {
      'application/pdf': 'PDF',
      'text/csv': 'CSV',
    };
    return map[t] || 'Unbekannt';
  }),
}));

// Mock pdfkit (used by the route file for PDF export)
jest.mock('pdfkit', () => jest.fn());

import { documentAnalysisRouter } from '../../routes/document-analysis';
import { errorHandler } from '../../middleware/errorHandler';

describe('Document Analysis Routes Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/documents', documentAnalysisRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // GET /api/documents/status
  // ============================================================

  describe('GET /api/documents/status', () => {
    it('should return service status when available', async () => {
      mockIsAvailable.mockReturnValueOnce(true);

      const res = await request(app)
        .get('/api/documents/status')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.available).toBe(true);
      expect(res.body.supportedFormats).toBeDefined();
      expect(res.body.templates).toBeDefined();
    });

    it('should report unavailable service', async () => {
      mockIsAvailable.mockReturnValueOnce(false);

      const res = await request(app)
        .get('/api/documents/status')
        .expect(200);

      expect(res.body.available).toBe(false);
    });
  });

  // ============================================================
  // GET /api/documents/templates
  // ============================================================

  describe('GET /api/documents/templates', () => {
    it('should return 5 built-in templates', async () => {
      const res = await request(app)
        .get('/api/documents/templates')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.templates).toHaveLength(5);
      expect(res.body.templates[0]).toHaveProperty('id');
      expect(res.body.templates[0]).toHaveProperty('name');
      expect(res.body.templates[0]).toHaveProperty('description');
    });

    it('should include all expected template IDs', async () => {
      const res = await request(app)
        .get('/api/documents/templates')
        .expect(200);

      const ids = res.body.templates.map((t: { id: string }) => t.id);
      expect(ids).toContain('general');
      expect(ids).toContain('financial');
      expect(ids).toContain('contract');
      expect(ids).toContain('data');
      expect(ids).toContain('summary');
    });
  });

  // ============================================================
  // POST /api/documents/followup
  // ============================================================

  describe('POST /api/documents/followup', () => {
    it('should answer a follow-up question', async () => {
      mockFollowUp.mockResolvedValueOnce({
        success: true,
        answer: 'The document discusses...',
        tokenUsage: { input: 100, output: 50 },
        cached: true,
      });

      const res = await request(app)
        .post('/api/documents/followup')
        .send({ cacheKey: 'abc123', question: 'What is the main topic?' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.answer).toBeTruthy();
      expect(res.body.cached).toBe(true);
    });

    it('should return 400 for missing cacheKey', async () => {
      const res = await request(app)
        .post('/api/documents/followup')
        .send({ question: 'Test?' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing question', async () => {
      const res = await request(app)
        .post('/api/documents/followup')
        .send({ cacheKey: 'abc123' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 for overly long question', async () => {
      const res = await request(app)
        .post('/api/documents/followup')
        .send({ cacheKey: 'abc123', question: 'x'.repeat(5001) })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 410 for expired cache', async () => {
      mockFollowUp.mockResolvedValueOnce({
        success: false,
        answer: 'Cache expired',
        cached: false,
      });

      const res = await request(app)
        .post('/api/documents/followup')
        .send({ cacheKey: 'expired_key', question: 'Test?' })
        .expect(410);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CACHE_EXPIRED');
    });
  });

  // ============================================================
  // GET /api/documents/history
  // ============================================================

  describe('GET /api/documents/history', () => {
    it('should return history entries', async () => {
      const entries = [
        {
          id: VALID_UUID,
          filename: 'test.pdf',
          file_type: 'application/pdf',
          file_size: 1024,
          analysis_type: 'general',
          token_usage: { input: 100, output: 200 },
          context: 'work',
          created_at: '2026-03-20',
        },
      ];
      mockGetHistory.mockResolvedValueOnce({ entries, total: 1 });

      const res = await request(app)
        .get('/api/documents/history')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].fileType).toBe('PDF');
      expect(res.body.total).toBe(1);
    });

    it('should support pagination', async () => {
      mockGetHistory.mockResolvedValueOnce({ entries: [], total: 0 });

      const res = await request(app)
        .get('/api/documents/history?limit=5&offset=10')
        .expect(200);

      expect(res.body.limit).toBe(5);
      expect(res.body.offset).toBe(10);
    });
  });

  // ============================================================
  // GET /api/documents/history/:id
  // ============================================================

  describe('GET /api/documents/history/:id', () => {
    it('should return a single analysis', async () => {
      const entry = {
        id: VALID_UUID,
        filename: 'test.pdf',
        file_type: 'application/pdf',
        file_size: 1024,
        analysis_type: 'general',
        analysis_result: { summary: 'A test document' },
        token_usage: { input: 100 },
        context: 'work',
        created_at: '2026-03-20',
      };
      mockGetAnalysisById.mockResolvedValueOnce(entry);

      const res = await request(app)
        .get(`/api/documents/history/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.filename).toBe('test.pdf');
    });

    it('should return 404 for non-existent analysis', async () => {
      mockGetAnalysisById.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/documents/history/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ============================================================
  // DELETE /api/documents/history/:id
  // ============================================================

  describe('DELETE /api/documents/history/:id', () => {
    it('should delete an analysis', async () => {
      mockDeleteFromHistory.mockResolvedValueOnce(true);

      const res = await request(app)
        .delete(`/api/documents/history/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.deleted).toBe(true);
    });

    it('should return 404 for non-existent analysis', async () => {
      mockDeleteFromHistory.mockResolvedValueOnce(false);

      const res = await request(app)
        .delete(`/api/documents/history/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/documents/cache/status
  // ============================================================

  describe('GET /api/documents/cache/status', () => {
    it('should return cache status', async () => {
      mockGetCacheSize.mockReturnValueOnce(5);
      mockCleanCache.mockReturnValueOnce(2);

      const res = await request(app)
        .get('/api/documents/cache/status')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.cachedDocuments).toBe(5);
      expect(res.body.cleanedExpired).toBe(2);
      expect(res.body.maxCacheSize).toBe(20);
    });
  });

  // ============================================================
  // GET /api/documents/templates/custom
  // ============================================================

  describe('GET /api/documents/templates/custom', () => {
    it('should return custom templates', async () => {
      const templates = [{ id: VALID_UUID, name: 'My Template', system_prompt: 'Analyze...' }];
      mockGetCustomTemplates.mockResolvedValueOnce(templates);

      const res = await request(app)
        .get('/api/documents/templates/custom')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.templates).toEqual(templates);
    });
  });
});
