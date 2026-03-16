/**
 * Tests for Phase 89: Self-Evolving Agent Pipelines
 *
 * Covers agent-feedback, agent-auto-tuner, and agent-specialization services.
 */

// Mock pool before imports
const mockQuery = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  recordFeedback,
  recordUserRating,
  getStrategyPerformance,
  getAgentPerformance,
  getBestStrategy,
} from '../../../services/agents/agent-feedback';

import {
  getDefaultConfig,
  getOptimizedConfig,
  generateRecommendations,
  applyRecommendation,
  TuningRecommendation,
} from '../../../services/agents/agent-auto-tuner';

import {
  getProfile,
  listProfiles,
  updateFromExecution,
  getSpecializationPrompt,
} from '../../../services/agents/agent-specialization';

describe('Agent Feedback Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  // ===========================================
  // recordFeedback
  // ===========================================

  describe('recordFeedback', () => {
    it('should insert feedback and return id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'fb-123' }] });

      const id = await recordFeedback({
        execution_id: 'exec-1',
        strategy: 'research_write_review',
        agents_used: ['researcher', 'writer', 'reviewer'],
        completion_score: 1,
        token_count: 5000,
        execution_time_ms: 30000,
        error_count: 0,
        task_type: 'article',
      });

      expect(id).toBe('fb-123');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toContain('exec-1');
    });

    it('should handle optional user_rating', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'fb-456' }] });

      await recordFeedback({
        execution_id: 'exec-2',
        strategy: 'research_only',
        agents_used: ['researcher'],
        completion_score: 1,
        user_rating: 5,
        token_count: 2000,
        execution_time_ms: 10000,
        error_count: 0,
      });

      const params = mockQuery.mock.calls[0][1];
      expect(params[4]).toBe(5); // user_rating position
    });

    it('should handle metadata', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'fb-789' }] });

      await recordFeedback({
        execution_id: 'exec-3',
        strategy: 'code_solve',
        agents_used: ['coder'],
        completion_score: 0,
        token_count: 3000,
        execution_time_ms: 45000,
        error_count: 2,
        metadata: { error_type: 'timeout' },
      });

      const params = mockQuery.mock.calls[0][1];
      expect(params[9]).toBe('{"error_type":"timeout"}');
    });

    it('should throw on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      await expect(
        recordFeedback({
          execution_id: 'exec-err',
          strategy: 'write_only',
          agents_used: [],
          completion_score: 0,
          token_count: 0,
          execution_time_ms: 0,
          error_count: 0,
        })
      ).rejects.toThrow('DB error');
    });
  });

  // ===========================================
  // recordUserRating
  // ===========================================

  describe('recordUserRating', () => {
    it('should update rating for existing execution', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await recordUserRating('exec-1', 4);
      expect(result).toBe(true);
      expect(mockQuery.mock.calls[0][1]).toEqual([4, 'exec-1']);
    });

    it('should return false for non-existent execution', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await recordUserRating('exec-missing', 3);
      expect(result).toBe(false);
    });

    it('should reject invalid ratings', async () => {
      await expect(recordUserRating('exec-1', 0)).rejects.toThrow('between 1 and 5');
      await expect(recordUserRating('exec-1', 6)).rejects.toThrow('between 1 and 5');
      await expect(recordUserRating('exec-1', 2.5)).rejects.toThrow('between 1 and 5');
    });

    it('should throw on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection lost'));
      await expect(recordUserRating('exec-1', 3)).rejects.toThrow('Connection lost');
    });
  });

  // ===========================================
  // getStrategyPerformance
  // ===========================================

  describe('getStrategyPerformance', () => {
    it('should return aggregated metrics per strategy', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              strategy: 'research_write_review',
              total_executions: '10',
              avg_user_rating: '4.2',
              avg_completion_rate: '0.9',
              avg_execution_time_ms: '25000',
              avg_tokens: '6000',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ recent_rate: '0.95', older_rate: '0.85' }],
        });

      const result = await getStrategyPerformance(30);

      expect(result).toHaveLength(1);
      expect(result[0].strategy).toBe('research_write_review');
      expect(result[0].total_executions).toBe(10);
      expect(result[0].success_trend).toBe('improving');
    });

    it('should return empty array when no data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getStrategyPerformance();
      expect(result).toEqual([]);
    });

    it('should detect declining trend', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              strategy: 'code_solve',
              total_executions: '5',
              avg_user_rating: '3.0',
              avg_completion_rate: '0.7',
              avg_execution_time_ms: '40000',
              avg_tokens: '8000',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ recent_rate: '0.5', older_rate: '0.9' }],
        });

      const result = await getStrategyPerformance(30);
      expect(result[0].success_trend).toBe('declining');
    });

    it('should detect stable trend', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              strategy: 'write_only',
              total_executions: '8',
              avg_user_rating: '4.0',
              avg_completion_rate: '0.85',
              avg_execution_time_ms: '15000',
              avg_tokens: '3000',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ recent_rate: '0.86', older_rate: '0.84' }],
        });

      const result = await getStrategyPerformance(30);
      expect(result[0].success_trend).toBe('stable');
    });
  });

  // ===========================================
  // getAgentPerformance
  // ===========================================

  describe('getAgentPerformance', () => {
    it('should return metrics for a specific agent', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_executions: '20',
            avg_user_rating: '4.5',
            avg_completion_rate: '0.95',
            avg_execution_time_ms: '12000',
            avg_error_count: '0.1',
          },
        ],
      });

      const result = await getAgentPerformance('researcher', 30);

      expect(result).not.toBeNull();
      expect((result as any).agent_role).toBe('researcher');
      expect((result as any).total_executions).toBe(20);
      expect((result as any).avg_user_rating).toBe(4.5);
    });

    it('should return null when no data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_executions: '0', avg_user_rating: '0', avg_completion_rate: '0', avg_execution_time_ms: '0', avg_error_count: '0' }],
      });

      const result = await getAgentPerformance('unknown_role');
      expect(result).toBeNull();
    });
  });

  // ===========================================
  // getBestStrategy
  // ===========================================

  describe('getBestStrategy', () => {
    it('should return best strategy for task type', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ strategy: 'research_write_review', avg_completion: 0.95, avg_rating: 4.5, exec_count: 10 }],
      });

      const result = await getBestStrategy('article');
      expect(result).toBe('research_write_review');
    });

    it('should return null when no matching data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getBestStrategy('unknown_task');
      expect(result).toBeNull();
    });
  });
});

