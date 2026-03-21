/**
 * User Profile Route Tests
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockProfile = {
  preferred_categories: { tech: 5, design: 3 },
  preferred_types: { idea: 8, task: 2 },
  topic_interests: { typescript: 10, react: 7 },
  total_ideas: 50,
  total_meetings: 5,
  avg_ideas_per_day: 3.5,
  auto_priority_enabled: true,
};

const mockGetUserProfile = jest.fn();
const mockGetUserProfileWithContext = jest.fn();
const mockTrackInteraction = jest.fn();
const mockGetRecommendations = jest.fn();
const mockGetRecommendationsWithContext = jest.fn();
const mockGetPersonalizedIdeas = jest.fn();
const mockRecalculateStats = jest.fn();
const mockRecalculateStatsWithContext = jest.fn();
const mockSetAutoPriority = jest.fn();
const mockSetAutoPriorityWithContext = jest.fn();
const mockUpdateInterestEmbedding = jest.fn();
const mockSuggestPriority = jest.fn();

jest.mock('../../../services/user-profile', () => ({
  getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
  getUserProfileWithContext: (...args: unknown[]) => mockGetUserProfileWithContext(...args),
  trackInteraction: (...args: unknown[]) => mockTrackInteraction(...args),
  getRecommendations: (...args: unknown[]) => mockGetRecommendations(...args),
  getRecommendationsWithContext: (...args: unknown[]) => mockGetRecommendationsWithContext(...args),
  getPersonalizedIdeas: (...args: unknown[]) => mockGetPersonalizedIdeas(...args),
  recalculateStats: (...args: unknown[]) => mockRecalculateStats(...args),
  recalculateStatsWithContext: (...args: unknown[]) => mockRecalculateStatsWithContext(...args),
  setAutoPriority: (...args: unknown[]) => mockSetAutoPriority(...args),
  setAutoPriorityWithContext: (...args: unknown[]) => mockSetAutoPriorityWithContext(...args),
  updateInterestEmbedding: (...args: unknown[]) => mockUpdateInterestEmbedding(...args),
  suggestPriority: (...args: unknown[]) => mockSuggestPriority(...args),
}));

import { userProfileRouter, userProfileContextRouter } from '../../../routes/user-profile';
import { errorHandler } from '../../../middleware/errorHandler';

describe('User Profile Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/profile', userProfileRouter);
    app.use('/api', userProfileContextRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/profile', () => {
    it('should return user profile', async () => {
      mockGetUserProfile.mockResolvedValue(mockProfile);

      const res = await request(app).get('/api/profile');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.profile.total_ideas).toBe(50);
    });
  });

  describe('POST /api/profile/track', () => {
    it('should track an interaction', async () => {
      mockTrackInteraction.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/profile/track')
        .send({ interaction_type: 'view', idea_id: 'abc' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject missing interaction_type', async () => {
      const res = await request(app)
        .post('/api/profile/track')
        .send({ idea_id: 'abc' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/profile/recommendations', () => {
    it('should return recommendations', async () => {
      mockGetRecommendations.mockResolvedValue([{ id: 'r1', text: 'Try X' }]);

      const res = await request(app).get('/api/profile/recommendations');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.recommendations).toHaveLength(1);
    });
  });

  describe('GET /api/profile/personalized-ideas', () => {
    it('should return personalized ideas', async () => {
      mockGetPersonalizedIdeas.mockResolvedValue([{ id: 'i1' }]);

      const res = await request(app).get('/api/profile/personalized-ideas');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });
  });

  describe('PUT /api/profile/auto-priority', () => {
    it('should enable auto-priority', async () => {
      mockSetAutoPriority.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/api/profile/auto-priority')
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.auto_priority_enabled).toBe(true);
    });

    it('should reject non-boolean enabled', async () => {
      const res = await request(app)
        .put('/api/profile/auto-priority')
        .send({ enabled: 'yes' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/profile/suggest-priority', () => {
    it('should suggest priority for keywords', async () => {
      mockSuggestPriority.mockResolvedValue('high');

      const res = await request(app)
        .post('/api/profile/suggest-priority')
        .send({ keywords: ['urgent', 'deadline'] });

      expect(res.status).toBe(200);
      expect(res.body.suggested_priority).toBe('high');
    });

    it('should reject missing keywords', async () => {
      const res = await request(app)
        .post('/api/profile/suggest-priority')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/profile/stats', () => {
    it('should return profile statistics', async () => {
      mockGetUserProfile.mockResolvedValue(mockProfile);

      const res = await request(app).get('/api/profile/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.total_ideas).toBe(50);
      expect(res.body.top_categories).toBeDefined();
    });
  });

  // Context-aware routes
  describe('GET /api/:context/profile/stats', () => {
    it('should return context-specific stats', async () => {
      mockGetUserProfileWithContext.mockResolvedValue(mockProfile);

      const res = await request(app).get('/api/personal/profile/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGetUserProfileWithContext).toHaveBeenCalledWith('personal', 'default');
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/profile/stats');
      expect(res.status).toBe(400);
    });
  });
});
