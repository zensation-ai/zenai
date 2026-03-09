/**
 * Agent Orchestrator Tests
 *
 * Tests the multi-agent system including:
 * - Task decomposition
 * - Strategy classification (incl. code patterns)
 * - Agent pipeline execution
 * - Result aggregation
 * - Error recovery & retry
 * - Agent templates
 * - Progress callbacks
 */

import {
  classifyTeamStrategy,
  getAgentPipeline,
  executeTeamTask,
  AGENT_TEMPLATES,
  AgentProgressEvent,
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

    // Phase 45: Code-related patterns
    it('should classify code generation as code_solve', () => {
      expect(classifyTeamStrategy('Schreibe mir Code für einen REST API Client'))
        .toBe('code_solve');
    });

    it('should classify "implementiere" as code_solve', () => {
      expect(classifyTeamStrategy('Implementiere einen Bubble Sort Algorithmus'))
        .toBe('code_solve');
    });

    it('should classify "programmiere" as code_solve', () => {
      expect(classifyTeamStrategy('Programmiere eine Funktion zum Validieren von E-Mails'))
        .toBe('code_solve');
    });

    it('should classify debug tasks as code_solve', () => {
      expect(classifyTeamStrategy('Debugge den Fehler in der Login-Funktion'))
        .toBe('code_solve');
    });

    it('should classify code review as research_code_review', () => {
      expect(classifyTeamStrategy('Analysiere den Code und finde Fehler'))
        .toBe('research_code_review');
    });

    it('should classify code optimization as research_code_review', () => {
      expect(classifyTeamStrategy('Optimiere den Code für bessere Performance'))
        .toBe('research_code_review');
    });

    it('should classify "code review" as research_code_review', () => {
      expect(classifyTeamStrategy('Mache ein Code Review für die neue API'))
        .toBe('research_code_review');
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

    // Phase 45: Code pipelines
    it('should return coder + reviewer for code_solve', () => {
      expect(getAgentPipeline('code_solve')).toEqual(['coder', 'reviewer']);
    });

    it('should return coder only for code_solve with skipReview', () => {
      expect(getAgentPipeline('code_solve', true)).toEqual(['coder']);
    });

    it('should return researcher + coder + reviewer for research_code_review', () => {
      expect(getAgentPipeline('research_code_review')).toEqual([
        'researcher', 'coder', 'reviewer',
      ]);
    });
  });

  describe('AGENT_TEMPLATES', () => {
    it('should have at least 5 templates', () => {
      expect(AGENT_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    });

    it('should have unique IDs', () => {
      const ids = AGENT_TEMPLATES.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have required fields for each template', () => {
      for (const template of AGENT_TEMPLATES) {
        expect(template.id).toBeTruthy();
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.icon).toBeTruthy();
        expect(template.strategy).toBeTruthy();
      }
    });

    it('should include a code template', () => {
      const codeTemplate = AGENT_TEMPLATES.find(t => t.strategy === 'code_solve');
      expect(codeTemplate).toBeDefined();
      expect(codeTemplate?.id).toBe('code_solution');
    });

    it('should include a research template', () => {
      const researchTemplate = AGENT_TEMPLATES.find(t => t.strategy === 'research_only');
      expect(researchTemplate).toBeDefined();
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
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
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

    it('should handle agent failures gracefully with retry', async () => {
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
          // First execution fails
          return Promise.reject(new Error('API Error'));
        }
        // Retry succeeds
        return Promise.resolve({
          content: [{ type: 'text', text: 'Retry succeeded' }],
          usage: { input_tokens: 50, output_tokens: 25 },
          stop_reason: 'end_turn',
        });
      });

      const result = await executeTeamTask({
        description: 'Test task',
        aiContext: 'personal',
        strategy: 'research_only',
      });

      expect(result).toBeDefined();
      expect(result.agentResults).toHaveLength(1);
      // Should succeed after retry
      expect(result.agentResults[0].success).toBe(true);
      expect(result.agentResults[0].content).toBe('Retry succeeded');
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

    // Phase 45: Progress callback tests
    it('should emit progress events during execution', async () => {
      const events: AgentProgressEvent[] = [];

      await executeTeamTask(
        {
          description: 'Test with progress',
          aiContext: 'personal',
          strategy: 'research_only',
        },
        (event) => events.push(event)
      );

      // Should have team_start, agent_start, agent_complete, team_complete
      expect(events.some(e => e.type === 'team_start')).toBe(true);
      expect(events.some(e => e.type === 'agent_start')).toBe(true);
      expect(events.some(e => e.type === 'team_complete')).toBe(true);
    });

    it('should include pipeline info in team_start event', async () => {
      const events: AgentProgressEvent[] = [];

      await executeTeamTask(
        {
          description: 'Test pipeline info',
          aiContext: 'personal',
          strategy: 'research_write_review',
        },
        (event) => events.push(event)
      );

      const teamStart = events.find(e => e.type === 'team_start');
      expect(teamStart?.strategy).toBe('research_write_review');
      expect(teamStart?.pipeline).toEqual(['researcher', 'writer', 'reviewer']);
    });

    // Phase 45: Code pipeline test
    it('should execute code_solve strategy with coder agent', async () => {
      let callCount = 0;
      getClaudeClient().messages.create.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            content: [{
              type: 'text',
              text: JSON.stringify([
                { agent: 'coder', task: 'Implementiere die Lösung' },
                { agent: 'reviewer', task: 'Überprüfe den Code' },
              ]),
            }],
            usage: { input_tokens: 200, output_tokens: 100 },
            stop_reason: 'end_turn',
          });
        }
        return Promise.resolve({
          content: [{ type: 'text', text: `Code response ${callCount}` }],
          usage: { input_tokens: 150, output_tokens: 80 },
          stop_reason: 'end_turn',
        });
      });

      const result = await executeTeamTask({
        description: 'Implementiere einen Sortieralgorithmus',
        aiContext: 'personal',
        strategy: 'code_solve',
      });

      expect(result.strategy).toBe('code_solve');
      expect(result.success).toBe(true);
      expect(result.agentResults.some(r => r.role === 'coder')).toBe(true);
    });
  });
});
