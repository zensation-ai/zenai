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
import { Response } from 'express';
import { AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { getClaudeClient, CLAUDE_MODEL } from './claude/client';
import { sharedMemory, AgentRole } from './memory/shared-memory';
import { BaseAgent, AgentOutput } from './agents/base-agent';
import { createResearcher } from './agents/researcher';
import { createWriter } from './agents/writer';
import { createReviewer } from './agents/reviewer';
import { createCoder } from './agents/coder';

// ===========================================
// Types & Interfaces
// ===========================================

export type TeamStrategy =
  | 'research_write_review'
  | 'research_only'
  | 'write_only'
  | 'code_solve'
  | 'research_code_review'
  | 'custom';

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

/** SSE progress callback for streaming execution updates */
export type AgentProgressCallback = (event: AgentProgressEvent) => void;

export interface AgentProgressEvent {
  type: 'team_start' | 'agent_start' | 'agent_complete' | 'agent_error' | 'team_complete';
  teamId: string;
  strategy?: TeamStrategy;
  pipeline?: AgentRole[];
  agentRole?: AgentRole;
  agentIndex?: number;
  totalAgents?: number;
  subTask?: string;
  result?: Partial<AgentOutput>;
  finalOutput?: string;
  stats?: TeamResult['totalTokens'] & { executionTimeMs: number; memoryEntries: number };
}

/** Agent template definition */
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  strategy: TeamStrategy;
  pipeline?: AgentRole[];
  skipReview?: boolean;
  promptHint?: string;
}

/** Predefined agent templates */
export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'deep_research',
    name: 'Tiefenrecherche',
    description: 'Gründliche Recherche mit Fakten-Check und Quellenanalyse',
    icon: '🔬',
    strategy: 'research_write_review',
    promptHint: 'Recherchiere gründlich und prüfe alle Fakten',
  },
  {
    id: 'blog_article',
    name: 'Blog-Artikel',
    description: 'Recherchierter Blog-Artikel mit SEO-optimiertem Aufbau',
    icon: '📝',
    strategy: 'research_write_review',
    promptHint: 'Erstelle einen gut strukturierten Blog-Artikel',
  },
  {
    id: 'code_solution',
    name: 'Code-Lösung',
    description: 'Code generieren, testen und optimieren',
    icon: '💻',
    strategy: 'code_solve',
    promptHint: 'Implementiere eine funktionierende Code-Lösung',
  },
  {
    id: 'competitive_analysis',
    name: 'Wettbewerbsanalyse',
    description: 'Markt- und Wettbewerbsanalyse mit Empfehlungen',
    icon: '📊',
    strategy: 'research_write_review',
    promptHint: 'Analysiere den Wettbewerb und gib strategische Empfehlungen',
  },
  {
    id: 'email_draft',
    name: 'E-Mail verfassen',
    description: 'Professionelle E-Mail basierend auf Kontext',
    icon: '✉️',
    strategy: 'write_only',
    skipReview: false,
    promptHint: 'Verfasse eine professionelle E-Mail',
  },
  {
    id: 'code_review',
    name: 'Code-Review',
    description: 'Code analysieren, Bugs finden, Verbesserungen vorschlagen',
    icon: '🔍',
    strategy: 'research_code_review',
    promptHint: 'Analysiere den Code und schlage Verbesserungen vor',
  },
  {
    id: 'quick_summary',
    name: 'Schnelle Zusammenfassung',
    description: 'Schnelle Recherche und kompakte Zusammenfassung',
    icon: '⚡',
    strategy: 'research_only',
    promptHint: 'Fasse die wichtigsten Punkte zusammen',
  },
  {
    id: 'strategy_paper',
    name: 'Strategiepapier',
    description: 'Umfassende Analyse mit Strategieempfehlung',
    icon: '🎯',
    strategy: 'research_write_review',
    promptHint: 'Erstelle ein detailliertes Strategiepapier mit Handlungsempfehlungen',
  },
];

// ===========================================
// Task Classification
// ===========================================

/**
 * Determine the best strategy for a task based on its nature
 */