// ===========================================
// Agent Auto-Tuner Tests
// ===========================================

describe('Agent Auto-Tuner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('getDefaultConfig', () => {
    it('should return researcher config', () => {
      const config = getDefaultConfig('researcher');
      expect(config.agent_role).toBe('researcher');
      expect(config.model).toBe('claude-haiku-4-5-20251001');
      expect(config.temperature).toBe(0.3);
    });

    it('should return writer config', () => {
      const config = getDefaultConfig('writer');
      expect(config.model).toBe('claude-sonnet-4-20250514');
      expect(config.temperature).toBe(0.7);
    });

    it('should return coder config with retry enabled', () => {
      const config = getDefaultConfig('coder');
      expect(config.retry_on_fail).toBe(true);
      expect(config.max_tokens).toBe(8192);
    });

    it('should return fallback config for unknown role', () => {
      const config = getDefaultConfig('unknown');
      expect(config.agent_role).toBe('unknown');
      expect(config.model).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('getOptimizedConfig', () => {
    it('should return stored config if exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'researcher',
            model: 'claude-sonnet-4-20250514',
            temperature: '0.5',
            max_tokens: '6144',
            retry_on_fail: true,
          },
        ],
      });

      const config = await getOptimizedConfig('researcher');
      expect(config.model).toBe('claude-sonnet-4-20250514');
      expect(config.max_tokens).toBe(6144);
      expect(config.retry_on_fail).toBe(true);
    });

    it('should return default config if none stored', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const config = await getOptimizedConfig('writer');
      expect(config.model).toBe('claude-sonnet-4-20250514');
      expect(config.temperature).toBe(0.7);
    });

    it('should return default on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));

      const config = await getOptimizedConfig('reviewer');
      expect(config.model).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend model escalation for low ratings', async () => {
      // Stats query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'researcher',
            avg_rating: '2.5',
            avg_completion: '0.7',
            avg_time_ms: '20000',
            avg_tokens: '3000',
            avg_errors: '0.1',
            exec_count: '10',
          },
        ],
      });
      // getOptimizedConfig query (no stored config)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const recs = await generateRecommendations();
      expect(recs.length).toBeGreaterThan(0);

      const researcherRec = recs.find((r) => r.agent_role === 'researcher');
      expect(researcherRec).toBeDefined();
      // Researcher default is haiku, should escalate to sonnet
      expect(researcherRec!.recommended.model).toBe('claude-sonnet-4-20250514');
      expect(researcherRec!.reason).toContain('escalate model');
    });

    it('should recommend model downgrade for high rating + slow', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'writer',
            avg_rating: '4.5',
            avg_completion: '0.95',
            avg_time_ms: '80000',
            avg_tokens: '3000',
            avg_errors: '0.0',
            exec_count: '15',
          },
        ],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const recs = await generateRecommendations();
      const writerRec = recs.find((r) => r.agent_role === 'writer');
      expect(writerRec).toBeDefined();
      // Writer default is sonnet, should downgrade to haiku
      expect(writerRec!.recommended.model).toBe('claude-haiku-4-5-20251001');
      expect(writerRec!.reason).toContain('downgrade model');
    });

    it('should recommend enabling retry on frequent errors', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'reviewer',
            avg_rating: '3.5',
            avg_completion: '0.8',
            avg_time_ms: '25000',
            avg_tokens: '3000',
            avg_errors: '0.5',
            exec_count: '8',
          },
        ],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const recs = await generateRecommendations();
      const reviewerRec = recs.find((r) => r.agent_role === 'reviewer');
      expect(reviewerRec).toBeDefined();
      expect(reviewerRec!.recommended.retry_on_fail).toBe(true);
      expect(reviewerRec!.reason).toContain('enable retry');
    });

    it('should return empty when not enough data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const recs = await generateRecommendations();
      expect(recs).toEqual([]);
    });
  });

  describe('applyRecommendation', () => {
    it('should upsert config to DB', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const rec: TuningRecommendation = {
        agent_role: 'researcher',
        current: {
          agent_role: 'researcher',
          model: 'claude-haiku-4-5-20251001',
          temperature: 0.3,
          max_tokens: 4096,
          retry_on_fail: false,
        },
        recommended: {
          agent_role: 'researcher',
          model: 'claude-sonnet-4-20250514',
          temperature: 0.3,
          max_tokens: 4096,
          retry_on_fail: false,
        },
        reason: 'Low rating → escalate model',
        confidence: 0.7,
      };

      await applyRecommendation(rec);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe('researcher');
      expect(params[1]).toBe('claude-sonnet-4-20250514');
    });
  });
});

