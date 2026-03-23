import express from 'express';
import request from 'supertest';
import { createSlackRouter } from '../../../routes/slack';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));
jest.mock('../../../middleware/jwt-auth', () => ({
  requireJwt: (_req: any, _res: any, next: any) => {
    _req.jwtUser = { id: 'user-1', plan: 'pro' };
    next();
  },
}));
jest.mock('../../../utils/user-context', () => ({
  getUserId: () => 'user-1',
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { queryPublic } = require('../../../utils/database-context');

describe('Slack Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/slack', createSlackRouter());
    app.use(errorHandler);
  });

  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/slack/workspaces', () => {
    it('returns list of connected workspaces', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'ws-1',
          team_id: 'T123',
          team_name: 'Test',
          bot_user_id: 'U_BOT',
          proactive_config: { enabled: true },
          created_at: new Date().toISOString(),
        }],
      });

      const res = await request(app).get('/api/slack/workspaces');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('returns empty array when no workspaces', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/slack/workspaces');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/slack/channels', () => {
    it('returns channels with context mapping', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{ id: 'ws-1' }],
      });
      queryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          channel_id: 'C123',
          channel_name: 'engineering',
          target_context: 'work',
          muted: false,
        }],
      });

      const res = await request(app).get('/api/slack/channels');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].channel_name).toBe('engineering');
    });

    it('returns empty array when no workspace', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/slack/channels');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('PATCH /api/slack/channels/:channelId/config', () => {
    it('updates channel context', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ch-1' }] });

      const res = await request(app)
        .patch('/api/slack/channels/ch-1/config')
        .send({ target_context: 'learning' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects invalid context', async () => {
      const res = await request(app)
        .patch('/api/slack/channels/ch-1/config')
        .send({ target_context: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('rejects empty update', async () => {
      const res = await request(app)
        .patch('/api/slack/channels/ch-1/config')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/slack/workspaces/:id/proactive', () => {
    it('updates proactive config', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-1' }] });

      const res = await request(app)
        .patch('/api/slack/workspaces/ws-1/proactive')
        .send({ enabled: false, confidenceThreshold: 0.9 });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/slack/activity', () => {
    it('returns recent activity log', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [
          { id: 'log-1', event_type: 'integration.slack.message_received', created_at: new Date().toISOString() },
        ],
      });

      const res = await request(app).get('/api/slack/activity');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/slack/commands/summarize', () => {
    it('accepts a channelId', async () => {
      const res = await request(app)
        .post('/api/slack/commands/summarize')
        .send({ channelId: 'C123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.channelId).toBe('C123');
    });

    it('rejects missing channelId', async () => {
      const res = await request(app)
        .post('/api/slack/commands/summarize')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
