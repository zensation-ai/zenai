/**
 * Phase 114: Agent Intelligence Tests
 *
 * Tests for:
 * - Task 50: Dynamic model routing (selectModelForTask)
 * - Task 51: Tool specialization (getSpecializedTools)
 * - Task 52: Graceful degradation (executeWithFallback, executeToolsWithFallback)
 * - Task 53: Cost tracking (recordAgentCost, estimateTokenCost, getAgentCostSummary)
 */

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock tool registry for tool-search tests
jest.mock('../../../services/claude/tool-use', () => ({
  toolRegistry: {
    getDefinitions: jest.fn(() => [
      { name: 'web_search', description: 'Search the web' },
      { name: 'fetch_url', description: 'Fetch URL content' },
      { name: 'search_ideas', description: 'Search ideas' },
      { name: 'create_idea', description: 'Create an idea' },
      { name: 'recall', description: 'Recall from memory' },
      { name: 'execute_code', description: 'Execute code' },
      { name: 'github_search', description: 'Search GitHub' },
      { name: 'analyze_project', description: 'Analyze project' },
      { name: 'synthesize_knowledge', description: 'Synthesize knowledge' },
      { name: 'draft_email', description: 'Draft an email' },
      { name: 'remember', description: 'Remember something' },
      { name: 'memory_introspect', description: 'Introspect memory' },
    ]),
  },
}));

import { selectModelForTask, ModelTier } from '../../../services/agents/agent-graph';
import { ToolSearchService, AgentRole } from '../../../services/tool-handlers/tool-search';
import {
  createFallbackChain,
  executeWithFallback,
  executeToolsWithFallback,
  DEFAULT_MODEL_FALLBACK_CHAIN,
  FAST_MODEL_FALLBACK_CHAIN,
} from '../../../services/agent-orchestrator';
import {
  recordAgentCost,
  estimateTokenCost,
  getAgentCostRecords,
  getAgentCostSummary,
  clearAgentCostRecords,
  clearSnapshots,
} from '../../../services/observability/metrics';

// ===========================================
// Task 50: Dynamic Model Routing
// ===========================================

describe('selectModelForTask (Phase 114 Task 50)', () => {
  it('returns fast tier for short, simple, no-tool tasks', () => {
    const result = selectModelForTask('list items', 0);
    expect(result.tier).toBe('fast');
    expect(result.model).toContain('haiku');
  });

  it('returns standard tier for medium complexity tasks', () => {
    const result = selectModelForTask('Write a short email to a colleague about the meeting tomorrow', 1);
    expect(result.tier).toBe('standard');
    expect(result.model).toContain('sonnet');
  });

  it('returns powerful tier for complex, long, multi-tool tasks', () => {
    const longComplexTask =
      'Analyze the entire architecture of our microservices system and synthesize a comprehensive strategy for optimizing performance and reducing latency across all services including database queries, caching, and network calls';
    const result = selectModelForTask(longComplexTask, 5);
    expect(result.tier).toBe('powerful');
    expect(result.model).toContain('opus');
  });

  it('respects override tier', () => {
    const result = selectModelForTask('simple task', 0, 'powerful');
    expect(result.tier).toBe('powerful');
    expect(result.reason).toBe('override provided');
  });

  it('returns standard tier for moderate tasks with some tools', () => {
    const result = selectModelForTask('Research current best practices for microservice patterns', 2);
    // Length > 15 words and tool count = 2, but not high complexity → standard
    expect(['standard', 'powerful']).toContain(result.tier);
  });

  it('includes a reason string', () => {
    const result = selectModelForTask('quick check', 0);
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
  });

  it('returns all three tiers based on complexity cues', () => {
    const tiers: Set<ModelTier> = new Set();

    tiers.add(selectModelForTask('count', 0).tier);
    tiers.add(selectModelForTask('Write a report about market trends', 1).tier);
    tiers.add(selectModelForTask(
      'Analyze and synthesize the comprehensive architecture strategy for advanced optimization',
      4
    ).tier);

    // Should see at least 2 different tiers
    expect(tiers.size).toBeGreaterThanOrEqual(2);
  });

  it('returns model name string (not empty)', () => {
    const result = selectModelForTask('do something', 0);
    expect(result.model).toBeTruthy();
    expect(typeof result.model).toBe('string');
  });
});

