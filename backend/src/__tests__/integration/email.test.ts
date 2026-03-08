/**
 * Integration Tests for Email API (Phase 38)
 *
 * Tests email routes with mocked database and services.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { emailRouter } from '../../routes/email';

// ── Mocks ────────────────────────────────────────────────────────

const mockQueryContext = jest.fn();

jest.mock('../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

// Mock validation - the actual validation.ts imports from database-context, but we need
// to ensure validateContextParam works properly with our mocked isValidContext
jest.mock('../../utils/validation', () => {
  const { ValidationError: RouteValidationError } = jest.requireActual('../../middleware/errorHandler');
  const VALID_CONTEXTS = ['personal', 'work', 'learning', 'creative'];

  return {
    ...jest.requireActual('../../utils/validation'),
    validateContextParam: jest.fn((ctx: string) => {
      if (!VALID_CONTEXTS.includes(ctx)) {
        throw new RouteValidationError(`Invalid context: ${ctx}`);
      }
      return ctx;
    }),
    isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
    isValidEmail: jest.fn((email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    validateEmailAddresses: jest.fn((addrs: Array<{ email: string }>, fieldName: string) => {
      for (const addr of addrs) {
        if (!addr.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.email)) {
          throw new Error(`Invalid email address in ${fieldName}: "${addr.email || '(empty)'}"`);
        }
      }
    }),
  };
});

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../services/email', () => {
  const actual = jest.requireActual('../../services/email');
  return {
    ...actual,
    getEmails: jest.fn(),
    getEmail: jest.fn(),
    getThread: jest.fn(),
    createDraft: jest.fn(),
    updateDraft: jest.fn(),
    sendEmailById: jest.fn(),
    sendNewEmail: jest.fn(),
    replyToEmail: jest.fn(),
    forwardEmail: jest.fn(),
    updateEmailStatus: jest.fn(),
    markAsRead: jest.fn(),
    toggleStar: jest.fn(),
    batchUpdateStatus: jest.fn(),
    moveToTrash: jest.fn(),
    getEmailStats: jest.fn(),
    getAccounts: jest.fn(),
    getAccount: jest.fn(),
    createAccount: jest.fn(),
    createImapAccount: jest.fn(),
    updateAccount: jest.fn(),
    deleteAccount: jest.fn(),
    getLabels: jest.fn(),
    createLabel: jest.fn(),
    updateLabel: jest.fn(),
    deleteLabel: jest.fn(),
  };
});

jest.mock('../../services/imap-sync', () => ({
  testImapConnection: jest.fn(),
  syncAccount: jest.fn(),
}));

jest.mock('../../utils/encryption', () => ({
  encrypt: jest.fn((text: string) => `encrypted_${text}`),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  getEmails, getEmail, getThread, createDraft, sendNewEmail,
  replyToEmail, forwardEmail, markAsRead, toggleStar,
  batchUpdateStatus, moveToTrash, getEmailStats,
  getAccounts, createAccount, updateAccount, deleteAccount,
  getLabels, createLabel,
} from '../../services/email';
import { errorHandler } from '../../middleware/errorHandler';

// ── Test Setup ───────────────────────────────────────────────────

let app: Express;

const MOCK_EMAIL = {
  id: 'a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4',
  resend_email_id: 'resend_123',
  account_id: 'acc-1',
  direction: 'inbound' as const,
  status: 'received' as const,
  from_address: 'sender@example.com',
  from_name: 'Test Sender',
  to_addresses: [{ email: 'me@zensation.ai', name: null }],
  cc_addresses: [],
  bcc_addresses: [],
  subject: 'Test Email',
  body_html: '<p>Hello</p>',
  body_text: 'Hello',
  thread_id: 'thread-1',
  is_starred: false,
  has_attachments: false,
  attachments: [],
  labels: [],
  ai_summary: 'Test summary',
  ai_category: 'business',
  ai_priority: 'medium',
  ai_sentiment: 'neutral',
  ai_action_items: [],
  ai_processed_at: '2026-03-01T00:00:00Z',
  received_at: '2026-03-01T00:00:00Z',
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
};

const MOCK_ACCOUNT = {
  id: 'acc-1',
  email_address: 'me@zensation.ai',
  display_name: 'Test Account',
  domain: 'zensation.ai',
  is_default: true,
  context: 'work',
  created_at: '2026-03-01T00:00:00Z',
};

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api', emailRouter);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────

describe('Email API', () => {
  // ── GET /api/:context/emails/stats ─────────────────────────

  describe('GET /:context/emails/stats', () => {
    it('returns email stats', async () => {
      (getEmailStats as jest.Mock).mockResolvedValueOnce({
        total: 42,
        unread: 5,
        starred: 3,
        by_category: { business: 20, personal: 15, newsletter: 7 },
        by_account: [{ account_id: 'acc-1', email: 'me@zensation.ai', count: 42 }],
      });

      const res = await request(app).get('/api/work/emails/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(42);
      expect(res.body.data.unread).toBe(5);
    });

    it('rejects invalid context', async () => {
      const res = await request(app).get('/api/invalid/emails/stats');
      expect([400, 404]).toContain(res.status);
    });
  });

  // ── GET /api/:context/emails ───────────────────────────────

  describe('GET /:context/emails', () => {
    it('returns email list', async () => {
      (getEmails as jest.Mock).mockResolvedValueOnce({
        emails: [MOCK_EMAIL],
        total: 1,
      });

      const res = await request(app).get('/api/work/emails?folder=inbox');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('rejects invalid folder', async () => {
      const res = await request(app).get('/api/work/emails?folder=invalid');
      expect(res.status).toBe(400);
    });

    it('passes search filter', async () => {
      (getEmails as jest.Mock).mockResolvedValueOnce({ emails: [], total: 0 });

      await request(app).get('/api/work/emails?folder=inbox&search=test');

      expect(getEmails).toHaveBeenCalledWith('work', expect.objectContaining({
        search: 'test',
        folder: 'inbox',
      }));
    });

    it('limits to max 200 results', async () => {
      (getEmails as jest.Mock).mockResolvedValueOnce({ emails: [], total: 0 });

      await request(app).get('/api/work/emails?folder=inbox&limit=999');

      expect(getEmails).toHaveBeenCalledWith('work', expect.objectContaining({
        limit: 200,
      }));
    });
  });

  // ── GET /api/:context/emails/:id ──────────────────────────

  describe('GET /:context/emails/:id', () => {
    it('returns single email and marks as read', async () => {
      (getEmail as jest.Mock).mockResolvedValueOnce({ ...MOCK_EMAIL, status: 'received' });
      (markAsRead as jest.Mock).mockResolvedValueOnce({ ...MOCK_EMAIL, status: 'read' });

      const res = await request(app).get(`/api/work/emails/${MOCK_EMAIL.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(markAsRead).toHaveBeenCalledWith('work', MOCK_EMAIL.id);
    });

    it('does not mark already-read email', async () => {
      (getEmail as jest.Mock).mockResolvedValueOnce({ ...MOCK_EMAIL, status: 'read' });

      const res = await request(app).get(`/api/work/emails/${MOCK_EMAIL.id}`);

      expect(res.status).toBe(200);
      expect(markAsRead).not.toHaveBeenCalled();
    });

    it('returns 404 for non-existent email', async () => {
      (getEmail as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app).get(`/api/work/emails/${MOCK_EMAIL.id}`);

      expect(res.status).toBe(404);
    });

    it('rejects invalid UUID', async () => {
      const res = await request(app).get('/api/work/emails/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/:context/emails/:id/thread ────────────────────

  describe('GET /:context/emails/:id/thread', () => {
    it('returns thread emails', async () => {
      (getEmail as jest.Mock).mockResolvedValueOnce(MOCK_EMAIL);
      (getThread as jest.Mock).mockResolvedValueOnce([MOCK_EMAIL, { ...MOCK_EMAIL, id: 'email-2' }]);

      const res = await request(app).get(`/api/work/emails/${MOCK_EMAIL.id}/thread`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  // ── POST /api/:context/emails/send ─────────────────────────

  describe('POST /:context/emails/send', () => {
    it('sends a new email', async () => {
      (sendNewEmail as jest.Mock).mockResolvedValueOnce({ ...MOCK_EMAIL, direction: 'outbound', status: 'sent' });

      const res = await request(app).post('/api/work/emails/send').send({
        to_addresses: [{ email: 'recipient@example.com' }],
        subject: 'Test',
        body_text: 'Hello World',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('rejects missing recipients', async () => {
      const res = await request(app).post('/api/work/emails/send').send({
        subject: 'Test',
        body_text: 'Hello',
      });

      expect(res.status).toBe(400);
    });

    it('rejects invalid email format', async () => {
      const res = await request(app).post('/api/work/emails/send').send({
        to_addresses: [{ email: 'not-an-email' }],
        subject: 'Test',
        body_text: 'Hello',
      });

      expect(res.status).toBe(400);
    });

    it('validates CC addresses too', async () => {
      const res = await request(app).post('/api/work/emails/send').send({
        to_addresses: [{ email: 'valid@example.com' }],
        cc_addresses: [{ email: 'bad address' }],
        subject: 'Test',
        body_text: 'Hello',
      });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/:context/emails  (create draft) ─────────────

  describe('POST /:context/emails', () => {
    it('creates a draft', async () => {
      (createDraft as jest.Mock).mockResolvedValueOnce({ ...MOCK_EMAIL, status: 'draft', direction: 'outbound' });

      const res = await request(app).post('/api/work/emails').send({
        to_addresses: [{ email: 'recipient@example.com' }],
        subject: 'Draft Test',
        body_text: 'Draft content',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/:context/emails/:id/reply ────────────────────

  describe('POST /:context/emails/:id/reply', () => {
    it('replies to email', async () => {
      (getEmail as jest.Mock).mockResolvedValueOnce(MOCK_EMAIL);
      (replyToEmail as jest.Mock).mockResolvedValueOnce({ ...MOCK_EMAIL, direction: 'outbound', status: 'sent' });

      const res = await request(app).post(`/api/work/emails/${MOCK_EMAIL.id}/reply`).send({
        body_text: 'Reply text',
      });

      expect([200, 201]).toContain(res.status);
    });
  });

  // ── POST /api/:context/emails/:id/forward ──────────────────

  describe('POST /:context/emails/:id/forward', () => {
    it('forwards email', async () => {
      (getEmail as jest.Mock).mockResolvedValueOnce(MOCK_EMAIL);
      (forwardEmail as jest.Mock).mockResolvedValueOnce({ ...MOCK_EMAIL, direction: 'outbound', status: 'sent' });

      const res = await request(app).post(`/api/work/emails/${MOCK_EMAIL.id}/forward`).send({
        to_addresses: [{ email: 'forward@example.com' }],
      });

      expect([200, 201]).toContain(res.status);
    });
  });

  // ── PATCH /api/:context/emails/:id/star ────────────────────

  describe('PATCH /:context/emails/:id/star', () => {
    it('toggles star', async () => {
      (toggleStar as jest.Mock).mockResolvedValueOnce({ ...MOCK_EMAIL, is_starred: true });

      const res = await request(app).patch(`/api/work/emails/${MOCK_EMAIL.id}/star`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/:context/emails/batch ────────────────────────

  describe('POST /:context/emails/batch', () => {
    it('performs batch status update', async () => {
      (batchUpdateStatus as jest.Mock).mockResolvedValueOnce(3);

      const res = await request(app).post('/api/work/emails/batch').send({
        ids: [MOCK_EMAIL.id, 'b0b0b0b0-c1c1-d2d2-e3e3-f4f4f4f4f4f4', 'c0c0c0c0-d1d1-e2e2-f3f3-a4a4a4a4a4a4'],
        status: 'archived',
      });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(3);
    });

    it('rejects empty ids array', async () => {
      const res = await request(app).post('/api/work/emails/batch').send({
        ids: [],
        status: 'read',
      });

      expect(res.status).toBe(400);
    });

    it('rejects invalid status', async () => {
      const res = await request(app).post('/api/work/emails/batch').send({
        ids: [MOCK_EMAIL.id],
        status: 'invalid-status',
      });

      expect(res.status).toBe(400);
    });

    it('limits batch size to 100', async () => {
      const ids = Array.from({ length: 101 }, (_, i) =>
        `${i.toString().padStart(8, '0')}-0000-4000-8000-000000000000`
      );

      const res = await request(app).post('/api/work/emails/batch').send({
        ids,
        status: 'read',
      });

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/:context/emails/:id ────────────────────────

  describe('DELETE /:context/emails/:id', () => {
    it('moves email to trash', async () => {
      (moveToTrash as jest.Mock).mockResolvedValueOnce({ ...MOCK_EMAIL, status: 'trash' });

      const res = await request(app).delete(`/api/work/emails/${MOCK_EMAIL.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Account Management ─────────────────────────────────────

  describe('Account Management', () => {
    it('GET /:context/emails/accounts - lists accounts', async () => {
      (getAccounts as jest.Mock).mockResolvedValueOnce([MOCK_ACCOUNT]);

      const res = await request(app).get('/api/work/emails/accounts');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /:context/emails/accounts - creates account', async () => {
      (createAccount as jest.Mock).mockResolvedValueOnce(MOCK_ACCOUNT);

      const res = await request(app).post('/api/work/emails/accounts').send({
        email_address: 'new@zensation.ai',
        domain: 'zensation.ai',
        is_default: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('POST /:context/emails/accounts - rejects missing email', async () => {
      const res = await request(app).post('/api/work/emails/accounts').send({
        domain: 'zensation.ai',
      });

      expect(res.status).toBe(400);
    });
  });

  // ── Label Management ───────────────────────────────────────

  describe('Label Management', () => {
    it('GET /:context/emails/labels - lists labels', async () => {
      (getLabels as jest.Mock).mockResolvedValueOnce([
        { id: 'lbl-1', name: 'Important', color: '#ff0000' },
      ]);

      const res = await request(app).get('/api/work/emails/labels');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /:context/emails/labels - creates label', async () => {
      (createLabel as jest.Mock).mockResolvedValueOnce({
        id: 'lbl-new',
        name: 'Urgent',
        color: '#ff0000',
      });

      const res = await request(app).post('/api/work/emails/labels').send({
        name: 'Urgent',
        color: '#ff0000',
      });

      expect(res.status).toBe(201);
    });
  });
});
