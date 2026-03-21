/**
 * Email Webhooks Route Tests
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/user-context', () => ({
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

const mockIsResendConfigured = jest.fn();
const mockIsWebhookConfigured = jest.fn();
const mockVerifyWebhook = jest.fn();
const mockGetInboundEmail = jest.fn();

jest.mock('../../../services/resend', () => ({
  isResendConfigured: () => mockIsResendConfigured(),
  isWebhookConfigured: () => mockIsWebhookConfigured(),
  verifyWebhook: (...args: unknown[]) => mockVerifyWebhook(...args),
  getInboundEmail: (...args: unknown[]) => mockGetInboundEmail(...args),
}));

const mockQueryPublic = jest.fn();
const mockQueryContext = jest.fn();

jest.mock('../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  AIContext: {},
}));

import { emailWebhooksRouter } from '../../../routes/email-webhooks';

describe('Email Webhooks Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/webhooks', emailWebhooksRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
    mockQueryContext.mockReset();
    // Default: dev mode, no signature verification
    delete process.env.NODE_ENV;
  });

  // ---- Webhook Receiving ----

  describe('POST /api/webhooks/resend', () => {
    it('should return 200 with processed:false when Resend not configured', async () => {
      mockIsResendConfigured.mockReturnValue(false);

      const res = await request(app)
        .post('/api/webhooks/resend')
        .send({ type: 'email.received', data: {} });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBe(false);
    });

    it('should process email.received event in dev mode (no signature check)', async () => {
      mockIsResendConfigured.mockReturnValue(true);
      mockIsWebhookConfigured.mockReturnValue(false);
      mockQueryPublic.mockResolvedValue({ rows: [] });
      mockGetInboundEmail.mockResolvedValue({ body: 'Hello world' });
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'email-1' }] });

      const res = await request(app)
        .post('/api/webhooks/resend')
        .send({
          type: 'email.received',
          data: {
            email_id: 'resend-123',
            from: 'sender@example.com',
            to: ['service@zensation.ai'],
            subject: 'Test Email',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBe(true);
    });

    it('should process non-inbound events without error', async () => {
      mockIsResendConfigured.mockReturnValue(true);
      mockIsWebhookConfigured.mockReturnValue(false);
      mockQueryPublic.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/api/webhooks/resend')
        .send({
          type: 'email.delivered',
          data: { email_id: 'resend-456', to: ['user@example.com'] },
        });

      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(true);
    });

    it('should reject in production when webhook secret not configured', async () => {
      process.env.NODE_ENV = 'production';
      mockIsResendConfigured.mockReturnValue(true);
      mockIsWebhookConfigured.mockReturnValue(false);

      const res = await request(app)
        .post('/api/webhooks/resend')
        .send({ type: 'email.received', data: { to: ['a@b.com'] } });

      expect(res.status).toBe(403);
    });

    it('should return 401 when signature verification fails', async () => {
      mockIsResendConfigured.mockReturnValue(true);
      mockIsWebhookConfigured.mockReturnValue(true);
      mockVerifyWebhook.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      // Need rawBody for verification path
      const customApp = express();
      customApp.use((req, _res, next) => {
        (req as unknown as Record<string, unknown>).rawBody = Buffer.from('{}');
        next();
      });
      customApp.use(express.json());
      customApp.use('/api/webhooks', emailWebhooksRouter);

      const res = await request(customApp)
        .post('/api/webhooks/resend')
        .send({ type: 'email.received', data: {} });

      expect(res.status).toBe(401);
    });

    it('should return 400 when rawBody is missing for signature verification', async () => {
      mockIsResendConfigured.mockReturnValue(true);
      mockIsWebhookConfigured.mockReturnValue(true);

      const res = await request(app)
        .post('/api/webhooks/resend')
        .send({ type: 'email.received', data: {} });

      expect(res.status).toBe(400);
    });
  });

  // ---- Domain Context Mapping ----

  describe('Domain-to-context mapping', () => {
    it('should map zensation.ai to work context', async () => {
      mockIsResendConfigured.mockReturnValue(true);
      mockIsWebhookConfigured.mockReturnValue(false);
      mockQueryPublic.mockResolvedValue({ rows: [] });

      await request(app)
        .post('/api/webhooks/resend')
        .send({
          type: 'email.delivered',
          data: { email_id: 'e1', to: ['info@zensation.ai'] },
        });

      // The context passed to queryPublic should contain 'work'
      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['work'])
      );
    });

    it('should map zensation.app to personal context', async () => {
      mockIsResendConfigured.mockReturnValue(true);
      mockIsWebhookConfigured.mockReturnValue(false);
      mockQueryPublic.mockResolvedValue({ rows: [] });

      await request(app)
        .post('/api/webhooks/resend')
        .send({
          type: 'email.delivered',
          data: { email_id: 'e2', to: ['user@zensation.app'] },
        });

      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['personal'])
      );
    });
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });
});
