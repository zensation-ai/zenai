/**
 * Agent Orchestrator (Multi-Agent System)
 *
 * Coordinates teams of specialized agents to solve complex tasks.
 * LangGraph-inspired architecture with:
 * - Task decomposition into sub-tasks
 * - Intelligent agent selection per sub-task
 * - Pipeline execution with shared memory
 * - Result aggregation and quality review
 *
 * Agent Roles:
 * - Researcher: Information gathering (Haiku - fast)
 * - Writer: Content creation (Sonnet - balanced)
 * - Reviewer: Quality assurance (Sonnet - analytical)
 *
 * @module services/agent-orchestrator
 */

import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { getClaudeClient, CLAUDE_MODEL } from './claude/client';
import { sharedMemory, AgentRole } from './memory/shared-memory';
import { BaseAgent, AgentOutput } from './agents/base-agent';
import { createResearcher } from './agents/researcher';
import { createWriter } from './agents/writer';
import { createReviewer } from './agents/reviewer';

// ===========================================
// Types & Interfaces
// ===========================================

export type TeamStrategy = 'research_write_review' | 'research_only' | 'write_only' | 'custom';

export interface TeamTask {
  /** Description of the complex task */
  description: string;
  /** Additional context for all agents */
  context?: string;
  /** AI context (personal/work) */
  aiContext: AIContext;
  /** Execution strategy */
  strategy?: TeamStrategy;
  /** Custom agent pipeline (for 'custom' strategy) */
  customPipeline?: AgentRole[];
  /** Whether to include review step */
  skipReview?: boolean;
}

export interface SubTask {
  id: string;
  description: string;
  assignedAgent: AgentRole;
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: AgentOutput;
}

export interface TeamResult {
  /** Unique team execution ID */
  teamId: string;
  /** Whether the team task succeeded */
  success: boolean;
  /** Final aggregated output */
  finalOutput: string;
  /** Results from each agent */
  agentResults: AgentOutput[];
  /** Total execution time */
  executionTimeMs: number;
  /** Strategy used */
  strategy: TeamStrategy;
  /** Total tokens consumed across all agents */
  totalTokens: { input: number; output: number };
  /** Shared memory stats */
  memoryStats: { totalEntries: number; byAgent: Record<string, number> };
}

// ===========================================
// Task Classification
// ===========================================

/**
 * Determine the best strategy for a task based on its nature
 */
export function classifyTeamStrategy(task: string): TeamStrategy {
  const taskLower = task.toLowerCase();

  // Research-heavy patterns
  const researchPatterns = [
    /recherchiere/,
    /finde (heraus|informationen)/,
    /was (weiß ich|habe ich) (über|zu|zum)/,
    /suche nach/,
    /sammle (informationen|daten|fakten)/,
  ];

  // Write-heavy patterns
  const writePatterns = [
    /schreibe? (mir |eine[mnrs]? )/,
    /erstelle? (mir |eine[mnrs]? )/,
    /formuliere/,
    /verfasse/,
    /entwirf/,
  ];

  // Full pipeline patterns (research + write + review)
  const fullPipelinePatterns = [
    /analysiere.*und.*(erstelle|schreibe|fasse)/,
    /recherchiere.*und.*(erstelle|schreibe|verfasse)/,
    /(strategie|konzept|plan|bericht|report)/,
    /vergleiche.*und.*bewerte/,
    /gib.*überblick.*und.*empf/,
    /zusammenfass.*und.*empfehl/,
  ];

  // Check full pipeline first (most complex)
  for (const pattern of fullPipelinePatterns) {
    if (pattern.test(taskLower)) {
      return 'research_write_review';
    }
  }

  // Check research-only
  for (const pattern of researchPatterns) {
    if (pattern.test(taskLower)) {
      return 'research_only';
    }
  }

  // Check write-only
  for (const pattern of writePatterns) {
    if (pattern.test(taskLower)) {
      return 'write_only';
    }
  }

  // Default: full pipeline for complex tasks
  if (taskLower.length > 100) {
    return 'research_write_review';
  }

  return 'research_write_review';
}

/**
 * Get the agent pipeline for a strategy
 */
export function getAgentPipeline(strategy: TeamStrategy, skipReview?: boolean): AgentRole[] {
  switch (strategy) {
    case 'research_only':
      return ['researcher'];
    case 'write_only':
      return skipReview ? ['writer'] : ['writer', 'reviewer'];
    case 'research_write_review':
      return skipReview ? ['researcher', 'writer'] : ['researcher', 'writer', 'reviewer'];
    case 'custom':
      return []; // Will be provided by customPipeline
  }
}

