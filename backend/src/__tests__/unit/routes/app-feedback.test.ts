import express from 'express';
import request from 'supertest';
import { appFeedbackRouter } from '../../../routes/app-feedback';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_: unknown, __: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn().mockResolvedValue({ rows: [] }),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api', appFeedbackRouter);
app.use(errorHandler);

describe('POST /api/feedback', () => {
  it('accepts valid feedback', async () => {
    const res = await request(app).post('/api/feedback').send({
      category: 'bug',
      title: 'Login button broken',
      description: 'Clicking login does nothing on Firefox',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects missing required fields', async () => {
    const res = await request(app).post('/api/feedback').send({ category: 'bug' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid category', async () => {
    const res = await request(app).post('/api/feedback').send({
      category: 'spam',
      title: 'Test',
      description: 'Test',
    });
    expect(res.status).toBe(400);
  });
});
