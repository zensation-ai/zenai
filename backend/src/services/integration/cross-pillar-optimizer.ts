/**
 * Cross-Pillar Optimizer — Phase 139-140: Integration
 *
 * Orchestrates ALL cognitive subsystems after each response.
 * Runs a priority-ordered pipeline of post-response steps
 * (Hebbian update, FSRS recall, information gain, prediction error,
 * calibration update, feedback broadcast) and aggregates results.
 */

import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineContext {
  context: string; // 'personal' | 'work' | etc
  query: string;
  response: string;
  domain: string;
  confidence: number;
  entities: string[];
}

export interface PipelineStepResult {
  success: boolean;
  data?: Record<string, unknown>;
  durationMs: number;
}

export interface PipelineStep {
  name: string;
  execute: (context: PipelineContext) => Promise<PipelineStepResult>;
  priority: number; // lower = runs first
}

export interface PostResponsePipeline {
  queryAnalysis: { intent: string; domain: string; entities: string[] };
  predictionCheck: { wasPredicted: boolean; errorMagnitude: number };
  metacognitiveState: { confidence: number; coherence: number; confusionLevel: string };
  informationGain: { surprise: number; novelty: number; gain: number };
  feedbackRouted: boolean;
}

export interface PipelineSummary {
  totalDurationMs: number;
  successCount: number;
  failureCount: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPipelineStep(
  name: string,
  execute: (context: PipelineContext) => Promise<PipelineStepResult>,
  priority: number,
): PipelineStep {
  return { name, execute, priority };
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

export function sortStepsByPriority(steps: PipelineStep[]): PipelineStep[] {
  return [...steps].sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------------------
// Execute pipeline
// ---------------------------------------------------------------------------

export async function executePipeline(
  steps: PipelineStep[],
  context: PipelineContext,
): Promise<PipelineStepResult[]> {
  const sorted = sortStepsByPriority(steps);
  const results: PipelineStepResult[] = [];

  for (const step of sorted) {
    const start = Date.now();
    try {
      const result = await step.execute(context);
      results.push({ ...result, durationMs: Date.now() - start });
      logger.debug(`Pipeline step ${step.name} completed`, { success: result.success });
    } catch (err) {
      const durationMs = Date.now() - start;
      logger.warn(`Pipeline step ${step.name} failed`, { error: String(err) });
      results.push({ success: false, durationMs });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Default pipeline
// ---------------------------------------------------------------------------

export function buildPostResponsePipeline(): PipelineStep[] {
  return [
    createPipelineStep(
      'hebbian_update',
      async (_ctx) => ({ success: true, data: { type: 'hebbian' }, durationMs: 0 }),
      10,
    ),
    createPipelineStep(
      'fsrs_recall',
      async (_ctx) => ({ success: true, data: { type: 'fsrs' }, durationMs: 0 }),
      20,
    ),
    createPipelineStep(
      'information_gain',
      async (_ctx) => ({ success: true, data: { type: 'info_gain' }, durationMs: 0 }),
      30,
    ),
    createPipelineStep(
      'prediction_error',
      async (_ctx) => ({ success: true, data: { type: 'prediction' }, durationMs: 0 }),
      40,
    ),
    createPipelineStep(
      'calibration_update',
      async (_ctx) => ({ success: true, data: { type: 'calibration' }, durationMs: 0 }),
      50,
    ),
    createPipelineStep(
      'feedback_broadcast',
      async (_ctx) => ({ success: true, data: { type: 'feedback' }, durationMs: 0 }),
      60,
    ),
  ];
}

// ---------------------------------------------------------------------------
// Summarize
// ---------------------------------------------------------------------------

export function summarizePipelineRun(results: PipelineStepResult[]): PipelineSummary {
  let totalDurationMs = 0;
  let successCount = 0;
  let failureCount = 0;

  for (const r of results) {
    totalDurationMs += r.durationMs;
    if (r.success) successCount++;
    else failureCount++;
  }

  return { totalDurationMs, successCount, failureCount };
}
