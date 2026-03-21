/**
 * Agent Orchestrator (Multi-Agent System) — Facade
 *
 * Coordinates teams of specialized agents to solve complex tasks.
 *
 * Phase 119: Split into facade pattern.
 * - Strategy classification & templates: ./agents/strategy-classifier.ts
 * - This file: Core orchestration, graph execution, streaming, and re-exports
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

// Re-export everything from strategy-classifier for backward compatibility
export {
  TeamStrategy,
  AgentTemplate,
  AGENT_TEMPLATES,
  classifyTeamStrategy,
  getAgentPipeline,
  FallbackChain,
  DEFAULT_MODEL_FALLBACK_CHAIN,
  FAST_MODEL_FALLBACK_CHAIN,
  createFallbackChain,
  executeWithFallback,
  executeToolsWithFallback,
} from './agents/strategy-classifier';

import {
  type TeamStrategy,
  classifyTeamStrategy,
  getAgentPipeline,
} from './agents/strategy-classifier';

// ===========================================
// Types & Interfaces
// ===========================================

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

/** Options for executeTeamTask */
export interface ExecuteTeamTaskOptions {
  /** When true, use AgentGraph execution engine instead of sequential pipeline */
  useGraph?: boolean;
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
// Dynamic Agent Factory (Identity-Aware)
// ===========================================

export async function createAgentWithIdentity(role: AgentRole, _taskContext?: string): Promise<BaseAgent> {
  try {
    const { getAgentIdentityService } = await import('./agents/agent-identity');
    const identityService = getAgentIdentityService();
    const identities = await identityService.listIdentities({ role, enabled: true });

    if (identities.length > 0) {
      const identity = identities[0];
      const personaPrompt = identityService.buildPersonaPrompt(identity);
      const agent = createAgent(role);
      agent.setPersonaPrompt(personaPrompt);
      return agent;
    }
  } catch {
    logger.debug('Agent identity lookup failed, using default factory', { role });
  }

  return createAgent(role);
}

// ===========================================
// Task Decomposition
// ===========================================

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

