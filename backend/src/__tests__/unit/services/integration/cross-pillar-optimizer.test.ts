/**
 * Tests for Phase 139-140: Cross-Pillar Optimizer
 *
 * TDD: Tests for createPipelineStep, sortStepsByPriority,
 * executePipeline, buildPostResponsePipeline, summarizePipelineRun.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  createPipelineStep,
  sortStepsByPriority,
  executePipeline,
  buildPostResponsePipeline,
  summarizePipelineRun,
} from '../../../../services/integration/cross-pillar-optimizer';
import type {
  PipelineStep,
  PipelineContext,
  PipelineStepResult,
} from '../../../../services/integration/cross-pillar-optimizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    context: 'personal',
    query: 'test query',
    response: 'test response',
    domain: 'general',
    confidence: 0.8,
    entities: ['entity1'],
    ...overrides,
  };
}

function successStep(name: string, priority: number, data?: Record<string, unknown>): PipelineStep {
  return createPipelineStep(
    name,
    async () => ({ success: true, data, durationMs: 0 }),
    priority,
  );
}

function failingStep(name: string, priority: number): PipelineStep {
  return createPipelineStep(
    name,
    async () => {
      throw new Error(`${name} exploded`);
    },
    priority,
  );
}

// ===========================================================================
// createPipelineStep
// ===========================================================================

describe('createPipelineStep', () => {
  it('returns a step with the given name', () => {
    const step = createPipelineStep('foo', async () => ({ success: true, durationMs: 0 }), 5);
    expect(step.name).toBe('foo');
  });

  it('returns a step with the given priority', () => {
    const step = createPipelineStep('bar', async () => ({ success: true, durationMs: 0 }), 42);
    expect(step.priority).toBe(42);
  });

  it('returns a step whose execute is callable', async () => {
    const step = createPipelineStep(
      'baz',
      async () => ({ success: true, data: { x: 1 }, durationMs: 0 }),
      1,
    );
    const result = await step.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ x: 1 });
  });

  it('preserves all three fields', () => {
    const exec = async () => ({ success: false as const, durationMs: 0 });
    const step = createPipelineStep('name', exec, 99);
    expect(step).toEqual({ name: 'name', execute: exec, priority: 99 });
  });
});

// ===========================================================================
// sortStepsByPriority
// ===========================================================================

describe('sortStepsByPriority', () => {
  it('sorts ascending by priority', () => {
    const steps = [
      successStep('c', 30),
      successStep('a', 10),
      successStep('b', 20),
    ];
    const sorted = sortStepsByPriority(steps);
    expect(sorted.map((s) => s.name)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the original array', () => {
    const steps = [successStep('b', 20), successStep('a', 10)];
    const sorted = sortStepsByPriority(steps);
    expect(steps[0].name).toBe('b'); // original unchanged
    expect(sorted[0].name).toBe('a');
  });

  it('handles empty array', () => {
    expect(sortStepsByPriority([])).toEqual([]);
  });

  it('handles single element', () => {
    const steps = [successStep('only', 5)];
    const sorted = sortStepsByPriority(steps);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].name).toBe('only');
  });

  it('handles equal priorities (stable relative order)', () => {
    const steps = [
      successStep('x', 10),
      successStep('y', 10),
      successStep('z', 10),
    ];
    const sorted = sortStepsByPriority(steps);
    expect(sorted).toHaveLength(3);
    // All have same priority — just ensure no crash
    expect(sorted.map((s) => s.priority)).toEqual([10, 10, 10]);
  });
});

// ===========================================================================
// executePipeline
// ===========================================================================

describe('executePipeline', () => {
  it('returns results for all successful steps', async () => {
    const steps = [successStep('a', 10), successStep('b', 20)];
    const results = await executePipeline(steps, makeContext());
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('catches errors per step — other steps still run', async () => {
    const steps = [
      successStep('a', 10),
      failingStep('b', 20),
      successStep('c', 30),
    ];
    const results = await executePipeline(steps, makeContext());
    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
  });

  it('runs steps in priority order', async () => {
    const order: string[] = [];
    const tracked = (name: string, priority: number): PipelineStep =>
      createPipelineStep(
        name,
        async () => {
          order.push(name);
          return { success: true, durationMs: 0 };
        },
        priority,
      );

    const steps = [tracked('third', 30), tracked('first', 10), tracked('second', 20)];
    await executePipeline(steps, makeContext());
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('measures duration (non-negative)', async () => {
    const steps = [
      createPipelineStep(
        'slow',
        async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { success: true, durationMs: 0 };
        },
        1,
      ),
    ];
    const results = await executePipeline(steps, makeContext());
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns empty array for no steps', async () => {
    const results = await executePipeline([], makeContext());
    expect(results).toEqual([]);
  });

  it('propagates step data in results', async () => {
    const steps = [successStep('a', 1, { key: 'value' })];
    const results = await executePipeline(steps, makeContext());
    expect(results[0].data).toEqual({ key: 'value' });
  });

  it('failed step result has no data', async () => {
    const steps = [failingStep('x', 1)];
    const results = await executePipeline(steps, makeContext());
    expect(results[0].data).toBeUndefined();
  });

  it('passes context to each step execute', async () => {
    let receivedCtx: PipelineContext | null = null;
    const step = createPipelineStep(
      'capture',
      async (ctx) => {
        receivedCtx = ctx;
        return { success: true, durationMs: 0 };
      },
      1,
    );
    const ctx = makeContext({ domain: 'finance' });
    await executePipeline([step], ctx);
    expect(receivedCtx).not.toBeNull();
    expect(receivedCtx!.domain).toBe('finance');
  });
});

// ===========================================================================
// buildPostResponsePipeline
// ===========================================================================

describe('buildPostResponsePipeline', () => {
  it('returns exactly 6 steps', () => {
    const steps = buildPostResponsePipeline();
    expect(steps).toHaveLength(6);
  });

  it('contains hebbian_update', () => {
    const steps = buildPostResponsePipeline();
    expect(steps.find((s) => s.name === 'hebbian_update')).toBeDefined();
  });

  it('contains fsrs_recall', () => {
    const steps = buildPostResponsePipeline();
    expect(steps.find((s) => s.name === 'fsrs_recall')).toBeDefined();
  });

  it('contains information_gain', () => {
    const steps = buildPostResponsePipeline();
    expect(steps.find((s) => s.name === 'information_gain')).toBeDefined();
  });

  it('contains prediction_error', () => {
    const steps = buildPostResponsePipeline();
    expect(steps.find((s) => s.name === 'prediction_error')).toBeDefined();
  });

  it('contains calibration_update', () => {
    const steps = buildPostResponsePipeline();
    expect(steps.find((s) => s.name === 'calibration_update')).toBeDefined();
  });

  it('contains feedback_broadcast', () => {
    const steps = buildPostResponsePipeline();
    expect(steps.find((s) => s.name === 'feedback_broadcast')).toBeDefined();
  });

  it('has ascending priorities (10, 20, 30, 40, 50, 60)', () => {
    const steps = buildPostResponsePipeline();
    const sorted = sortStepsByPriority(steps);
    expect(sorted.map((s) => s.priority)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('all steps are executable and succeed', async () => {
    const steps = buildPostResponsePipeline();
    const results = await executePipeline(steps, makeContext());
    expect(results.every((r) => r.success)).toBe(true);
  });
});

// ===========================================================================
// summarizePipelineRun
// ===========================================================================

describe('summarizePipelineRun', () => {
  it('sums durations', () => {
    const results: PipelineStepResult[] = [
      { success: true, durationMs: 10 },
      { success: true, durationMs: 20 },
    ];
    expect(summarizePipelineRun(results).totalDurationMs).toBe(30);
  });

  it('counts successes', () => {
    const results: PipelineStepResult[] = [
      { success: true, durationMs: 0 },
      { success: true, durationMs: 0 },
      { success: false, durationMs: 0 },
    ];
    expect(summarizePipelineRun(results).successCount).toBe(2);
  });

  it('counts failures', () => {
    const results: PipelineStepResult[] = [
      { success: false, durationMs: 0 },
      { success: false, durationMs: 0 },
    ];
    expect(summarizePipelineRun(results).failureCount).toBe(2);
  });

  it('handles empty results', () => {
    const summary = summarizePipelineRun([]);
    expect(summary).toEqual({ totalDurationMs: 0, successCount: 0, failureCount: 0 });
  });

  it('returns all three fields', () => {
    const results: PipelineStepResult[] = [
      { success: true, durationMs: 5 },
      { success: false, durationMs: 3 },
    ];
    const summary = summarizePipelineRun(results);
    expect(summary).toEqual({ totalDurationMs: 8, successCount: 1, failureCount: 1 });
  });
});