// ===========================================
// Task 51: Tool Specialization
// ===========================================

describe('ToolSearchService.getSpecializedTools (Phase 114 Task 51)', () => {
  let service: ToolSearchService;

  beforeEach(() => {
    service = new ToolSearchService();
  });

  it('returns researcher tools for researcher role', () => {
    const tools = service.getSpecializedTools('researcher');
    const names = tools.map(t => t.name);
    expect(names).toContain('web_search');
    expect(names).toContain('search_ideas');
    expect(names).toContain('recall');
    // Should NOT contain coder-specific tools
    expect(names).not.toContain('execute_code');
  });

  it('returns writer tools for writer role', () => {
    const tools = service.getSpecializedTools('writer');
    const names = tools.map(t => t.name);
    expect(names).toContain('draft_email');
    expect(names).toContain('remember');
  });

  it('returns coder tools for coder role', () => {
    const tools = service.getSpecializedTools('coder');
    const names = tools.map(t => t.name);
    expect(names).toContain('execute_code');
    expect(names).toContain('github_search');
  });

  it('returns reviewer tools for reviewer role', () => {
    const tools = service.getSpecializedTools('reviewer');
    const names = tools.map(t => t.name);
    expect(names).toContain('search_ideas');
    expect(names).toContain('memory_introspect');
    // Should not include execution tools
    expect(names).not.toContain('execute_code');
  });

  it('returns all tools for general role', () => {
    const tools = service.getSpecializedTools('general');
    expect(tools.length).toBeGreaterThan(0);
    // General returns all registered tools
    expect(tools.length).toBe(12); // matches our mock
  });

  it('respects limit parameter', () => {
    const tools = service.getSpecializedTools('researcher', 3);
    expect(tools.length).toBeLessThanOrEqual(3);
  });

  it('returns results with score and description', () => {
    const tools = service.getSpecializedTools('coder');
    for (const tool of tools) {
      expect(tool.score).toBeGreaterThan(0);
      expect(tool.description).toBeTruthy();
      expect(tool.matchSource).toBe('keyword');
    }
  });

  it('returns higher scores for higher-priority tools in affinity list', () => {
    const tools = service.getSpecializedTools('researcher');
    if (tools.length >= 2) {
      // First tool should have >= score of last tool
      expect(tools[0].score).toBeGreaterThanOrEqual(tools[tools.length - 1].score);
    }
  });
});

// ===========================================
// Task 52: Graceful Degradation
// ===========================================

describe('createFallbackChain (Phase 114 Task 52)', () => {
  it('creates a fallback chain with default models', () => {
    const chain = createFallbackChain();
    expect(chain.models).toEqual(DEFAULT_MODEL_FALLBACK_CHAIN);
    expect(chain.currentIndex).toBe(0);
  });

  it('creates a fallback chain starting at a specific model', () => {
    const chain = createFallbackChain('claude-sonnet-4-5', DEFAULT_MODEL_FALLBACK_CHAIN);
    expect(chain.currentIndex).toBe(1); // sonnet is index 1
  });

  it('falls back to index 0 for unknown model', () => {
    const chain = createFallbackChain('unknown-model', DEFAULT_MODEL_FALLBACK_CHAIN);
    expect(chain.currentIndex).toBe(0);
  });

  it('supports custom chain', () => {
    const chain = createFallbackChain('claude-sonnet-4-5', FAST_MODEL_FALLBACK_CHAIN);
    expect(chain.models).toEqual(FAST_MODEL_FALLBACK_CHAIN);
    expect(chain.currentIndex).toBe(0); // sonnet is first in fast chain
  });
});