  const textContent = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const subTasks: SubTask[] = [];
  try {
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
    sharedMemory.initialize(teamId);

    const strategy = task.strategy || classifyTeamStrategy(task.description);
    const pipeline = strategy === 'custom' && task.customPipeline
      ? task.customPipeline
      : getAgentPipeline(strategy, task.skipReview);

    if (pipeline.length === 0) {
      throw new Error('Empty agent pipeline');
    }

    onProgress?.({ type: 'team_start', teamId, strategy, pipeline });

    sharedMemory.write(
      teamId, 'orchestrator', 'plan',
      `Aufgabe: ${task.description}\nStrategie: ${strategy}\nPipeline: ${pipeline.join(' → ')}`,
    );

    const subTasks = await decomposeTask(task.description, pipeline, task.context);

    logger.info('Task decomposed', { teamId, subTaskCount: subTasks.length, pipeline: pipeline.join(' → ') });

    for (let i = 0; i < subTasks.length; i++) {
      const subTask = subTasks[i];
      subTask.status = 'in_progress';

      onProgress?.({
        type: 'agent_start', teamId,
        agentRole: subTask.assignedAgent, agentIndex: i, totalAgents: subTasks.length,
        subTask: subTask.description,
      });

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

      let result: AgentOutput | null = null;
      let retries = 0;

      while (retries <= MAX_AGENT_RETRIES) {
        const agent = createAgent(subTask.assignedAgent);

        if (retries > 0 && result?.error) {
          agentInput.context = `${agentInput.context || ''}\n\n[PREVIOUS ATTEMPT FAILED]: ${result.error}\nPlease try a different approach.`.trim();
        }

        result = await agent.execute(agentInput);

        if (result.success) { break; }

        retries++;
        if (retries <= MAX_AGENT_RETRIES) {
          const backoffMs = Math.pow(2, retries) * 1000;
          logger.info('Retrying failed agent with backoff', { teamId, agent: subTask.assignedAgent, attempt: retries + 1, backoffMs, error: result.error });
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          sharedMemory.write(teamId, 'orchestrator', 'decision', `Retry für ${subTask.assignedAgent}: ${result.error}`, { retry: retries, backoffMs });
        }
      }

      if (!result) {
        result = {
          role: subTask.assignedAgent, success: false, content: '', toolsUsed: [],
          tokensUsed: { input: 0, output: 0 }, executionTimeMs: 0,
          error: 'Agent execution returned no result',
        };
      }

      agentResults.push(result);

      if (result.success) {
        subTask.status = 'completed';
        subTask.result = result;
        onProgress?.({
          type: 'agent_complete', teamId, agentRole: subTask.assignedAgent,
          agentIndex: i, totalAgents: subTasks.length,
          result: { role: result.role, success: true, toolsUsed: result.toolsUsed, executionTimeMs: result.executionTimeMs },
        });
      } else {
        subTask.status = 'failed';
        subTask.result = result;
        onProgress?.({
          type: 'agent_error', teamId, agentRole: subTask.assignedAgent,
          agentIndex: i, totalAgents: subTasks.length,
          result: { role: result.role, success: false, error: result.error, executionTimeMs: result.executionTimeMs },
        });
        logger.warn('Sub-task failed after retries, continuing pipeline', { teamId, agent: subTask.assignedAgent, error: result.error, retries });
      }
    }

    const finalOutput = aggregateResults(agentResults);
    const memoryStats = sharedMemory.getStats(teamId);
    const totalTokens = agentResults.reduce((acc, r) => ({ input: acc.input + r.tokensUsed.input, output: acc.output + r.tokensUsed.output }), { input: 0, output: 0 });

    const teamResult: TeamResult = { teamId, success: agentResults.some(r => r.success), finalOutput, agentResults, executionTimeMs: Date.now() - startTime, strategy, totalTokens, memoryStats: { totalEntries: memoryStats.totalEntries, byAgent: memoryStats.byAgent } };

    onProgress?.({ type: 'team_complete', teamId, finalOutput, stats: { input: totalTokens.input, output: totalTokens.output, executionTimeMs: teamResult.executionTimeMs, memoryEntries: memoryStats.totalEntries } });

    logger.info('Team task completed', { teamId, success: teamResult.success, agentCount: agentResults.length, totalTokens, executionTimeMs: teamResult.executionTimeMs });

    import('./event-system').then(({ emitSystemEvent }) =>
      emitSystemEvent({ context: task.aiContext, eventType: teamResult.success ? 'agent.completed' : 'agent.failed', eventSource: 'agent_orchestrator', payload: { teamId, strategy, executionTimeMs: teamResult.executionTimeMs, agentCount: agentResults.length } })
    ).catch(err => { logger.warn('Failed to emit agent event', { error: err instanceof Error ? err.message : String(err), teamId }); });

    return teamResult;
  } finally {
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
    case 'research_only':
      return new AgentGraph('research-only')
        .addNode({ id: 'researcher', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
        .setStart('researcher');

    case 'write_only': {
      const graph = new AgentGraph('write-only')
        .addNode({ id: 'writer', type: 'agent', config: { agentRole: 'writer', label: 'Write' } });
      if (!skipReview) {
        graph.addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } }).addEdge({ from: 'writer', to: 'reviewer' });
      }
      return graph.setStart('writer');
    }

