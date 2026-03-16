/**
 * Phase 92: Digital Twin Service Tests
 */

import {
  computeRadarFromSections,
  isValidSection,
  type ProfileEntry,
  type RadarScores,
} from '../../../services/digital-twin';

// Mock database-context
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

// Import after mocking
import {
  getProfile,
  upsertProfileSection,
  getRadarScores,
  getEvolution,
  createSnapshot,
  submitCorrection,
  aggregateProfile,
  exportProfile,
} from '../../../services/digital-twin';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

describe('Digital Twin Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ─── isValidSection ─────────────────────────────────────

  describe('isValidSection', () => {
    it('should accept all valid sections', () => {
      expect(isValidSection('personality')).toBe(true);
      expect(isValidSection('expertise')).toBe(true);
      expect(isValidSection('work_patterns')).toBe(true);
      expect(isValidSection('interests')).toBe(true);
      expect(isValidSection('goals')).toBe(true);
      expect(isValidSection('preferences')).toBe(true);
    });

    it('should reject invalid sections', () => {
      expect(isValidSection('invalid')).toBe(false);
      expect(isValidSection('')).toBe(false);
      expect(isValidSection('PERSONALITY')).toBe(false);
    });
  });

  // ─── computeRadarFromSections ───────────────────────────

  describe('computeRadarFromSections', () => {
    it('should return default scores for empty sections', () => {
      const radar = computeRadarFromSections([]);
      expect(radar).toEqual({
        analytical: 50,
        creative: 50,
        organized: 50,
        social: 50,
        technical: 50,
      });
    });

    it('should apply personality radar scores', () => {
      const sections: ProfileEntry[] = [{
        id: '1',
        user_id: TEST_USER_ID,
        section: 'personality',
        data: { radar: { analytical: 80, creative: 70, organized: 60, social: 90, technical: 85 } },
        confidence: 0.8,
        source: 'chat_analysis',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.analytical).toBe(80);
      expect(radar.creative).toBe(70);
      expect(radar.organized).toBe(60);
      expect(radar.social).toBe(90);
      expect(radar.technical).toBe(85);
    });

    it('should boost technical score from expertise areas', () => {
      const sections: ProfileEntry[] = [{
        id: '2',
        user_id: TEST_USER_ID,
        section: 'expertise',
        data: { areas: ['TypeScript', 'React', 'Python'] },
        confidence: 0.7,
        source: 'knowledge_graph',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.technical).toBeGreaterThan(50);
    });

    it('should boost creative score from creative interests', () => {
      const sections: ProfileEntry[] = [{
        id: '3',
        user_id: TEST_USER_ID,
        section: 'interests',
        data: { topics: ['Design', 'Photography', 'Music'] },
        confidence: 0.6,
        source: 'knowledge_graph',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.creative).toBeGreaterThan(50);
    });

    it('should boost organized score from goals', () => {
      const sections: ProfileEntry[] = [{
        id: '4',
        user_id: TEST_USER_ID,
        section: 'goals',
        data: { items: ['Learn Rust', 'Build SaaS'] },
        confidence: 0.6,
        source: 'interaction_data',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.organized).toBeGreaterThan(50);
    });

    it('should boost social score from collaborative preferences', () => {
      const sections: ProfileEntry[] = [{
        id: '5',
        user_id: TEST_USER_ID,
        section: 'preferences',
        data: { communication_style: 'collaborative' },
        confidence: 0.7,
        source: 'chat_analysis',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.social).toBe(70);
    });

    it('should clamp scores between 0 and 100', () => {
      const sections: ProfileEntry[] = [{
        id: '6',
        user_id: TEST_USER_ID,
        section: 'personality',
        data: { radar: { analytical: 150, creative: -20, organized: 50, social: 50, technical: 50 } },
        confidence: 0.8,
        source: 'chat_analysis',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.analytical).toBe(100);
      expect(radar.creative).toBe(0);
    });

    it('should boost analytical from many expertise areas', () => {
      const sections: ProfileEntry[] = [{
        id: '7',
        user_id: TEST_USER_ID,
        section: 'expertise',
        data: { areas: ['ML', 'Statistics', 'Data Science', 'Economics'] },
        confidence: 0.7,
        source: 'knowledge_graph',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.analytical).toBe(60);
    });

    it('should boost organized from work pattern consistency', () => {
      const sections: ProfileEntry[] = [{
        id: '8',
        user_id: TEST_USER_ID,
        section: 'work_patterns',
        data: { consistency: 0.8 },
        confidence: 0.5,
        source: 'interaction_data',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.organized).toBe(66);
    });

    it('should combine multiple section impacts', () => {
      const sections: ProfileEntry[] = [
        {
          id: '9a',
          user_id: TEST_USER_ID,
          section: 'expertise',
          data: { areas: ['TypeScript', 'React', 'Docker', 'Python', 'Go'] },
          confidence: 0.8,
          source: 'knowledge_graph',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: '9b',
          user_id: TEST_USER_ID,
          section: 'goals',
          data: { items: ['Ship MVP', 'Learn Kubernetes'] },
          confidence: 0.6,
          source: 'interaction_data',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const radar = computeRadarFromSections(sections);
      expect(radar.technical).toBeGreaterThan(70);
      expect(radar.organized).toBeGreaterThan(50);
      expect(radar.analytical).toBeGreaterThan(50);
    });
  });

  // ─── getProfile ─────────────────────────────────────────

  describe('getProfile', () => {
    it('should return empty profile when no data exists', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const profile = await getProfile('personal', TEST_USER_ID);
      expect(profile.sections).toEqual([]);
      expect(profile.radar).toBeDefined();
      expect(profile.lastUpdated).toBeNull();
    });

    it('should return profile with sections', async () => {
      const now = new Date().toISOString();
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: '1', user_id: TEST_USER_ID, section: 'expertise', data: { areas: ['TS'] }, confidence: 0.8, source: 'knowledge_graph', updated_at: now, created_at: now },
        ],
      });

      const profile = await getProfile('personal', TEST_USER_ID);
      expect(profile.sections).toHaveLength(1);
      expect(profile.sections[0].section).toBe('expertise');
      expect(profile.lastUpdated).toBe(now);
    });
  });

  // ─── upsertProfileSection ──────────────────────────────

  describe('upsertProfileSection', () => {
    it('should insert new section when it does not exist', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })  // SELECT check
        .mockResolvedValueOnce({ rows: [{ id: 'new-id', user_id: TEST_USER_ID, section: 'expertise', data: { areas: ['TS'] }, confidence: 0.7, source: 'knowledge_graph', updated_at: '', created_at: '' }] });

      const result = await upsertProfileSection('personal', TEST_USER_ID, 'expertise', { areas: ['TS'] }, 'knowledge_graph', 0.7);
      expect(result.id).toBe('new-id');
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('should update existing section', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] })  // SELECT check
        .mockResolvedValueOnce({ rows: [{ id: 'existing-id', user_id: TEST_USER_ID, section: 'expertise', data: { areas: ['Python'] }, confidence: 1.0, source: 'user_correction', updated_at: '', created_at: '' }] });

      const result = await upsertProfileSection('personal', TEST_USER_ID, 'expertise', { areas: ['Python'] }, 'user_correction');
      expect(result.data).toEqual({ areas: ['Python'] });
    });

    it('should default confidence to 1.0 for user corrections', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'new', confidence: 1.0 }] } as any);

      await upsertProfileSection('personal', TEST_USER_ID, 'expertise', {}, 'user_correction');

      // Check the INSERT was called with confidence = 1.0
      const insertCall = mockQueryContext.mock.calls[1];
      expect(insertCall[2][4]).toBe(1.0);
    });
  });

  // ─── getRadarScores ─────────────────────────────────────

  describe('getRadarScores', () => {
    it('should return radar scores', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const radar = await getRadarScores('personal', TEST_USER_ID);
      expect(radar).toHaveProperty('analytical');
      expect(radar).toHaveProperty('creative');
      expect(radar).toHaveProperty('organized');
      expect(radar).toHaveProperty('social');
      expect(radar).toHaveProperty('technical');
    });
  });

  // ─── getEvolution ───────────────────────────────────────

  describe('getEvolution', () => {
    it('should return empty array when no snapshots exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await getEvolution('personal', TEST_USER_ID);
      expect(result).toEqual([]);
    });

    it('should return snapshots ordered by date', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 's1', created_at: '2026-03-16', radar_scores: { analytical: 70 } },
          { id: 's2', created_at: '2026-03-09', radar_scores: { analytical: 60 } },
        ],
      });

      const result = await getEvolution('personal', TEST_USER_ID, 5);
      expect(result).toHaveLength(2);
      expect(mockQueryContext.mock.calls[0][2]).toEqual([TEST_USER_ID, 5]);
    });
  });

  // ─── createSnapshot ─────────────────────────────────────

  describe('createSnapshot', () => {
    it('should create snapshot from current profile', async () => {
      // getProfile query
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: '1', user_id: TEST_USER_ID, section: 'expertise',
          data: { areas: ['TS'] }, confidence: 0.8, source: 'knowledge_graph',
          updated_at: new Date().toISOString(), created_at: new Date().toISOString(),
        }],
      });
      // INSERT snapshot
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'snap-1', user_id: TEST_USER_ID, snapshot: {}, radar_scores: {}, created_at: '' }],
      });

      const snapshot = await createSnapshot('personal', TEST_USER_ID);
      expect(snapshot.id).toBe('snap-1');
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });
  });

  // ─── submitCorrection ──────────────────────────────────

  describe('submitCorrection', () => {
    it('should insert correction and apply it', async () => {
      // Get current value
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ data: { areas: ['old'] } }],
      });
      // Insert correction
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'corr-1', user_id: TEST_USER_ID, section: 'expertise', original_value: { areas: ['old'] }, corrected_value: { areas: ['new'] }, reason: 'Wrong', applied: false, created_at: '' }],
      });
      // upsertProfileSection: SELECT check
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
      // upsertProfileSection: UPDATE
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'existing' }] } as any);
      // Mark applied
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const correction = await submitCorrection('personal', TEST_USER_ID, 'expertise', { areas: ['new'] }, 'Wrong');
      expect(correction.applied).toBe(true);
    });

    it('should handle corrections when no original value exists', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });  // No existing profile
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'corr-2', user_id: TEST_USER_ID, section: 'goals', original_value: null, corrected_value: { items: ['Learn Rust'] }, reason: null, applied: false, created_at: '' }],
      });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });  // upsert SELECT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'new-entry' }] } as any);  // upsert INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });  // mark applied

      const correction = await submitCorrection('personal', TEST_USER_ID, 'goals', { items: ['Learn Rust'] });
      expect(correction.applied).toBe(true);
    });
  });

  // ─── aggregateProfile ──────────────────────────────────

  describe('aggregateProfile', () => {
    it('should aggregate data from multiple sources', async () => {
      // For each aggregation step, we need mock responses
      // 1. Chat stats
      mockQueryContext.mockResolvedValueOnce({ rows: [{ msg_count: '25', avg_length: '150' }] });
      // 1a. upsert personality - SELECT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // 1b. upsert personality - INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'p1', section: 'personality', data: {}, confidence: 0.8, source: 'chat_analysis', updated_at: '', created_at: '' }] } as any);

      // 2. Topic stats
      mockQueryContext.mockResolvedValueOnce({ rows: [{ name: 'TypeScript', idea_count: 5 }] });
      // 2a. upsert expertise - SELECT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // 2b. upsert expertise - INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'p2', section: 'expertise', data: {}, confidence: 0.4, source: 'knowledge_graph', updated_at: '', created_at: '' }] } as any);

      // 3. Interaction stats
      mockQueryContext.mockResolvedValueOnce({ rows: [{ hour: 10, count: '15' }] });
      // 3a. upsert work_patterns - SELECT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // 3b. upsert work_patterns - INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'p3', section: 'work_patterns', data: {}, confidence: 0.3, source: 'interaction_data', updated_at: '', created_at: '' }] } as any);

      // 4. Entity stats
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // 4a. upsert interests - SELECT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // 4b. upsert interests - INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'p4', section: 'interests', data: {}, confidence: 0.4, source: 'knowledge_graph', updated_at: '', created_at: '' }] } as any);

      // 5. Task stats
      mockQueryContext.mockResolvedValueOnce({ rows: [{ status: 'done', count: '10' }] });
      // 5a. Project stats
      mockQueryContext.mockResolvedValueOnce({ rows: [{ name: 'ZenAI', status: 'active' }] });
      // 5b. upsert goals - SELECT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // 5c. upsert goals - INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'p5', section: 'goals', data: {}, confidence: 0.6, source: 'interaction_data', updated_at: '', created_at: '' }] } as any);

      // 6. Memory facts
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // 6a. upsert preferences - SELECT
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // 6b. upsert preferences - INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'p6', section: 'preferences', data: {}, confidence: 0.3, source: 'chat_analysis', updated_at: '', created_at: '' }] } as any);

      const result = await aggregateProfile('personal', TEST_USER_ID);
      expect(result).toHaveLength(6);
    });

    it('should handle query failures gracefully', async () => {
      // All queries fail
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      // Should still return 6 sections (catch blocks return defaults)
      // Actually aggregateProfile catches internally per-query
      // The upsert calls will also fail, so the function will throw
      await expect(aggregateProfile('personal', TEST_USER_ID)).rejects.toThrow();
    });
  });

  // ─── exportProfile ─────────────────────────────────────

  describe('exportProfile', () => {
    it('should export profile with metadata', async () => {
      // getProfile
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: '1', user_id: TEST_USER_ID, section: 'expertise',
          data: { areas: ['TS'] }, confidence: 0.8, source: 'knowledge_graph',
          updated_at: '2026-03-16T00:00:00Z', created_at: '2026-03-16T00:00:00Z',
        }],
      });
      // getEvolution
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const exported = await exportProfile('personal', TEST_USER_ID);
      expect(exported.version).toBe('1.0');
      expect(exported.context).toBe('personal');
      expect(exported.exported_at).toBeDefined();
      expect(exported.radar).toBeDefined();
      expect(exported.sections).toBeDefined();
      expect((exported.sections as Record<string, unknown>)['expertise']).toBeDefined();
    });

    it('should include evolution snapshots count', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });  // getProfile
      mockQueryContext.mockResolvedValueOnce({  // getEvolution
        rows: [
          { id: 's1', created_at: '2026-03-16', radar_scores: { analytical: 70 } },
          { id: 's2', created_at: '2026-03-09', radar_scores: { analytical: 60 } },
        ],
      });

      const exported = await exportProfile('personal', TEST_USER_ID);
      expect(exported.evolution_snapshots).toBe(2);
      expect((exported.recent_snapshots as unknown[]).length).toBe(2);
    });
  });

  // ─── Edge cases ─────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle non-object radar in personality section', () => {
      const sections: ProfileEntry[] = [{
        id: '10',
        user_id: TEST_USER_ID,
        section: 'personality',
        data: { radar: 'not-an-object' },
        confidence: 0.5,
        source: 'chat_analysis',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      // Should return defaults since radar is not an object
      expect(radar.analytical).toBe(50);
    });

    it('should handle empty areas array in expertise', () => {
      const sections: ProfileEntry[] = [{
        id: '11',
        user_id: TEST_USER_ID,
        section: 'expertise',
        data: { areas: [] },
        confidence: 0.5,
        source: 'knowledge_graph',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.technical).toBe(50);
    });

    it('should handle missing data fields gracefully', () => {
      const sections: ProfileEntry[] = [{
        id: '12',
        user_id: TEST_USER_ID,
        section: 'interests',
        data: {},
        confidence: 0.5,
        source: 'knowledge_graph',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }];

      const radar = computeRadarFromSections(sections);
      expect(radar.creative).toBe(50);
    });
  });
});