// ===========================================
// Agent Specialization Tests
// ===========================================

describe('Agent Specialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('getProfile', () => {
    it('should return stored profile', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'researcher',
            specializations: { preferred_sources: ['web', 'docs'] },
            learned_from_executions: '5',
            last_updated: '2026-03-16T10:00:00Z',
          },
        ],
      });

      const profile = await getProfile('researcher');
      expect(profile.agent_role).toBe('researcher');
      expect(profile.specializations.preferred_sources).toContain('web');
      expect(profile.learned_from_executions).toBe(5);
    });

    it('should return default profile when none stored', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const profile = await getProfile('researcher');
      expect(profile.agent_role).toBe('researcher');
      expect(profile.specializations.preferred_sources).toContain('web');
      expect(profile.learned_from_executions).toBe(0);
    });

    it('should return empty specializations for unknown role', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const profile = await getProfile('unknown');
      expect(profile.specializations).toEqual({});
    });

    it('should handle DB error gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('timeout'));

      const profile = await getProfile('writer');
      expect(profile.agent_role).toBe('writer');
      // Returns default instead of throwing
      expect(profile.learned_from_executions).toBe(0);
    });
  });

  describe('listProfiles', () => {
    it('should return all stored profiles', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'researcher',
            specializations: { preferred_sources: ['web'] },
            learned_from_executions: '3',
            last_updated: '2026-03-16T10:00:00Z',
          },
          {
            agent_role: 'writer',
            specializations: { style_preferences: ['formal'] },
            learned_from_executions: '7',
            last_updated: '2026-03-16T11:00:00Z',
          },
        ],
      });

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(2);
      expect(profiles[0].agent_role).toBe('researcher');
      expect(profiles[1].agent_role).toBe('writer');
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const profiles = await listProfiles();
      expect(profiles).toEqual([]);
    });
  });

  describe('updateFromExecution', () => {
    it('should learn preferred sources for researcher', async () => {
      // getProfile query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // upsert query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'researcher',
            specializations: { preferred_sources: ['web', 'docs', 'memory'] },
            learned_from_executions: '1',
            last_updated: '2026-03-16T12:00:00Z',
          },
        ],
      });

      const profile = await updateFromExecution('researcher', {
        tools_used: ['web_search', 'search_documents', 'recall'],
      });

      expect(profile.specializations.preferred_sources).toContain('web');
      expect(profile.specializations.preferred_sources).toContain('docs');
      expect(profile.specializations.preferred_sources).toContain('memory');
    });

    it('should learn language preferences for coder', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'coder',
            specializations: { language_preferences: ['typescript', 'python'] },
            learned_from_executions: '1',
            last_updated: '2026-03-16T12:00:00Z',
          },
        ],
      });

      const profile = await updateFromExecution('coder', {
        tools_used: ['execute_code'],
        language: 'python',
      });

      expect(profile.specializations.language_preferences).toContain('python');
    });

    it('should learn style preferences', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'writer',
            specializations: { style_preferences: ['clear', 'structured', 'academic'] },
            learned_from_executions: '1',
            last_updated: '2026-03-16T12:00:00Z',
          },
        ],
      });

      const profile = await updateFromExecution('writer', {
        style: 'academic',
      });

      expect(profile.specializations.style_preferences).toContain('academic');
    });

    it('should throw on DB error during upsert', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // getProfile
      mockQuery.mockRejectedValueOnce(new Error('write error')); // upsert

      await expect(
        updateFromExecution('researcher', { tools_used: ['web_search'] })
      ).rejects.toThrow('write error');
    });
  });

  describe('getSpecializationPrompt', () => {
    it('should generate prompt with all specializations', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'researcher',
            specializations: {
              preferred_sources: ['web', 'memory'],
              focus_areas: ['accuracy'],
            },
            learned_from_executions: '10',
            last_updated: '2026-03-16T10:00:00Z',
          },
        ],
      });

      const prompt = await getSpecializationPrompt('researcher');
      expect(prompt).toContain('[AGENT SPECIALIZATION]');
      expect(prompt).toContain('web, memory');
      expect(prompt).toContain('accuracy');
      expect(prompt).toContain('10 successful executions');
    });

    it('should return empty string for new agent', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Default researcher has specializations, so it won't be empty
      // Test with a truly unknown role
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const prompt = await getSpecializationPrompt('unknown_agent');
      expect(prompt).toBe('');
    });

    it('should include language preferences for coders', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_role: 'coder',
            specializations: {
              language_preferences: ['typescript', 'rust'],
              focus_areas: ['performance'],
            },
            learned_from_executions: '5',
            last_updated: '2026-03-16T10:00:00Z',
          },
        ],
      });

      const prompt = await getSpecializationPrompt('coder');
      expect(prompt).toContain('typescript, rust');
      expect(prompt).toContain('performance');
    });
  });
});
