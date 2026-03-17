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
import { AgentGraph, WorkflowState } from './agents/agent-graph';

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
const MAX_AGENT_RETRIES = 2;

/** Options for executeTeamTask */
export interface ExecuteTeamTaskOptions {
  /** When true, use AgentGraph execution engine instead of sequential pipeline */
  useGraph?: boolean;
}

/**
 * Execute a complex task with a team of agents
 */
export async function executeTeamTask(
  task: TeamTask,
  onProgress?: AgentProgressCallback,
  options?: ExecuteTeamTaskOptions
): Promise<TeamResult> {
  // Delegate to graph-based execution if requested
  if (options?.useGraph) {
    return executeWithGraph(task, onProgress);
  }
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

      // Execute with retry on failure (exponential backoff)
      let result: AgentOutput | null = null;
      let retries = 0;

      while (retries <= MAX_AGENT_RETRIES) {
        const agent = createAgent(subTask.assignedAgent);

        // On retry, include previous error in context so agent can adapt
        if (retries > 0 && result?.error) {
          agentInput.context = `${agentInput.context || ''}\n\n[PREVIOUS ATTEMPT FAILED]: ${result.error}\nPlease try a different approach.`.trim();
        }

        result = await agent.execute(agentInput);

        if (result.success) {
          break;
        }

        retries++;
        if (retries <= MAX_AGENT_RETRIES) {
          // Exponential backoff: 2s, 4s (base 2)
          const backoffMs = Math.pow(2, retries) * 1000;
          logger.info('Retrying failed agent with backoff', {
            teamId,
            agent: subTask.assignedAgent,
            attempt: retries + 1,
            backoffMs,
            error: result.error,
          });

          await new Promise(resolve => setTimeout(resolve, backoffMs));

          // Write retry info to shared memory
          sharedMemory.write(
            teamId,
            'orchestrator',
            'decision',
            `Retry für ${subTask.assignedAgent}: ${result.error}`,
            { retry: retries, backoffMs }
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

// ===========================================
// Graph-Based Execution
// ===========================================

/**
 * Build an AgentGraph dynamically from a TeamStrategy
 */
function buildGraphForStrategy(strategy: TeamStrategy, skipReview?: boolean): AgentGraph {
  switch (strategy) {
    case 'research_only': {
      return new AgentGraph('research-only')
        .addNode({ id: 'researcher', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
        .setStart('researcher');
    }

    case 'write_only': {
      const graph = new AgentGraph('write-only')
        .addNode({ id: 'writer', type: 'agent', config: { agentRole: 'writer', label: 'Write' } });
      if (!skipReview) {
        graph
          .addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } })
          .addEdge({ from: 'writer', to: 'reviewer' });
      }
      return graph.setStart('writer');
    }

    case 'research_write_review': {
      const graph = new AgentGraph('research-write-review')
        .addNode({ id: 'researcher', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
        .addNode({ id: 'writer', type: 'agent', config: { agentRole: 'writer', label: 'Write' } })
        .addEdge({ from: 'researcher', to: 'writer' });
      if (!skipReview) {
        graph
          .addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } })
          .addEdge({ from: 'writer', to: 'reviewer' });
      }
      return graph.setStart('researcher');
    }

    case 'code_solve': {
      const graph = new AgentGraph('code-solve')
        .addNode({ id: 'coder', type: 'agent', config: { agentRole: 'coder', label: 'Code' } });
      if (!skipReview) {
        graph
          .addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } })
          .addEdge({ from: 'coder', to: 'reviewer' });
      }
      return graph.setStart('coder');
    }

    case 'research_code_review': {
      return new AgentGraph('research-code-review')
        .addNode({ id: 'researcher', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
        .addNode({ id: 'coder', type: 'agent', config: { agentRole: 'coder', label: 'Code' } })
        .addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } })
        .addEdge({ from: 'researcher', to: 'coder' })
        .addEdge({ from: 'coder', to: 'reviewer' })
        .setStart('researcher');
    }

    case 'custom': {
      // Custom strategy cannot be auto-mapped to a graph; fall back to empty graph
      return new AgentGraph('custom');
    }
  }
}

