/**
 * Proactive Assistant Route Tests
 *
 * Tests the proactive suggestions, routines, and workflow endpoints.
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [{ enabled: true }], rowCount: 1 }),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

jest.mock('../../../utils/validation', () => ({
  toIntBounded: jest.fn((val: string | undefined, def: number) => {
    const parsed = parseInt(val ?? '', 10);
    return isNaN(parsed) ? def : parsed;
  }),
  toFloatBounded: jest.fn((val: string | undefined, def: number) => {
    const parsed = parseFloat(val ?? '');
    return isNaN(parsed) ? def : parsed;
  }),
}));

const mockGetSuggestions = jest.fn();
const mockRecordFeedback = jest.fn();

jest.mock('../../../services/proactive-suggestions', () => ({
  proactiveSuggestionEngine: {
    getSuggestions: (...args: unknown[]) => mockGetSuggestions(...args),
    recordFeedback: (...args: unknown[]) => mockRecordFeedback(...args),
  },
  SuggestionType: {},
}));

const mockGetPatterns = jest.fn();
const mockAnalyzeUserPatterns = jest.fn();
const mockCheckActiveRoutines = jest.fn();
const mockLearnFromAction = jest.fn();

jest.mock('../../../services/routine-detection', () => ({
  routineDetectionService: {
    getPatterns: (...args: unknown[]) => mockGetPatterns(...args),
    analyzeUserPatterns: (...args: unknown[]) => mockAnalyzeUserPatterns(...args),
    checkActiveRoutines: (...args: unknown[]) => mockCheckActiveRoutines(...args),
    learnFromAction: (...args: unknown[]) => mockLearnFromAction(...args),
  },
  UserAction: {},
}));

jest.mock('../../../services/workflow-boundary-detector', () => ({
  processWorkflowBoundary: jest.fn(),
  BoundaryTrigger: {},
}));

jest.mock('../../../services/proactive-digest', () => ({
  proactiveDigest: { generateDigest: jest.fn() },
}));

jest.mock('../../../services/evolution-analytics', () => ({
  recordLearningEvent: jest.fn().mockResolvedValue('evt-1'),
}));

jest.mock('../../../services/proactive/proactive-engine', () => ({
  generateMorningBriefing: jest.fn(),
  generateMeetingPrep: jest.fn(),
  getBriefings: jest.fn(),
  getBriefing: jest.fn(),
  markBriefingRead: jest.fn(),
  dismissBriefing: jest.fn(),
  getWorkflowPatterns: jest.fn(),
  createWorkflowPattern: jest.fn(),
  confirmWorkflowPattern: jest.fn(),
  dismissWorkflowPattern: jest.fn(),
  getFollowUpSuggestions: jest.fn(),
  getSmartSchedule: jest.fn(),
}));

import proactiveRouter from '../../../routes/proactive';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Proactive Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/proactive', proactiveRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/proactive/suggestions', () => {
    it('should return proactive suggestions', async () => {
      const suggestions = [{ id: '1', type: 'task', text: 'Review emails' }];
      mockGetSuggestions.mockResolvedValue(suggestions);

      const res = await request(app).get('/api/proactive/suggestions?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.suggestions).toHaveLength(1);
      expect(res.body.count).toBe(1);
    });

    it('should default to personal context', async () => {
      mockGetSuggestions.mockResolvedValue([]);

      const res = await request(app).get('/api/proactive/suggestions');

      expect(res.status).toBe(200);
      expect(mockGetSuggestions).toHaveBeenCalledWith('personal', expect.any(Object));
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/proactive/suggestions?context=invalid');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/proactive/suggestions/:id/accept', () => {
    it('should accept a suggestion', async () => {
      mockRecordFeedback.mockResolvedValue(undefined);
      mockLearnFromAction.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/proactive/suggestions/abc-123/accept')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Suggestion accepted');
    });
  });

  describe('POST /api/proactive/suggestions/:id/dismiss', () => {
    it('should dismiss a suggestion', async () => {
      mockRecordFeedback.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/proactive/suggestions/abc-123/dismiss')
        .send({ context: 'work', reason: 'Not relevant' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Suggestion dismissed');
    });
  });

  describe('GET /api/proactive/routines', () => {
    it('should return detected routines', async () => {
      const routines = [{ id: 'r1', name: 'Morning review', confidence: 0.8 }];
      mockGetPatterns.mockResolvedValue(routines);

      const res = await request(app).get('/api/proactive/routines?context=work');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.routines).toHaveLength(1);
      expect(res.body.count).toBe(1);
    });
  });

  describe('POST /api/proactive/routines/analyze', () => {
    it('should trigger routine analysis', async () => {
      const patterns = [{ name: 'Daily review', confidence: 0.9 }];
      mockAnalyzeUserPatterns.mockResolvedValue(patterns);

      const res = await request(app)
        .post('/api/proactive/routines/analyze')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.patternsFound).toBe(1);
    });
  });

  describe('GET /api/proactive/routines/active', () => {
    it('should return currently active routines', async () => {
      mockCheckActiveRoutines.mockResolvedValue([]);

      const res = await request(app).get('/api/proactive/routines/active?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(0);
    });
  });
});
