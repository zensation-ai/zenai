/**
 * Tests for Phase 130, Task 1: Tool Composition Engine
 *
 * TDD: Tests written before implementation.
 * Covers validateChain, getToolSignature, estimateChainCost,
 * buildChainFromGoal, and formatChainDescription.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  validateChain,
  getToolSignature,
  estimateChainCost,
  buildChainFromGoal,
  formatChainDescription,
  TOOL_SIGNATURES,
} from '../../../../services/agents/tool-composer';
import type { ChainStep, ToolChain } from '../../../../services/agents/tool-composer';

// ---------------------------------------------------------------------------
// TOOL_SIGNATURES
// ---------------------------------------------------------------------------

describe('TOOL_SIGNATURES', () => {
  it('contains web_search entry', () => {
    expect(TOOL_SIGNATURES['web_search']).toBeDefined();
    expect(TOOL_SIGNATURES['web_search'].outputType).toBe('search_results');
  });

  it('contains generate_business_report entry', () => {
    expect(TOOL_SIGNATURES['generate_business_report']).toBeDefined();
    expect(TOOL_SIGNATURES['generate_business_report'].costTier).toBe('expensive');
  });
});

// ---------------------------------------------------------------------------
// getToolSignature
// ---------------------------------------------------------------------------

describe('getToolSignature', () => {
  it('returns signature for known tool', () => {
    const sig = getToolSignature('web_search');
    expect(sig).not.toBeNull();
    expect(sig!.name).toBe('web_search');
    expect(sig!.sideEffects).toBe(false);
  });

  it('returns null for unknown tool', () => {
    const sig = getToolSignature('nonexistent_tool_xyz');
    expect(sig).toBeNull();
  });

  it('returns correct cost tier for expensive tool', () => {
    const sig = getToolSignature('execute_code');
    expect(sig!.costTier).toBe('expensive');
  });

  it('returns correct estimatedDurationMs', () => {
    const sig = getToolSignature('remember');
    expect(sig!.estimatedDurationMs).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// validateChain
// ---------------------------------------------------------------------------

describe('validateChain', () => {
  it('returns valid chain for a correct two-step sequence', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'AI trends' }, expectedOutput: 'search_results' },
      { toolName: 'fetch_url', inputMapping: { url: 'step_0.output' }, expectedOutput: 'text' },
    ];
    const chain = validateChain(steps);

    expect(chain.isValid).toBe(true);
    expect(chain.validationErrors).toHaveLength(0);
    expect(chain.steps).toHaveLength(2);
  });

  it('assigns a UUID id to the chain', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
    ];
    const chain = validateChain(steps);
    // UUID v4 pattern
    expect(chain.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('returns invalid chain when a tool name is unknown', () => {
    const steps: ChainStep[] = [
      { toolName: 'unknown_tool', inputMapping: {}, expectedOutput: 'text' },
    ];
    const chain = validateChain(steps);

    expect(chain.isValid).toBe(false);
    expect(chain.validationErrors.length).toBeGreaterThan(0);
    expect(chain.validationErrors[0]).toMatch(/unknown_tool/);
  });

  it('detects forward reference circular dependency', () => {
    // step_1 references step_2 which is a future step — invalid
    const steps: ChainStep[] = [
      {
        toolName: 'web_search',
        inputMapping: { query: 'step_2.output' }, // forward reference
        expectedOutput: 'search_results',
      },
      { toolName: 'fetch_url', inputMapping: { url: 'step_0.output' }, expectedOutput: 'text' },
      { toolName: 'analyze_document', inputMapping: { text: 'step_1.output' }, expectedOutput: 'analysis' },
    ];
    const chain = validateChain(steps);

    expect(chain.isValid).toBe(false);
    expect(chain.validationErrors.some((e) => /circular|forward/i.test(e))).toBe(true);
  });

  it('marks hasSideEffects true when any step has side effects', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
      { toolName: 'create_idea', inputMapping: { text: 'step_0.output' }, expectedOutput: 'idea' },
    ];
    const chain = validateChain(steps);

    expect(chain.hasSideEffects).toBe(true);
  });

  it('marks hasSideEffects false when no step has side effects', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
      { toolName: 'fetch_url', inputMapping: { url: 'step_0.output' }, expectedOutput: 'text' },
    ];
    const chain = validateChain(steps);

    expect(chain.hasSideEffects).toBe(false);
  });

  it('sums estimatedDuration from all steps', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' }, // 2000
      { toolName: 'fetch_url', inputMapping: { url: 'step_0.output' }, expectedOutput: 'text' },      // 3000
    ];
    const chain = validateChain(steps);

    expect(chain.estimatedDuration).toBe(5000);
  });

  it('handles empty steps array gracefully', () => {
    const chain = validateChain([]);
    expect(chain.isValid).toBe(false);
    expect(chain.validationErrors.length).toBeGreaterThan(0);
  });

  it('handles single step chain', () => {
    const steps: ChainStep[] = [
      { toolName: 'get_revenue_metrics', inputMapping: {}, expectedOutput: 'data' },
    ];
    const chain = validateChain(steps);

    expect(chain.isValid).toBe(true);
    expect(chain.estimatedDuration).toBe(2000);
  });

  it('collects multiple validation errors', () => {
    const steps: ChainStep[] = [
      { toolName: 'bad_tool_1', inputMapping: {}, expectedOutput: 'x' },
      { toolName: 'bad_tool_2', inputMapping: {}, expectedOutput: 'y' },
    ];
    const chain = validateChain(steps);

    expect(chain.isValid).toBe(false);
    expect(chain.validationErrors.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// estimateChainCost
// ---------------------------------------------------------------------------

describe('estimateChainCost', () => {
  it('returns duration equal to chain estimatedDuration', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
      { toolName: 'analyze_document', inputMapping: { text: 'step_0.output' }, expectedOutput: 'analysis' },
    ];
    const chain = validateChain(steps);
    const cost = estimateChainCost(chain);

    expect(cost.duration).toBe(chain.estimatedDuration);
  });

  it('returns "expensive" costTier when any step is expensive', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
      { toolName: 'analyze_document', inputMapping: { text: 'step_0.output' }, expectedOutput: 'analysis' },
    ];
    const chain = validateChain(steps);
    const cost = estimateChainCost(chain);

    expect(cost.costTier).toBe('expensive');
  });

  it('returns "cheap" costTier when steps are free and cheap but no expensive', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
      { toolName: 'draft_email', inputMapping: { text: 'step_0.output' }, expectedOutput: 'email_draft' },
    ];
    const chain = validateChain(steps);
    const cost = estimateChainCost(chain);

    expect(cost.costTier).toBe('cheap');
  });

  it('returns "free" costTier when all steps are free', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
      { toolName: 'search_ideas', inputMapping: { query: 'step_0.output' }, expectedOutput: 'search_results' },
    ];
    const chain = validateChain(steps);
    const cost = estimateChainCost(chain);

    expect(cost.costTier).toBe('free');
  });

  it('reflects hasSideEffects from chain', () => {
    const steps: ChainStep[] = [
      { toolName: 'remember', inputMapping: { text: 'hello' }, expectedOutput: 'confirmation' },
    ];
    const chain = validateChain(steps);
    const cost = estimateChainCost(chain);

    expect(cost.sideEffects).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildChainFromGoal
// ---------------------------------------------------------------------------

describe('buildChainFromGoal', () => {
  it('maps research+report goal to web_search → fetch_url → analyze_document', () => {
    const steps = buildChainFromGoal('recherchiere KI-Trends und schreibe einen Bericht');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0].toolName).toBe('web_search');
  });

  it('maps business report goal to revenue → report chain', () => {
    const steps = buildChainFromGoal('erstelle einen Geschäftsbericht');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.some((s) => s.toolName === 'get_revenue_metrics')).toBe(true);
    expect(steps.some((s) => s.toolName === 'generate_business_report')).toBe(true);
  });

  it('maps "suche und merke dir" to search_ideas → remember', () => {
    const steps = buildChainFromGoal('suche und merke dir wichtige Ideen');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.some((s) => s.toolName === 'search_ideas')).toBe(true);
    expect(steps.some((s) => s.toolName === 'remember')).toBe(true);
  });

  it('returns empty array for unrecognized goal', () => {
    const steps = buildChainFromGoal('xyzzy frobnicator widget');
    expect(steps).toHaveLength(0);
  });

  it('respects availableTools filter — excludes tools not in list', () => {
    const steps = buildChainFromGoal('recherchiere und erstelle Bericht', ['web_search', 'analyze_document']);
    const toolNames = steps.map((s) => s.toolName);
    // fetch_url should be excluded since it's not in availableTools
    expect(toolNames).not.toContain('fetch_url');
  });

  it('returns empty when no available tools match the goal pattern', () => {
    const steps = buildChainFromGoal('erstelle einen Geschäftsbericht', ['web_search']);
    // get_revenue_metrics and generate_business_report are not available
    expect(steps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// formatChainDescription
// ---------------------------------------------------------------------------

describe('formatChainDescription', () => {
  it('includes the number of steps', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
      { toolName: 'fetch_url', inputMapping: { url: 'step_0.output' }, expectedOutput: 'text' },
    ];
    const chain = validateChain(steps);
    const desc = formatChainDescription(chain);

    expect(desc).toMatch(/2/);
  });

  it('mentions tool names in description', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
      { toolName: 'fetch_url', inputMapping: { url: 'step_0.output' }, expectedOutput: 'text' },
    ];
    const chain = validateChain(steps);
    const desc = formatChainDescription(chain);

    expect(desc).toContain('web_search');
    expect(desc).toContain('fetch_url');
  });

  it('returns a non-empty string for a valid chain', () => {
    const steps: ChainStep[] = [
      { toolName: 'get_revenue_metrics', inputMapping: {}, expectedOutput: 'data' },
    ];
    const chain = validateChain(steps);
    const desc = formatChainDescription(chain);

    expect(typeof desc).toBe('string');
    expect(desc.length).toBeGreaterThan(0);
  });

  it('indicates estimated duration in description', () => {
    const steps: ChainStep[] = [
      { toolName: 'web_search', inputMapping: { query: 'test' }, expectedOutput: 'search_results' },
    ];
    const chain = validateChain(steps);
    const desc = formatChainDescription(chain);

    // Should mention duration somewhere (seconds or ms)
    expect(desc).toMatch(/\d/);
  });
});