/**
 * Execute a team task using the AgentGraph execution engine.
 * Maps strategy to graph topology, wires agent factories, and
 * translates graph results back to TeamResult format.
 */
async function executeWithGraph(
  task: TeamTask,
  onProgress?: AgentProgressCallback
): Promise<TeamResult> {
  const startTime = Date.now();
  const teamId = uuidv4();
  const agentOutputs: AgentOutput[] = [];

  logger.info('Starting graph-based team task execution', {
    teamId,
    taskLength: task.description.length,
    strategy: task.strategy,
  });

  try {
    // Initialize shared memory
    sharedMemory.initialize(teamId);

    // Determine strategy
    const strategy = task.strategy || classifyTeamStrategy(task.description);
    const pipeline = strategy === 'custom' && task.customPipeline
      ? task.customPipeline
      : getAgentPipeline(strategy, task.skipReview);

    // Build graph from strategy
    const graph = buildGraphForStrategy(strategy, task.skipReview);
    const graphNodes = graph.getNodes();

    if (graphNodes.length === 0) {
      throw new Error('Empty agent graph - cannot execute');
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
      `Aufgabe: ${task.description}\nStrategie: ${strategy} (graph)\nNodes: ${graphNodes.map(n => n.config.agentRole || n.id).join(' → ')}`,
    );

    // Track node index for progress events
    let nodeIndex = 0;
    const totalNodes = graphNodes.filter(n => n.type === 'agent').length;

    // Set up progress callback to translate graph events → orchestrator events
    graph.setProgressCallback((event) => {
      switch (event.type) {
        case 'node_start': {
          const node = graphNodes.find(n => n.id === event.nodeId);
          if (node?.type === 'agent') {
            onProgress?.({
              type: 'agent_start',
              teamId,
              agentRole: (node.config.agentRole || 'researcher') as AgentRole,
              agentIndex: nodeIndex,
              totalAgents: totalNodes,
              subTask: task.description,
            });
          }
          break;
        }
        case 'node_complete': {
          const node = graphNodes.find(n => n.id === event.nodeId);
          if (node?.type === 'agent' && event.result) {
            const role = (node.config.agentRole || 'researcher') as AgentRole;

            // Build an AgentOutput record from the graph node result
            const agentOutput: AgentOutput = {
              role,
              success: event.result.success ?? true,
              content: event.result.output || '',
              toolsUsed: [],
              tokensUsed: { input: 0, output: 0 },
              executionTimeMs: event.result.durationMs || 0,
            };
            agentOutputs.push(agentOutput);

            onProgress?.({
              type: 'agent_complete',
              teamId,
              agentRole: role,
              agentIndex: nodeIndex,
              totalAgents: totalNodes,
              result: {
                role,
                success: true,
                toolsUsed: [],
                executionTimeMs: event.result.durationMs || 0,
              },
            });
            nodeIndex++;
          }
          break;
        }
        case 'node_error': {
          const node = graphNodes.find(n => n.id === event.nodeId);
          if (node?.type === 'agent' && event.result) {
            const role = (node.config.agentRole || 'researcher') as AgentRole;

            const agentOutput: AgentOutput = {
              role,
              success: false,
              content: '',
              toolsUsed: [],
              tokensUsed: { input: 0, output: 0 },
              executionTimeMs: event.result.durationMs || 0,
              error: event.result.output,
            };
            agentOutputs.push(agentOutput);

            onProgress?.({
              type: 'agent_error',
              teamId,
              agentRole: role,
              agentIndex: nodeIndex,
              totalAgents: totalNodes,
              result: {
                role,
                success: false,
                error: event.result.output,
                executionTimeMs: event.result.durationMs || 0,
              },
            });
            nodeIndex++;
          }
          break;
        }
      }
    });

    // Agent executor callback for graph.execute()
    const agentExecutor = async (role: string, agentTask: string, state: WorkflowState): Promise<string> => {
      const agent = createAgent(role as AgentRole);

      // Build context from previous node results
      const previousResults = Object.values(state.nodeResults)
        .filter(r => r.success && r.output)
        .map(r => `[${r.nodeId}] ${r.output}`)
        .join('\n\n---\n\n');

      const output = await agent.execute({
        task: agentTask,
        context: previousResults || task.context,
        aiContext: task.aiContext,
        teamId,
      });

      // Update token counts on the last agentOutput entry (which was created in node_complete)
      // We do this after execution because we only know tokens after the agent finishes
      // The node_complete callback fires after this returns, so we store the output for retrieval
      if (!output.success) {
        throw new Error(output.error || `Agent ${role} failed`);
      }

      // Patch the last agentOutput with real token info
      // (the node_complete callback will fire after we return the string)
      // Store metadata on the state for later retrieval
      state.variables[`_tokens_${state.currentNodeId}`] = output.tokensUsed;
      state.variables[`_tools_${state.currentNodeId}`] = output.toolsUsed;

      return output.content;
    };

    // Execute the graph
    const graphResult = await graph.execute(
      task.context ? `${task.description}\n\nKontext: ${task.context}` : task.description,
      task.aiContext,
      agentExecutor,
      undefined, // no toolExecutor needed
      20,        // maxIterations
    );

    // Patch agentOutputs with real token/tool info stored in state variables
    for (const agentOutput of agentOutputs) {
      // Find matching node by role
      const matchNode = graphNodes.find(n => n.config.agentRole === agentOutput.role);
      if (matchNode) {
        const tokens = graphResult.state.variables[`_tokens_${matchNode.id}`] as { input: number; output: number } | undefined;
        const tools = graphResult.state.variables[`_tools_${matchNode.id}`] as string[] | undefined;
        if (tokens) agentOutput.tokensUsed = tokens;
        if (tools) agentOutput.toolsUsed = tools;
      }
    }

    // Aggregate final output
    const finalOutput = graphResult.finalOutput || aggregateResults(agentOutputs, pipeline);

    // Get memory stats
    const memoryStats = sharedMemory.getStats(teamId);

    // Calculate total tokens
    const totalTokens = agentOutputs.reduce(
      (acc, r) => ({
        input: acc.input + r.tokensUsed.input,
        output: acc.output + r.tokensUsed.output,
      }),
      { input: 0, output: 0 }
    );

    const teamResult: TeamResult = {
      teamId,
      success: graphResult.success,
      finalOutput,
      agentResults: agentOutputs,
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

    logger.info('Graph-based team task completed', {
      teamId,
      success: teamResult.success,
      agentCount: agentOutputs.length,
      nodeCount: graphResult.nodeHistory.length,
      totalTokens,
      executionTimeMs: teamResult.executionTimeMs,
    });

    // Emit system event for proactive engine
    import('./event-system').then(({ emitSystemEvent }) =>
      emitSystemEvent({
        context: task.aiContext,
        eventType: teamResult.success ? 'agent.completed' : 'agent.failed',
        eventSource: 'agent_orchestrator',
        payload: { teamId, strategy, executionTimeMs: teamResult.executionTimeMs, agentCount: agentOutputs.length, executionMode: 'graph' },
      })
    ).catch(err => {
      logger.warn('Failed to emit agent event', { error: err instanceof Error ? err.message : String(err), teamId });
    });

    return teamResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Graph-based team task failed', error instanceof Error ? error : new Error(errorMsg));

    // Return a failed TeamResult rather than throwing
    const strategy = task.strategy || classifyTeamStrategy(task.description);
    const memoryStats = sharedMemory.getStats(teamId);
    const totalTokens = agentOutputs.reduce(
      (acc, r) => ({
        input: acc.input + r.tokensUsed.input,
        output: acc.output + r.tokensUsed.output,
      }),
      { input: 0, output: 0 }
    );

    return {
      teamId,
      success: false,
      finalOutput: `Graph execution failed: ${errorMsg}`,
      agentResults: agentOutputs,
      executionTimeMs: Date.now() - startTime,
      strategy,
      totalTokens,
      memoryStats: {
        totalEntries: memoryStats.totalEntries,
        byAgent: memoryStats.byAgent,
      },
    };
  } finally {
    sharedMemory.clear(teamId);
  }
}

/**
 * Execute a team task with SSE streaming progress
 */
export async function executeTeamTaskStreaming(
  task: TeamTask,
  res: Response,
  options?: ExecuteTeamTaskOptions
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
    }, options);

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
