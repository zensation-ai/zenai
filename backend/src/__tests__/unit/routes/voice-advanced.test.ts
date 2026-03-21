/**
 * Voice Advanced Route Tests
 *
 * Tests emotion detection, personas, command parsing, and emotion settings.
 */

import express from 'express';
import request from 'supertest';
import { voiceAdvancedRouter } from '../../../routes/voice-advanced';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => 'user-123',
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
}));

const mockDetectFromText = jest.fn();
const mockDetectFromProsody = jest.fn();
const mockCombineSignals = jest.fn();

jest.mock('../../../services/voice/emotion-detection', () => ({
  detectFromText: (...args: unknown[]) => mockDetectFromText(...args),
  detectFromProsody: (...args: unknown[]) => mockDetectFromProsody(...args),
  combineSignals: (...args: unknown[]) => mockCombineSignals(...args),
}));

const mockListPersonas = jest.fn();
const mockGetPersona = jest.fn();
const mockGetPersonaById = jest.fn();
const mockGetPersonaPromptAddendum = jest.fn();

jest.mock('../../../services/voice/voice-personas', () => ({
  listPersonas: (...args: unknown[]) => mockListPersonas(...args),
  getPersona: (...args: unknown[]) => mockGetPersona(...args),
  getPersonaById: (...args: unknown[]) => mockGetPersonaById(...args),
  getPersonaPromptAddendum: (...args: unknown[]) => mockGetPersonaPromptAddendum(...args),
}));

const mockParseCommand = jest.fn();

jest.mock('../../../services/voice/voice-commands', () => ({
  parseCommand: (...args: unknown[]) => mockParseCommand(...args),
}));

describe('Voice Advanced Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', voiceAdvancedRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset queryContext mock
    const { queryContext } = require('../../../utils/database-context');
    queryContext.mockResolvedValue({ rows: [] });
  });

  // --- Emotion Detection ---

  it('POST /:context/voice/emotion/detect — detects from text', async () => {
    mockDetectFromText.mockReturnValue({ primary: 'happy', confidence: 0.8 });

    const res = await request(app)
      .post('/api/personal/voice/emotion/detect')
      .send({ text: 'I feel great today!' });

    expect(res.status).toBe(200);
    expect(res.body.data.primary).toBe('happy');
  });

  it('POST /:context/voice/emotion/detect — detects from prosody', async () => {
    mockDetectFromProsody.mockReturnValue({ primary: 'excited', confidence: 0.7 });

    const res = await request(app)
      .post('/api/personal/voice/emotion/detect')
      .send({ speechRate: 180, avgPitch: 200, volume: 0.8 });

    expect(res.status).toBe(200);
    expect(res.body.data.primary).toBe('excited');
  });

  it('POST /:context/voice/emotion/detect — combines text + prosody', async () => {
    mockDetectFromText.mockReturnValue({ primary: 'happy', confidence: 0.6 });
    mockDetectFromProsody.mockReturnValue({ primary: 'excited', confidence: 0.7 });
    mockCombineSignals.mockReturnValue({ primary: 'excited', confidence: 0.75 });

    const res = await request(app)
      .post('/api/personal/voice/emotion/detect')
      .send({ text: 'Great!', speechRate: 200, volume: 0.9 });

    expect(res.status).toBe(200);
    expect(mockCombineSignals).toHaveBeenCalled();
  });

  it('POST /:context/voice/emotion/detect — rejects empty body', async () => {
    const res = await request(app)
      .post('/api/personal/voice/emotion/detect')
      .send({});

    expect(res.status).toBe(400);
  });

  it('POST /:context/voice/emotion/detect — rejects invalid context', async () => {
    const res = await request(app)
      .post('/api/invalid/voice/emotion/detect')
      .send({ text: 'test' });

    expect(res.status).toBe(400);
  });

  // --- Personas ---

  it('GET /:context/voice/personas — lists personas', async () => {
    mockListPersonas.mockReturnValue([{ id: 'zen', name: 'Zen' }]);
    mockGetPersona.mockReturnValue({ id: 'zen', name: 'Zen' });

    const res = await request(app).get('/api/personal/voice/personas');

    expect(res.status).toBe(200);
    expect(res.body.data.personas).toHaveLength(1);
    expect(res.body.data.contextDefault).toBeDefined();
  });

  it('GET /:context/voice/personas/active — returns active persona', async () => {
    mockGetPersona.mockReturnValue({ id: 'zen', name: 'Zen' });
    mockGetPersonaPromptAddendum.mockReturnValue('Be calm and helpful.');

    const res = await request(app).get('/api/personal/voice/personas/active');

    expect(res.status).toBe(200);
    expect(res.body.data.persona).toBeDefined();
    expect(res.body.data.promptAddendum).toBeDefined();
  });

  it('PUT /:context/voice/personas/active — rejects unknown persona', async () => {
    mockGetPersonaById.mockReturnValue(null);

    const res = await request(app)
      .put('/api/personal/voice/personas/active')
      .send({ personaId: 'nonexistent' });

    expect(res.status).toBe(400);
  });

  // --- Command Parsing ---

  it('POST /:context/voice/command/parse — parses transcript', async () => {
    mockParseCommand.mockReturnValue({ intent: 'create_task', entities: { title: 'Buy milk' } });

    const res = await request(app)
      .post('/api/personal/voice/command/parse')
      .send({ transcript: 'Create a task to buy milk' });

    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBe('create_task');
  });

  it('POST /:context/voice/command/parse — rejects empty transcript', async () => {
    const res = await request(app)
      .post('/api/personal/voice/command/parse')
      .send({ transcript: '' });

    expect(res.status).toBe(400);
  });

  // --- Emotion Settings ---

  it('GET /:context/voice/emotion/settings — returns defaults when no settings', async () => {
    const res = await request(app).get('/api/personal/voice/emotion/settings');

    expect(res.status).toBe(200);
    expect(res.body.data.emotion_detection_enabled).toBe(true);
  });
});