export function classifyTeamStrategy(task: string): TeamStrategy {
  const taskLower = task.toLowerCase();

  // Code-heavy patterns
  const codePatterns = [
    // eslint-disable-next-line security/detect-unsafe-regex -- bounded optional groups, no backtracking risk
    /schreib(?:e|t)? (?:mir )?(?:eine?n? |den |das )?code/,
    /implementier(e|en)/,
    /programmier(e|en)/,
    /code.*schreib/,
    /python.*(script|programm|code)/,
    /javascript.*funktion/,
    /typescript.*implementierung/,
    /erstelle? .*(shell|bash|python|node).*script/,
    /debug(ge|gen)?/,
    /fix(e|en)? .*bug/,
    /algorithmus/,
    /funktion.*erstell/,
  ];

  // Research + Code patterns
  const researchCodePatterns = [
    /analysiere.*code/,
    /code.*review/,
    /code.*prüf/,
    /überprüf.*implementierung/,
    /such.*fehler.*code/,
    /optimier.*code/,
  ];

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

  // Check research + code patterns first
  for (const pattern of researchCodePatterns) {
    if (pattern.test(taskLower)) {
      return 'research_code_review';
    }
  }

  // Check code-only patterns
  for (const pattern of codePatterns) {
    if (pattern.test(taskLower)) {
      return 'code_solve';
    }
  }

  // Check full pipeline (most complex)
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
    case 'code_solve':
      return skipReview ? ['coder'] : ['coder', 'reviewer'];
    case 'research_code_review':
      return ['researcher', 'coder', 'reviewer'];
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
    case 'coder':
      return createCoder();
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
        coder: `Implementiere und teste eine Code-Lösung für: ${task}`,
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

/** Maximum retries per agent on failure */
const MAX_AGENT_RETRIES = 1;

/**
 * Execute a complex task with a team of agents
 */
export async function executeTeamTask(
  task: TeamTask,
  onProgress?: AgentProgressCallback
): Promise<TeamResult> {
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

    // Emit team_start
    onProgress?.({
      type: 'team_start',
      teamId,
      strategy,
      pipeline,
    });

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
    for (let i = 0; i < subTasks.length; i++) {
      const subTask = subTasks[i];
      subTask.status = 'in_progress';

      // Emit agent_start
      onProgress?.({
        type: 'agent_start',
        teamId,
        agentRole: subTask.assignedAgent,
        agentIndex: i,
        totalAgents: subTasks.length,
        subTask: subTask.description,
      });

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

      // Execute with retry on failure
      let result: AgentOutput | null = null;
      let retries = 0;

      while (retries <= MAX_AGENT_RETRIES) {
        const agent = createAgent(subTask.assignedAgent);
        result = await agent.execute(agentInput);

        if (result.success) {
          break;
        }

        retries++;
        if (retries <= MAX_AGENT_RETRIES) {
          logger.info('Retrying failed agent', {
            teamId,
            agent: subTask.assignedAgent,
            attempt: retries + 1,
            error: result.error,
          });

          // Write retry info to shared memory
          sharedMemory.write(
            teamId,
            'orchestrator',
            'decision',
            `Retry für ${subTask.assignedAgent}: ${result.error}`,
            { retry: retries }
          );
        }
      }

      if (!result) {
        result = {
          role: subTask.assignedAgent,
          success: false,
          content: '',
          toolsUsed: [],
          tokensUsed: { input: 0, output: 0 },
          executionTimeMs: 0,
          error: 'Agent execution returned no result',
        };
      }

      agentResults.push(result);

      if (result.success) {
        subTask.status = 'completed';
        subTask.result = result;

        // Emit agent_complete
        onProgress?.({
          type: 'agent_complete',
          teamId,
          agentRole: subTask.assignedAgent,
          agentIndex: i,
          totalAgents: subTasks.length,
          result: {
            role: result.role,
            success: true,
            toolsUsed: result.toolsUsed,
            executionTimeMs: result.executionTimeMs,
          },
        });
      } else {
        subTask.status = 'failed';
        subTask.result = result;

        // Emit agent_error
        onProgress?.({
          type: 'agent_error',
          teamId,
          agentRole: subTask.assignedAgent,
          agentIndex: i,
          totalAgents: subTasks.length,
          result: {
            role: result.role,
            success: false,
            error: result.error,
            executionTimeMs: result.executionTimeMs,
          },
        });

        logger.warn('Sub-task failed after retries, continuing pipeline', {
          teamId,
          agent: subTask.assignedAgent,
          error: result.error,
          retries,
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

    const teamResult: TeamResult = {
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

    // Emit team_complete
    onProgress?.({
      type: 'team_complete',
      teamId,
      finalOutput,
      stats: {
        input: totalTokens.input,
        output: totalTokens.output,
        executionTimeMs: teamResult.executionTimeMs,
        memoryEntries: memoryStats.totalEntries,
      },
    });

    logger.info('Team task completed', {
      teamId,
      success: teamResult.success,
      agentCount: agentResults.length,
      totalTokens,
      executionTimeMs: teamResult.executionTimeMs,
    });

    // Emit system event for proactive engine
    import('./event-system').then(({ emitSystemEvent }) =>
      emitSystemEvent({
        context: task.aiContext,
        eventType: teamResult.success ? 'agent.completed' : 'agent.failed',
        eventSource: 'agent_orchestrator',
        payload: { teamId, strategy, executionTimeMs: teamResult.executionTimeMs, agentCount: agentResults.length },
      })
    ).catch(err => {
      logger.warn('Failed to emit agent event', { error: err instanceof Error ? err.message : String(err), teamId });
    });

    return teamResult;
  } finally {
    // Cleanup shared memory after execution
    sharedMemory.clear(teamId);
  }
}

/**
 * Execute a team task with SSE streaming progress
 */
export async function executeTeamTaskStreaming(
  task: TeamTask,
  res: Response
): Promise<void> {
  // Setup SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event: AgentProgressEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let closed = false;
  res.on('close', () => { closed = true; });

  try {
    const result = await executeTeamTask(task, (event) => {
      if (!closed) {
        sendEvent(event);
      }
    });

    // Send final result as JSON event
    if (!closed) {
      res.write(`data: ${JSON.stringify({
        type: 'result',
        teamId: result.teamId,
        success: result.success,
        finalOutput: result.finalOutput,
        strategy: result.strategy,
        agents: result.agentResults.map(a => ({
          role: a.role,
          success: a.success,
          toolsUsed: a.toolsUsed,
          executionTimeMs: a.executionTimeMs,
          error: a.error,
        })),
        stats: {
          executionTimeMs: result.executionTimeMs,
          totalTokens: result.totalTokens,
          sharedMemoryEntries: result.memoryStats.totalEntries,
        },
      })}\n\n`);

      res.write('data: [DONE]\n\n');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (!closed) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
      res.write('data: [DONE]\n\n');
    }
  } finally {
    if (!closed) {
      res.end();
    }
  }
}

/**
 * Aggregate results from all agents into a final output
 */
function aggregateResults(results: AgentOutput[], _pipeline: AgentRole[]): string {
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