    case 'research_write_review': {
      const graph = new AgentGraph('research-write-review')
        .addNode({ id: 'researcher', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
        .addNode({ id: 'writer', type: 'agent', config: { agentRole: 'writer', label: 'Write' } })
        .addEdge({ from: 'researcher', to: 'writer' });
      if (!skipReview) {
        graph.addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } }).addEdge({ from: 'writer', to: 'reviewer' });
      }
      return graph.setStart('researcher');
    }

    case 'code_solve': {
      const graph = new AgentGraph('code-solve')
        .addNode({ id: 'coder', type: 'agent', config: { agentRole: 'coder', label: 'Code' } });
      if (!skipReview) {
        graph.addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } }).addEdge({ from: 'coder', to: 'reviewer' });
      }
      return graph.setStart('coder');
    }

    case 'research_code_review':
      return new AgentGraph('research-code-review')
        .addNode({ id: 'researcher', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
        .addNode({ id: 'coder', type: 'agent', config: { agentRole: 'coder', label: 'Code' } })
        .addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } })
        .addEdge({ from: 'researcher', to: 'coder' }).addEdge({ from: 'coder', to: 'reviewer' })
        .setStart('researcher');

    case 'parallel_research': {
      const graph = new AgentGraph('parallel-research')
        .addNode({ id: 'researcher1', type: 'agent', config: { agentRole: 'researcher', label: 'Research 1' } })
        .addNode({ id: 'researcher2', type: 'agent', config: { agentRole: 'researcher', label: 'Research 2' } })
        .addNode({ id: 'writer', type: 'agent', config: { agentRole: 'writer', label: 'Write' } })
        .addEdge({ from: 'researcher1', to: 'writer' }).addEdge({ from: 'researcher2', to: 'writer' });
      if (!skipReview) {
        graph.addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } }).addEdge({ from: 'writer', to: 'reviewer' });
      }
      return graph.setStart('researcher1');
    }

    case 'parallel_code_review':
      return new AgentGraph('parallel-code-review')
        .addNode({ id: 'coder', type: 'agent', config: { agentRole: 'coder', label: 'Code' } })
        .addNode({ id: 'researcher', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
        .addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } })
        .addEdge({ from: 'coder', to: 'reviewer' }).addEdge({ from: 'researcher', to: 'reviewer' })
        .setStart('coder');

    case 'full_parallel': {
      const graph = new AgentGraph('full-parallel')
        .addNode({ id: 'researcher', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
        .addNode({ id: 'coder', type: 'agent', config: { agentRole: 'coder', label: 'Code' } })
        .addNode({ id: 'writer', type: 'agent', config: { agentRole: 'writer', label: 'Write' } })
        .addEdge({ from: 'researcher', to: 'writer' }).addEdge({ from: 'coder', to: 'writer' });
      if (!skipReview) {
        graph.addNode({ id: 'reviewer', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } }).addEdge({ from: 'writer', to: 'reviewer' });
      }
      return graph.setStart('researcher');
    }

    case 'custom':
      return new AgentGraph('custom');
  }
}