// ===========================================
// Agent Factory
// ===========================================

function createAgent(role: AgentRole): BaseAgent {
  switch (role) {
    case 'researcher':
      return createResearcher();
    case 'writer':
      return createWriter();
    case 'reviewer':
      return createReviewer();
    default:
      throw new Error(`Unknown agent role: ${role}`);
  }
}

// ===========================================
// Task Decomposition
// ===========================================

/**
 * Decompose a complex task into sub-tasks for each agent
 */
async function decomposeTask(
  task: string,
  pipeline: AgentRole[],
  context?: string
): Promise<SubTask[]> {
  const client = getClaudeClient();

  const agentDescriptions: Record<AgentRole, string> = {
    researcher: 'Recherche-Agent: Sucht und sammelt Informationen aus der Wissensbasis, Dokumenten und dem Web',
    writer: 'Schreib-Agent: Erstellt strukturierte Texte, Berichte, E-Mails basierend auf Recherche-Ergebnissen',
    reviewer: 'Review-Agent: Überprüft Qualität, Vollständigkeit und Korrektheit der Ergebnisse',
    coder: 'Code-Agent: Generiert und validiert Code-Lösungen',
    orchestrator: 'Orchestrator: Koordiniert das Team',
  };

  const pipelineDesc = pipeline
    .map((role, i) => `${i + 1}. ${agentDescriptions[role]}`)
    .join('\n');

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    temperature: 0.3,
    system: `Du bist ein Task-Planer. Zerlege die Aufgabe in konkrete Teilaufgaben für das Agent-Team.
Antworte NUR mit einem JSON-Array. Jedes Element hat: {"agent": "rolle", "task": "konkrete Teilaufgabe"}

Agent-Pipeline:
${pipelineDesc}

REGELN:
- Jeder Agent in der Pipeline bekommt genau EINE Teilaufgabe
- Die Teilaufgaben bauen aufeinander auf (Pipeline)
- Formuliere jede Teilaufgabe als klare Anweisung
- Der Writer erhält die Ergebnisse des Researchers automatisch über Shared Memory
- Der Reviewer erhält den Output des Writers automatisch`,
    messages: [{
      role: 'user',
      content: context ? `${task}\n\nKontext: ${context}` : task,
    }],
  });

  // Parse the decomposition
  const textContent = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const subTasks: SubTask[] = [];
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = textContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ agent: string; task: string }>;
      let prevId: string | null = null;

      for (const item of parsed) {
        const role = item.agent as AgentRole;
        if (!pipeline.includes(role)) {continue;}

        const id = uuidv4();
        subTasks.push({
          id,
          description: item.task,
          assignedAgent: role,
          dependencies: prevId ? [prevId] : [],
          status: 'pending',
        });
        prevId = id;
      }
    }
  } catch {
    logger.warn('Failed to parse task decomposition, using default', { textContent: textContent.substring(0, 200) });
  }

  // Fallback: create default sub-tasks if parsing failed
  if (subTasks.length === 0) {
    let prevId: string | null = null;
    for (const role of pipeline) {
      const id = uuidv4();
      const defaultTasks: Record<AgentRole, string> = {
        researcher: `Recherchiere zum Thema: ${task}`,
        writer: `Erstelle einen strukturierten Text basierend auf den Recherche-Ergebnissen zum Thema: ${task}`,
        reviewer: `Überprüfe und verbessere den erstellten Text zum Thema: ${task}`,
        coder: `Implementiere eine Lösung für: ${task}`,
        orchestrator: task,
      };
      subTasks.push({
        id,
        description: defaultTasks[role],
        assignedAgent: role,
        dependencies: prevId ? [prevId] : [],
        status: 'pending',
      });
      prevId = id;
    }
  }

  return subTasks;
}

// ===========================================
// Agent Orchestrator
// ===========================================

/**
 * Execute a complex task with a team of agents
 */
