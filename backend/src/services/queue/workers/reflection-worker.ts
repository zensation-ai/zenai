import { queryContext } from '../../../utils/database-context';
import { generateClaudeResponse } from '../../claude/core';
import { episodicMemory } from '../../memory/episodic-memory';
import { logger } from '../../../utils/logger';
import type { AIContext } from '../../../types';

interface BullJob {
  id?: string;
  data: Record<string, unknown>;
  log(message: string): void;
  updateProgress(progress: number | Record<string, unknown>): Promise<void>;
}

// Only the 4 real contexts — excludes 'demo' which has no persistent data.
const CONTEXTS: AIContext[] = ['operations', 'finance', 'people', 'strategy'];

interface WeeklyData {
  context: string;
  ideas: number;
  tasks: number;
  completedTasks: number;
  emails: number;
}

/**
 * Aggregate activity data for the past 7 days across all contexts.
 */
async function aggregateWeeklyData(): Promise<WeeklyData[]> {
  const results: WeeklyData[] = [];

  for (const ctx of CONTEXTS) {
    try {
      const fallback = () => ({ rows: [{ count: 0 }] });
      const [ideas, tasks, completedTasks, emails] = await Promise.all([
        queryContext(ctx, `SELECT COUNT(*) as count FROM ideas WHERE created_at >= NOW() - INTERVAL '7 days'`).catch(fallback),
        queryContext(ctx, `SELECT COUNT(*) as count FROM tasks WHERE created_at >= NOW() - INTERVAL '7 days'`).catch(fallback),
        queryContext(ctx, `SELECT COUNT(*) as count FROM tasks WHERE status = 'completed' AND updated_at >= NOW() - INTERVAL '7 days'`).catch(fallback),
        queryContext(ctx, `SELECT COUNT(*) as count FROM emails WHERE created_at >= NOW() - INTERVAL '7 days'`).catch(fallback),
      ]);

      results.push({
        context: ctx,
        ideas: parseInt(ideas.rows[0]?.count ?? '0', 10),
        tasks: parseInt(tasks.rows[0]?.count ?? '0', 10),
        completedTasks: parseInt(completedTasks.rows[0]?.count ?? '0', 10),
        emails: parseInt(emails.rows[0]?.count ?? '0', 10),
      });
    } catch (err) {
      logger.warn('Failed to aggregate weekly data', {
        operation: 'reflection-worker',
        context: ctx,
        error: err instanceof Error ? err.message : String(err),
      });
      results.push({ context: ctx, ideas: 0, tasks: 0, completedTasks: 0, emails: 0 });
    }
  }

  return results;
}

/**
 * Process the weekly reflection cron job.
 * Aggregates activity across all 4 contexts and generates an AI-powered summary.
 */
export async function processWeeklyReflection(job: BullJob): Promise<string> {
  try {
    job.log('Starting weekly reflection...');

    const weeklyData = await aggregateWeeklyData();
    await job.updateProgress(50);

    const dataSummary = weeklyData
      .map(d => `${d.context}: ${d.ideas} ideas, ${d.tasks} tasks (${d.completedTasks} completed), ${d.emails} emails`)
      .join('\n');

    const systemPrompt = `You are a thoughtful AI assistant creating a weekly reflection summary.
Analyze the user's activity across all contexts and provide insights on:
- Key accomplishments and progress
- Patterns in activity distribution
- Suggestions for the upcoming week
Keep it concise (3-5 paragraphs).`;

    const userPrompt = `Here is the weekly activity summary across all contexts:\n\n${dataSummary}\n\nPlease create a weekly reflection.`;

    const reflection = await generateClaudeResponse(systemPrompt, userPrompt, { maxTokens: 500 });

    // Store in 'operations' context — reflections aggregate all contexts but are
    // surfaced through the personal dashboard as weekly summaries.
    await episodicMemory.store(
      'weekly_reflection_cron',
      reflection,
      `weekly-reflection-${job.id}`,
      'operations'
    );

    job.log('Weekly reflection complete');
    await job.updateProgress(100);

    return reflection;
  } catch (err) {
    logger.error(
      'Weekly reflection failed',
      err instanceof Error ? err : new Error(String(err)),
      { operation: 'reflection-worker', jobId: job.id },
    );
    throw err;
  }
}