async function executeWithGraph(task: TeamTask, onProgress?: AgentProgressCallback): Promise<TeamResult> {
  const startTime = Date.now();
  const teamId = uuidv4();
  const agentOutputs: AgentOutput[] = [];

  logger.info('Starting graph-based team task execution', { teamId, taskLength: task.description.length, strategy: task.strategy });

  try {
    sharedMemory.initialize(teamId);
    const strategy = task.strategy || classifyTeamStrategy(task.description);
    const pipeline = strategy === 'custom' && task.customPipeline ? task.customPipeline : getAgentPipeline(strategy, task.skipReview);
    const graph = buildGraphForStrategy(strategy, task.skipReview);
    const graphNodes = graph.getNodes();

    if (graphNodes.length === 0) { throw new Error('Empty agent graph - cannot execute'); }

    onProgress?.({ type: 'team_start', teamId, strategy, pipeline });
    sharedMemory.write(teamId, 'orchestrator', 'plan', `Aufgabe: ${task.description}\nStrategie: ${strategy} (graph)\nNodes: ${graphNodes.map(n => n.config.agentRole || n.id).join(' → ')}`);

    let nodeIndex = 0;
    const totalNodes = graphNodes.filter(n => n.type === 'agent').length;

    graph.setProgressCallback((event) => {
      switch (event.type) {
        case 'node_start': {
          const node = graphNodes.find(n => n.id === event.nodeId);
          if (node?.type === 'agent') {
            onProgress?.({ type: 'agent_start', teamId, agentRole: (node.config.agentRole || 'researcher') as AgentRole, agentIndex: nodeIndex, totalAgents: totalNodes, subTask: task.description });
          }
          break;
        }
        case 'node_complete': {
          const node = graphNodes.find(n => n.id === event.nodeId);
          if (node?.type === 'agent' && event.result) {
            const role = (node.config.agentRole || 'researcher') as AgentRole;
            const agentOutput: AgentOutput = { role, success: event.result.success ?? true, content: event.result.output || '', toolsUsed: [], tokensUsed: { input: 0, output: 0 }, executionTimeMs: event.result.durationMs || 0 };
            agentOutputs.push(agentOutput);
            onProgress?.({ type: 'agent_complete', teamId, agentRole: role, agentIndex: nodeIndex, totalAgents: totalNodes, result: { role, success: true, toolsUsed: [], executionTimeMs: event.result.durationMs || 0 } });
            nodeIndex++;
          }
          break;
        }
        case 'node_error': {
          const node = graphNodes.find(n => n.id === event.nodeId);
          if (node?.type === 'agent' && event.result) {
            const role = (node.config.agentRole || 'researcher') as AgentRole;
            const agentOutput: AgentOutput = { role, success: false, content: '', toolsUsed: [], tokensUsed: { input: 0, output: 0 }, executionTimeMs: event.result.durationMs || 0, error: event.result.output };
            agentOutputs.push(agentOutput);
            onProgress?.({ type: 'agent_error', teamId, agentRole: role, agentIndex: nodeIndex, totalAgents: totalNodes, result: { role, success: false, error: event.result.output, executionTimeMs: event.result.durationMs || 0 } });
            nodeIndex++;
          }
          break;
        }
      }
    });

    const agentExecutor = async (role: string, agentTask: string, state: WorkflowState): Promise<string> => {
      const agent = createAgent(role as AgentRole);
      const previousResults = Object.values(state.nodeResults).filter(r => r.success && r.output).map(r => `[${r.nodeId}] ${r.output}`).join('\n\n---\n\n');
      const output = await agent.execute({ task: agentTask, context: previousResults || task.context, aiContext: task.aiContext, teamId });
      if (!output.success) { throw new Error(output.error || `Agent ${role} failed`); }
      state.variables[`_tokens_${state.currentNodeId}`] = output.tokensUsed;
      state.variables[`_tools_${state.currentNodeId}`] = output.toolsUsed;
      return output.content;
    };

    const graphResult = await graph.execute(
      task.context ? `${task.description}\n\nKontext: ${task.context}` : task.description,
      task.aiContext, agentExecutor, undefined, 20,
    );

    for (const agentOutput of agentOutputs) {
      const matchNode = graphNodes.find(n => n.config.agentRole === agentOutput.role);
      if (matchNode) {
        const tokens = graphResult.state.variables[`_tokens_${matchNode.id}`] as { input: number; output: number } | undefined;
        const tools = graphResult.state.variables[`_tools_${matchNode.id}`] as string[] | undefined;
        if (tokens) agentOutput.tokensUsed = tokens;
        if (tools) agentOutput.toolsUsed = tools;
      }
    }

    const finalOutput = graphResult.finalOutput || aggregateResults(agentOutputs);
    const memoryStats = sharedMemory.getStats(teamId);
    const totalTokens = agentOutputs.reduce((acc, r) => ({ input: acc.input + r.tokensUsed.input, output: acc.output + r.tokensUsed.output }), { input: 0, output: 0 });

    const teamResult: TeamResult = { teamId, success: graphResult.success, finalOutput, agentResults: agentOutputs, executionTimeMs: Date.now() - startTime, strategy, totalTokens, memoryStats: { totalEntries: memoryStats.totalEntries, byAgent: memoryStats.byAgent } };

    onProgress?.({ type: 'team_complete', teamId, finalOutput, stats: { input: totalTokens.input, output: totalTokens.output, executionTimeMs: teamResult.executionTimeMs, memoryEntries: memoryStats.totalEntries } });

    logger.info('Graph-based team task completed', { teamId, success: teamResult.success, agentCount: agentOutputs.length, nodeCount: graphResult.nodeHistory.length, totalTokens, executionTimeMs: teamResult.executionTimeMs });

    import('./event-system').then(({ emitSystemEvent }) =>
      emitSystemEvent({ context: task.aiContext, eventType: teamResult.success ? 'agent.completed' : 'agent.failed', eventSource: 'agent_orchestrator', payload: { teamId, strategy, executionTimeMs: teamResult.executionTimeMs, agentCount: agentOutputs.length, executionMode: 'graph' } })
    ).catch(err => { logger.warn('Failed to emit agent event', { error: err instanceof Error ? err.message : String(err), teamId }); });

    return teamResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Graph-based team task failed', error instanceof Error ? error : new Error(errorMsg));
    const strategy = task.strategy || classifyTeamStrategy(task.description);
    const memoryStats = sharedMemory.getStats(teamId);
    const totalTokens = agentOutputs.reduce((acc, r) => ({ input: acc.input + r.tokensUsed.input, output: acc.output + r.tokensUsed.output }), { input: 0, output: 0 });
    return { teamId, success: false, finalOutput: `Graph execution failed: ${errorMsg}`, agentResults: agentOutputs, executionTimeMs: Date.now() - startTime, strategy, totalTokens, memoryStats: { totalEntries: memoryStats.totalEntries, byAgent: memoryStats.byAgent } };
  } finally {
    sharedMemory.clear(teamId);
  }
}