export async function executeTeamTask(task: TeamTask): Promise<TeamResult> {
  const startTime = Date.now();
  const teamId = uuidv4();
  const agentResults: AgentOutput[] = [];

  logger.info('Starting team task execution', {
    teamId,
    taskLength: task.description.length,
    strategy: task.strategy,
  });

  try {
    // Initialize shared memory
    sharedMemory.initialize(teamId);

    // Determine strategy
    const strategy = task.strategy || classifyTeamStrategy(task.description);

    // Get pipeline
    const pipeline = strategy === 'custom' && task.customPipeline
      ? task.customPipeline
      : getAgentPipeline(strategy, task.skipReview);

    if (pipeline.length === 0) {
      throw new Error('Empty agent pipeline');
    }

    // Write plan to shared memory
    sharedMemory.write(
      teamId,
      'orchestrator',
      'plan',
      `Aufgabe: ${task.description}\nStrategie: ${strategy}\nPipeline: ${pipeline.join(' → ')}`,
    );

    // Decompose task
    const subTasks = await decomposeTask(task.description, pipeline, task.context);

    logger.info('Task decomposed', {
      teamId,
      subTaskCount: subTasks.length,
      pipeline: pipeline.join(' → '),
    });

    // Execute pipeline sequentially (respecting dependencies)
    for (const subTask of subTasks) {
      subTask.status = 'in_progress';

      const agent = createAgent(subTask.assignedAgent);

      // Build context from previous results
      const previousResults = agentResults
        .filter(r => r.success)
        .map(r => `[${r.role}]: ${r.content}`)
        .join('\n\n---\n\n');

      const agentInput = {
        task: subTask.description,
        context: previousResults || task.context,
        aiContext: task.aiContext,
        teamId,
      };

      const result = await agent.execute(agentInput);
      agentResults.push(result);

      if (result.success) {
        subTask.status = 'completed';
        subTask.result = result;
      } else {
        subTask.status = 'failed';
        subTask.result = result;
        logger.warn('Sub-task failed, continuing pipeline', {
          teamId,
          agent: subTask.assignedAgent,
          error: result.error,
        });
      }
    }

    // Aggregate final output
    const finalOutput = aggregateResults(agentResults, pipeline);

    // Get memory stats
    const memoryStats = sharedMemory.getStats(teamId);

    // Calculate total tokens
    const totalTokens = agentResults.reduce(
      (acc, r) => ({
        input: acc.input + r.tokensUsed.input,
        output: acc.output + r.tokensUsed.output,
      }),
      { input: 0, output: 0 }
    );

    const result: TeamResult = {
      teamId,
      success: agentResults.some(r => r.success),
      finalOutput,
      agentResults,
      executionTimeMs: Date.now() - startTime,
      strategy,
      totalTokens,
      memoryStats: {
        totalEntries: memoryStats.totalEntries,
        byAgent: memoryStats.byAgent,
      },
    };

    logger.info('Team task completed', {
      teamId,
      success: result.success,
      agentCount: agentResults.length,
      totalTokens,
      executionTimeMs: result.executionTimeMs,
    });

    return result;
  } finally {
    // Cleanup shared memory after execution
    sharedMemory.clear(teamId);
  }
}

/**
 * Aggregate results from all agents into a final output
 */
function aggregateResults(results: AgentOutput[], pipeline: AgentRole[]): string {
  // If there's a reviewer result, use that (it's the refined version)
  const reviewerResult = results.find(r => r.role === 'reviewer' && r.success);
  if (reviewerResult) {
    return reviewerResult.content;
  }

  // If there's a writer result, use that
  const writerResult = results.find(r => r.role === 'writer' && r.success);
  if (writerResult) {
    return writerResult.content;
  }

  // Fall back to the last successful result
  const lastSuccess = [...results].reverse().find(r => r.success);
  if (lastSuccess) {
    return lastSuccess.content;
  }

  // If nothing succeeded, compile error report
  return results
    .map(r => `[${r.role}]: ${r.error || 'Keine Ausgabe'}`)
    .join('\n');
}

// ===========================================
// Quick Execution Helpers
// ===========================================

/**
 * Quick research task (researcher only)
 */
export async function quickResearch(
  query: string,
  aiContext: AIContext = 'personal'
): Promise<TeamResult> {
  return executeTeamTask({
    description: query,
    aiContext,
    strategy: 'research_only',
  });
}

/**
 * Research and write (no review)
 */
export async function researchAndWrite(
  task: string,
  aiContext: AIContext = 'personal',
  context?: string
): Promise<TeamResult> {
  return executeTeamTask({
    description: task,
    aiContext,
    strategy: 'research_write_review',
    skipReview: true,
    context,
  });
}

/**
 * Full pipeline (research → write → review)
 */
export async function fullTeamExecution(
  task: string,
  aiContext: AIContext = 'personal',
  context?: string
): Promise<TeamResult> {
  return executeTeamTask({
    description: task,
    aiContext,
    strategy: 'research_write_review',
    context,
  });
}
