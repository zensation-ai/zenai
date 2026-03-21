/**
 * Integration Tests for Export API
 *
 * Tests export endpoints for ideas (JSON, CSV, Markdown, PDF), backup, and export history.
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = jest.fn();
const mockQuery = jest.fn();

jest.mock('../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
}));

jest.mock('../../services/audit-logger', () => ({
  auditLogger: { logExport: jest.fn().mockResolvedValue(undefined) },
}));

// Mock pdfkit to avoid binary dependency issues in tests
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => {
    const events: Record<string, ((...args: unknown[]) => void)[]> = {};
    const doc = {
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!events[event]) events[event] = [];
        events[event].push(cb);
        return doc;
      }),
      fontSize: jest.fn().mockReturnThis(),
      fillColor: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      moveDown: jest.fn().mockReturnThis(),
      addPage: jest.fn().mockReturnThis(),
      end: jest.fn(() => {
        // Emit data then end
        if (events.data) events.data.forEach(cb => cb(Buffer.from('fake-pdf')));
        if (events.end) events.end.forEach(cb => cb());
      }),
      page: { height: 800 },
      y: 100,
    };
    return doc;
  });
});

import { exportRouter } from '../../routes/export';
import { errorHandler } from '../../middleware/errorHandler';

describe('Export API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/export', exportRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockQuery.mockReset();
  });

  const mockIdea = {
    id: VALID_UUID,
    title: 'Test Idea',
    type: 'idea',
    category: 'business',
    priority: 'high',
    summary: 'A test summary',
    next_steps: '["Step 1","Step 2"]',
    context_needed: '["Context A"]',
    keywords: '["tag1","tag2"]',
    raw_transcript: 'raw text',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-02'),
    is_archived: false,
  };

  // ============================================================
  // GET /api/export/ideas/json
  // ============================================================

  describe('GET /ideas/json', () => {
    it('should export ideas as JSON', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockIdea] });

      const res = await request(app)
        .get('/api/export/ideas/json?context=personal')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['content-disposition']).toMatch(/ideas-backup/);
      expect(res.body.version).toBe('1.0');
      expect(res.body.totalIdeas).toBe(1);
      expect(res.body.ideas).toHaveLength(1);
      expect(res.body.ideas[0].title).toBe('Test Idea');
    });

    it('should parse JSON fields in exported ideas', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockIdea] });

      const res = await request(app)
        .get('/api/export/ideas/json?context=personal')
        .expect(200);

      expect(res.body.ideas[0].next_steps).toEqual(['Step 1', 'Step 2']);
      expect(res.body.ideas[0].keywords).toEqual(['tag1', 'tag2']);
    });

    it('should include archived ideas when flag is set', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockIdea] });

      await request(app)
        .get('/api/export/ideas/json?context=personal&includeArchived=true')
        .expect(200);

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('WHERE user_id = $1');
      expect(sql).not.toContain('is_archived = false');
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/export/ideas/json?context=invalid')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/export/ideas/csv
  // ============================================================

  describe('GET /ideas/csv', () => {
    it('should export ideas as CSV with BOM', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockIdea] });

      const res = await request(app)
        .get('/api/export/ideas/csv?context=personal')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/csv/);
      const body = res.text;
      // CSV should contain BOM
      expect(body.charCodeAt(0)).toBe(0xFEFF);
      expect(body).toContain('ID,Title,Type');
      expect(body).toContain('Test Idea');
    });
  });

  // ============================================================
  // GET /api/export/ideas/markdown
  // ============================================================

  describe('GET /ideas/markdown', () => {
    it('should export ideas as Markdown', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockIdea] });

      const res = await request(app)
        .get('/api/export/ideas/markdown?context=personal')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/markdown/);
      expect(res.text).toContain('# Personal AI Brain');
      expect(res.text).toContain('Test Idea');
      expect(res.text).toContain('High Priority');
    });
  });

  // ============================================================
  // GET /api/export/ideas/pdf
  // ============================================================

  describe('GET /ideas/pdf', () => {
    it('should export ideas as PDF', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockIdea] });

      const res = await request(app)
        .get('/api/export/ideas/pdf?context=personal')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/application\/pdf/);
    });

    it('should reject invalid filter params', async () => {
      const res = await request(app)
        .get('/api/export/ideas/pdf?context=personal&type=INVALID')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/export/ideas/:id/markdown
  // ============================================================

  describe('GET /ideas/:id/markdown', () => {
    it('should export single idea as Markdown', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockIdea] });

      const res = await request(app)
        .get(`/api/export/ideas/${VALID_UUID}/markdown?context=personal`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/markdown/);
      expect(res.text).toContain('# Test Idea');
    });

    it('should return 404 for non-existent idea', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get(`/api/export/ideas/${VALID_UUID}/markdown?context=personal`)
        .expect(404);
    });

    it('should reject invalid UUID', async () => {
      await request(app)
        .get('/api/export/ideas/not-a-uuid/markdown?context=personal')
        .expect(400);
    });
  });

  // ============================================================
  // GET /api/export/backup
  // ============================================================

  describe('GET /backup', () => {
    it('should export full backup', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [mockIdea] })      // ideas
        .mockResolvedValueOnce({ rows: [] })               // meetings
        .mockResolvedValueOnce({ rows: [] })               // clusters
        .mockResolvedValueOnce({ rows: [] });              // thoughts

      const res = await request(app)
        .get('/api/export/backup?context=personal')
        .expect(200);

      expect(res.headers['content-disposition']).toMatch(/full-backup/);
      expect(res.body.version).toBe('1.0');
      expect(res.body.data.ideas.count).toBe(1);
      expect(res.body.data.meetings.count).toBe(0);
    });
  });

  // ============================================================
  // GET /api/export/history
  // ============================================================

  describe('GET /history', () => {
    it('should return export history', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: '1', export_type: 'json', filename: 'test.json', file_size: 1024, created_at: '2026-01-01' }] })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const res = await request(app)
        .get('/api/export/history')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.exports).toHaveLength(1);
      expect(res.body.exports[0].format).toBe('json');
      expect(res.body.pagination.total).toBe(1);
    });
  });

  // ============================================================
  // POST /api/export/history
  // ============================================================

  describe('POST /history', () => {
    it('should record export in history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: '1', export_type: 'json', filename: 'test.json', file_size: 1024, ideas_count: 5, filters: '{}', created_at: '2026-01-01' }],
      });

      const res = await request(app)
        .post('/api/export/history')
        .send({ export_type: 'json', filename: 'test.json', file_size: 1024, ideas_count: 5 })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should reject invalid export_type', async () => {
      const res = await request(app)
        .post('/api/export/history')
        .send({ export_type: 'invalid' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/export/data (unified)
  // ============================================================

  describe('GET /data', () => {
    it('should export data in JSON format', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockIdea] });

      const res = await request(app)
        .get('/api/export/data?format=json&content=ideas&context=personal')
        .expect(200);

      expect(res.body.ideas).toHaveLength(1);
    });

    it('should reject invalid format', async () => {
      const res = await request(app)
        .get('/api/export/data?format=xml&context=personal')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});