// ===========================================
// SSE Streaming
// ===========================================

export async function executeTeamTaskStreaming(task: TeamTask, res: Response, options?: ExecuteTeamTaskOptions): Promise<void> {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });

  const sendEvent = (event: AgentProgressEvent) => { res.write(`data: ${JSON.stringify(event)}\n\n`); };

  let closed = false;
  res.on('close', () => { closed = true; });

  try {
    const result = await executeTeamTask(task, (event) => { if (!closed) { sendEvent(event); } }, options);

    if (!closed) {
      res.write(`data: ${JSON.stringify({
        type: 'result', teamId: result.teamId, success: result.success, finalOutput: result.finalOutput, strategy: result.strategy,
        agents: result.agentResults.map(a => ({ role: a.role, success: a.success, toolsUsed: a.toolsUsed, executionTimeMs: a.executionTimeMs, error: a.error })),
        stats: { executionTimeMs: result.executionTimeMs, totalTokens: result.totalTokens, sharedMemoryEntries: result.memoryStats.totalEntries },
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
    if (!closed) { res.end(); }
  }
}

// ===========================================
// Result Aggregation
// ===========================================

function aggregateResults(results: AgentOutput[]): string {
  const reviewerResult = results.find(r => r.role === 'reviewer' && r.success);
  if (reviewerResult) return reviewerResult.content;
  const writerResult = results.find(r => r.role === 'writer' && r.success);
  if (writerResult) return writerResult.content;
  const lastSuccess = [...results].reverse().find(r => r.success);
  if (lastSuccess) return lastSuccess.content;
  return results.map(r => `[${r.role}]: ${r.error || 'Keine Ausgabe'}`).join('\n');
}

// ===========================================
// Quick Execution Helpers
// ===========================================

export async function quickResearch(query: string, aiContext: AIContext = 'personal'): Promise<TeamResult> {
  return executeTeamTask({ description: query, aiContext, strategy: 'research_only' });
}

export async function researchAndWrite(task: string, aiContext: AIContext = 'personal', context?: string): Promise<TeamResult> {
  return executeTeamTask({ description: task, aiContext, strategy: 'research_write_review', skipReview: true, context });
}

export async function fullTeamExecution(task: string, aiContext: AIContext = 'personal', context?: string): Promise<TeamResult> {
  return executeTeamTask({ description: task, aiContext, strategy: 'research_write_review', context });
}