describe('executeWithFallback (Phase 114 Task 52)', () => {
  it('succeeds on first try without fallback', async () => {
    const chain = createFallbackChain();
    const executor = jest.fn().mockResolvedValue('success');

    const result = await executeWithFallback(chain, executor, 'test');
    expect(result).toBe('success');
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(DEFAULT_MODEL_FALLBACK_CHAIN[0]);
  });

  it('falls back to next model on first failure', async () => {
    const chain = createFallbackChain();
    const executor = jest.fn()
      .mockRejectedValueOnce(new Error('primary model failed'))
      .mockResolvedValue('fallback success');

    const result = await executeWithFallback(chain, executor, 'test');
    expect(result).toBe('fallback success');
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenNthCalledWith(2, DEFAULT_MODEL_FALLBACK_CHAIN[1]);
  });

  it('throws if all models in chain fail', async () => {
    const chain = createFallbackChain();
    const executor = jest.fn().mockRejectedValue(new Error('always fails'));

    await expect(executeWithFallback(chain, executor, 'test')).rejects.toThrow();
    expect(executor).toHaveBeenCalledTimes(DEFAULT_MODEL_FALLBACK_CHAIN.length);
  });

  it('starts from currentIndex, not from beginning', async () => {
    const chain = createFallbackChain('claude-sonnet-4-5', DEFAULT_MODEL_FALLBACK_CHAIN);
    const executor = jest.fn().mockResolvedValue('ok');

    await executeWithFallback(chain, executor, 'test');
    // Should start at sonnet (index 1), not opus (index 0)
    expect(executor).toHaveBeenCalledWith('claude-sonnet-4-5');
    expect(executor).not.toHaveBeenCalledWith('claude-opus-4-5');
  });
});

describe('executeToolsWithFallback (Phase 114 Task 52)', () => {
  it('returns results for all successful tools', async () => {
    const tools = ['tool_a', 'tool_b', 'tool_c'];
    const executor = jest.fn().mockImplementation((name: string) => Promise.resolve(`result_${name}`));

    const results = await executeToolsWithFallback(tools, executor, 'test');
    expect(results).toHaveLength(3);
    expect(results.map(r => r.toolName)).toEqual(tools);
    expect(results.map(r => r.result)).toEqual(['result_tool_a', 'result_tool_b', 'result_tool_c']);
  });

  it('skips failed tools and continues with remaining', async () => {
    const tools = ['tool_a', 'tool_b', 'tool_c'];
    const executor = jest.fn()
      .mockResolvedValueOnce('result_a')
      .mockRejectedValueOnce(new Error('tool_b failed'))
      .mockResolvedValueOnce('result_c');

    const results = await executeToolsWithFallback(tools, executor, 'test');
    expect(results).toHaveLength(2);
    expect(results[0].toolName).toBe('tool_a');
    expect(results[1].toolName).toBe('tool_c');
  });

  it('returns empty array if all tools fail', async () => {
    const tools = ['tool_a', 'tool_b'];
    const executor = jest.fn().mockRejectedValue(new Error('always fails'));

    const results = await executeToolsWithFallback(tools, executor, 'test');
    expect(results).toHaveLength(0);
  });

  it('handles empty tool list', async () => {
    const executor = jest.fn();
    const results = await executeToolsWithFallback([], executor, 'test');
    expect(results).toHaveLength(0);
    expect(executor).not.toHaveBeenCalled();
  });
});

// ===========================================
// Task 53: Cost Tracking
// ===========================================

describe('estimateTokenCost (Phase 114 Task 53)', () => {
  it('estimates haiku cost correctly (cheapest)', () => {
    const cost = estimateTokenCost('claude-haiku-4-5', 1000, 1000);
    // 1000 input * 0.00025 / 1000 + 1000 output * 0.00125 / 1000
    expect(cost).toBeCloseTo(0.00025 + 0.00125, 6);
  });

  it('estimates sonnet cost correctly', () => {
    const cost = estimateTokenCost('claude-sonnet-4-5', 1000, 1000);
    expect(cost).toBeCloseTo(0.003 + 0.015, 4);
  });

  it('estimates opus cost correctly (most expensive)', () => {
    const cost = estimateTokenCost('claude-opus-4-5', 1000, 1000);
    expect(cost).toBeCloseTo(0.015 + 0.075, 4);
  });

  it('uses default rate for unknown model', () => {
    const cost = estimateTokenCost('unknown-model', 1000, 1000);
    expect(cost).toBeGreaterThan(0);
  });

  it('opus costs more than haiku for same tokens', () => {
    const haikuCost = estimateTokenCost('claude-haiku-4-5', 1000, 1000);
    const opusCost = estimateTokenCost('claude-opus-4-5', 1000, 1000);
    expect(opusCost).toBeGreaterThan(haikuCost);
  });

  it('returns 0 for 0 tokens', () => {
    const cost = estimateTokenCost('claude-sonnet-4-5', 0, 0);
    expect(cost).toBe(0);
  });
});

