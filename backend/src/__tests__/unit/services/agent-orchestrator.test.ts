/**
 * Agent Orchestrator Tests
 *
 * Tests the multi-agent system including:
 * - Task decomposition
 * - Strategy classification
 * - Agent pipeline execution
 * - Result aggregation
 */

import {
  classifyTeamStrategy,
  getAgentPipeline,
  executeTeamTask,
} from '../../../services/agent-orchestrator';
import { sharedMemory } from '../../../services/memory/shared-memory';

// Mock Claude client
jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: jest.fn().mockReturnValue({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '[]' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn',
      }),
    },
  }),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
}));

// Mock tool registry
jest.mock('../../../services/claude/tool-use', () => ({
  toolRegistry: {
    getDefinitionsFor: jest.fn().mockReturnValue([]),
    execute: jest.fn().mockResolvedValue('Tool result'),
  },
  ToolExecutionContext: {},
}));

// Mock database context
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  AIContext: 'personal',
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Agent Orchestrator', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('classifyTeamStrategy', () => {
    it('should classify research tasks', () => {
      expect(classifyTeamStrategy('Recherchiere zum Thema KI in der Medizin'))
        .toBe('research_only');
    });

    it('should classify "finde heraus" as research', () => {
      expect(classifyTeamStrategy('Finde heraus was ich über Marketing geschrieben habe'))
        .toBe('research_only');
    });

    it('should classify "was weiß ich über" as research', () => {
      expect(classifyTeamStrategy('Was weiß ich über React Hooks?'))
        .toBe('research_only');
    });

    it('should classify write tasks', () => {
      expect(classifyTeamStrategy('Schreibe mir eine E-Mail an den Kunden'))
        .toBe('write_only');
    });

    it('should classify "erstelle" as write', () => {
      expect(classifyTeamStrategy('Erstelle einen Blogpost über TypeScript'))
        .toBe('write_only');
    });

    it('should classify complex analysis+write as full pipeline', () => {
      expect(classifyTeamStrategy('Analysiere meine Marketing-Ideen und erstelle eine Strategie'))
        .toBe('research_write_review');
    });

    it('should classify "recherchiere und erstelle" as full pipeline', () => {
      expect(classifyTeamStrategy('Recherchiere zum Thema Rust und erstelle einen Vergleich mit Go'))
        .toBe('research_write_review');
    });

    it('should classify strategy requests as full pipeline', () => {
      expect(classifyTeamStrategy('Erstelle eine Strategie für Q3 Wachstum'))
        .toBe('research_write_review');
    });

    it('should classify report requests as full pipeline', () => {
      expect(classifyTeamStrategy('Erstelle einen Bericht über unsere Fortschritte'))
        .toBe('research_write_review');
    });

    it('should default to full pipeline for long tasks', () => {
      const longTask = 'Ich brauche eine umfassende Zusammenstellung aller Informationen die ich ' +
        'bisher gesammelt habe zum Thema künstliche Intelligenz im Gesundheitswesen';
      expect(classifyTeamStrategy(longTask)).toBe('research_write_review');
    });
  });

  describe('getAgentPipeline', () => {
    it('should return researcher only for research_only', () => {
      expect(getAgentPipeline('research_only')).toEqual(['researcher']);
    });

    it('should return writer + reviewer for write_only', () => {
      expect(getAgentPipeline('write_only')).toEqual(['writer', 'reviewer']);
    });

    it('should return writer only for write_only with skipReview', () => {
      expect(getAgentPipeline('write_only', true)).toEqual(['writer']);
    });

    it('should return full pipeline for research_write_review', () => {
      expect(getAgentPipeline('research_write_review')).toEqual([
        'researcher', 'writer', 'reviewer',
      ]);
    });

    it('should skip reviewer when skipReview is true', () => {
      expect(getAgentPipeline('research_write_review', true)).toEqual([
        'researcher', 'writer',
      ]);
    });

    it('should return empty for custom strategy', () => {
      expect(getAgentPipeline('custom')).toEqual([]);
    });
  });

  describe('executeTeamTask', () => {
    // Mock Claude to return proper responses for decomposition and agent execution
    const { getClaudeClient } = require('../../../services/claude/client');

    beforeEach(() => {
      let callCount = 0;
      getClaudeClient().messages.create.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Task decomposition response
          return Promise.resolve({
            content: [{
              type: 'text',
              text: JSON.stringify([
                { agent: 'researcher', task: 'Recherchiere zum Thema' },
                { agent: 'writer', task: 'Schreibe einen Bericht' },
                { agent: 'reviewer', task: 'Überprüfe den Bericht' },
              ]),
            }],
            usage: { input_tokens: 200, output_tokens: 100 },
            stop_reason: 'end_turn',
          });
        }
        // Agent execution responses
        return Promise.resolve({
          content: [{ type: 'text', text: `Agent response ${callCount}` }],
          usage: { input_tokens: 150, output_tokens: 80 },
          stop_reason: 'end_turn',
        });
      });
    });

    it('should execute a team task and return results', async () => {
      const result = await executeTeamTask({
        description: 'Analysiere und erstelle einen Bericht über KI',
        aiContext: 'personal',
        strategy: 'research_write_review',
      });

      expect(result.teamId).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.finalOutput).toBeDefined();
      expect(result.agentResults.length).toBeGreaterThan(0);
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.strategy).toBe('research_write_review');
    });

    it('should track token usage across all agents', async () => {
      const result = await executeTeamTask({
        description: 'Test task',
        aiContext: 'personal',
        strategy: 'research_write_review',
      });

      expect(result.totalTokens.input).toBeGreaterThan(0);
      expect(result.totalTokens.output).toBeGreaterThan(0);
    });

    it('should clean up shared memory after execution', async () => {
      const result = await executeTeamTask({
        description: 'Test task',
        aiContext: 'personal',
        strategy: 'research_only',
      });

      // Shared memory should be cleaned up
      expect(sharedMemory.has(result.teamId)).toBe(false);
    });

    it('should use auto-classified strategy when none provided', async () => {
      const result = await executeTeamTask({
        description: 'Recherchiere zum Thema React Hooks',
        aiContext: 'personal',
      });

      expect(result.strategy).toBe('research_only');
    });

    it('should handle agent failures gracefully', async () => {
      let callCount = 0;
      getClaudeClient().messages.create.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Decomposition succeeds
          return Promise.resolve({
            content: [{ type: 'text', text: '[{"agent":"researcher","task":"Research something"}]' }],
            usage: { input_tokens: 100, output_tokens: 50 },
            stop_reason: 'end_turn',
          });
        }
        if (callCount === 2) {
          // Agent execution fails
          return Promise.reject(new Error('API Error'));
        }
        // Fallback for any additional calls
        return Promise.resolve({
          content: [{ type: 'text', text: 'Fallback' }],
          usage: { input_tokens: 50, output_tokens: 25 },
          stop_reason: 'end_turn',
        });
      });

      // Should not throw
      const result = await executeTeamTask({
        description: 'Test task',
        aiContext: 'personal',
        strategy: 'research_only',
      });

      // Agent fails but result is still returned
      expect(result).toBeDefined();
      expect(result.agentResults).toHaveLength(1);
      expect(result.agentResults[0].success).toBe(false);
      expect(result.agentResults[0].error).toContain('API Error');
    });

    it('should respect skipReview option', async () => {
      const result = await executeTeamTask({
        description: 'Analysiere und schreibe etwas',
        aiContext: 'personal',
        strategy: 'research_write_review',
        skipReview: true,
      });

      // Should only have 2 agents (researcher + writer), not 3
      const roles = result.agentResults.map(r => r.role);
      expect(roles).not.toContain('reviewer');
    });

    it('should pass context to agents', async () => {
      const result = await executeTeamTask({
        description: 'Test task',
        context: 'Important context information',
        aiContext: 'work',
        strategy: 'research_only',
      });

      expect(result.success).toBe(true);
    });
  });
});