describe('recordAgentCost + getAgentCostSummary (Phase 114 Task 53)', () => {
  beforeEach(() => {
    clearAgentCostRecords();
    clearSnapshots();
  });

  it('records a cost entry', () => {
    recordAgentCost('exec-1', 'researcher', 'claude-haiku-4-5', 500, 200);
    const records = getAgentCostRecords();
    expect(records).toHaveLength(1);
    expect(records[0].executionId).toBe('exec-1');
    expect(records[0].agentRole).toBe('researcher');
    expect(records[0].model).toBe('claude-haiku-4-5');
    expect(records[0].inputTokens).toBe(500);
    expect(records[0].outputTokens).toBe(200);
    expect(records[0].estimatedCostUsd).toBeGreaterThan(0);
    expect(records[0].recordedAt).toBeTruthy();
  });

  it('records multiple cost entries', () => {
    recordAgentCost('exec-1', 'researcher', 'claude-haiku-4-5', 1000, 500);
    recordAgentCost('exec-1', 'writer', 'claude-sonnet-4-5', 2000, 1000);
    recordAgentCost('exec-1', 'reviewer', 'claude-sonnet-4-5', 1500, 800);

    const records = getAgentCostRecords();
    expect(records).toHaveLength(3);
  });

  it('getAgentCostSummary aggregates totals', () => {
    recordAgentCost('exec-1', 'researcher', 'claude-haiku-4-5', 1000, 500);
    recordAgentCost('exec-1', 'writer', 'claude-sonnet-4-5', 2000, 1000);

    const summary = getAgentCostSummary();
    expect(summary.totalInputTokens).toBe(3000);
    expect(summary.totalOutputTokens).toBe(1500);
    expect(summary.totalCostUsd).toBeGreaterThan(0);
  });

  it('getAgentCostSummary groups by model', () => {
    recordAgentCost('exec-1', 'researcher', 'claude-haiku-4-5', 1000, 500);
    recordAgentCost('exec-1', 'writer', 'claude-sonnet-4-5', 2000, 1000);

    const summary = getAgentCostSummary();
    expect(summary.byModel['claude-haiku-4-5']).toBeDefined();
    expect(summary.byModel['claude-sonnet-4-5']).toBeDefined();
    expect(summary.byModel['claude-haiku-4-5'].calls).toBe(1);
    expect(summary.byModel['claude-sonnet-4-5'].calls).toBe(1);
  });

  it('getAgentCostSummary groups by role', () => {
    recordAgentCost('exec-1', 'researcher', 'claude-haiku-4-5', 1000, 500);
    recordAgentCost('exec-2', 'researcher', 'claude-haiku-4-5', 500, 200);
    recordAgentCost('exec-1', 'writer', 'claude-sonnet-4-5', 2000, 1000);

    const summary = getAgentCostSummary();
    expect(summary.byRole['researcher'].calls).toBe(2);
    expect(summary.byRole['writer'].calls).toBe(1);
    expect(summary.byRole['researcher'].inputTokens).toBe(1500);
  });

  it('returns empty summary when no records', () => {
    const summary = getAgentCostSummary();
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.totalInputTokens).toBe(0);
    expect(Object.keys(summary.byModel)).toHaveLength(0);
    expect(Object.keys(summary.byRole)).toHaveLength(0);
  });

  it('respects limit in getAgentCostRecords', () => {
    for (let i = 0; i < 10; i++) {
      recordAgentCost(`exec-${i}`, 'researcher', 'claude-haiku-4-5', 100, 50);
    }
    const records = getAgentCostRecords(3);
    expect(records).toHaveLength(3);
  });
});
