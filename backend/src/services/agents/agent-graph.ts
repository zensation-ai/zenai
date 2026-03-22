/**
 * Phase 64: LangGraph-Style Agent Graph
 *
 * Graph-based workflow execution with:
 * - Typed nodes (agent, tool, condition, human_review)
 * - Conditional edges for routing
 * - State checkpointing at each node
 * - Loop detection with max iterations
 * - Progress event emission
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { AIContext } from '../../utils/database-context';

// ===========================================
// Types
// ===========================================

export interface ParallelConfig {
  /** Branch edge sets - each branch is a list of edges to execute */
  branches: WorkflowEdge[][];
  /** Merge strategy: 'all' collects all results, 'first' races for first success */
  merge_strategy: 'all' | 'first';
  /** Timeout in milliseconds for parallel execution */
  timeout_ms: number;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface GraphNode {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'human_review' | 'parallel';
  config: {
    agentRole?: string;
    toolName?: string;
    condition?: (state: WorkflowState) => string;
    label?: string;
    parallel?: ParallelConfig;
  };
}

export interface GraphEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface WorkflowState {
  executionId: string;
  input: string;
  context: AIContext;
  currentNodeId: string;
  nodeResults: Record<string, NodeResult>;
  variables: Record<string, unknown>;
  iteration: number;
  maxIterations: number;
  status: 'running' | 'completed' | 'failed' | 'paused';
}

export interface NodeResult {
  nodeId: string;
  nodeType: string;
  output: string;
  success: boolean;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface WorkflowResult {
  executionId: string;
  success: boolean;
  finalOutput: string;
  nodeHistory: NodeResult[];
  totalDurationMs: number;
  state: WorkflowState;
}

export type ProgressCallback = (event: GraphProgressEvent) => void;

export interface GraphProgressEvent {
  type: 'node_start' | 'node_complete' | 'node_error' | 'workflow_complete' | 'workflow_paused';
  executionId: string;
  nodeId?: string;
  nodeType?: string;
  result?: Partial<NodeResult>;
  state?: Partial<WorkflowState>;
}

// ===========================================
// Agent Graph
// ===========================================

export class AgentGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];
  private startNodeId: string | null = null;
  private name: string;
  private onProgress: ProgressCallback | null = null;

  constructor(name = 'unnamed') {
    this.name = name;
  }

  /**
   * Add a node to the graph
   */
  addNode(node: GraphNode): this {
    this.nodes.set(node.id, node);
    if (!this.startNodeId && node.type !== 'condition') {
      this.startNodeId = node.id;
    }
    return this;
  }

  /**
   * Add an edge between nodes
   */
  addEdge(edge: GraphEdge): this {
    this.edges.push(edge);
    if (!this.startNodeId) {
      this.startNodeId = edge.from;
    }
    return this;
  }

  /**
   * Set the start node explicitly
   */
  setStart(nodeId: string): this {
    this.startNodeId = nodeId;
    return this;
  }

  /**
   * Set progress callback
   */
  setProgressCallback(cb: ProgressCallback): this {
    this.onProgress = cb;
    return this;
  }

  /**
   * Get all nodes
   */
  getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges
   */
  getEdges(): GraphEdge[] {
    return [...this.edges];
  }

  /**
   * Get graph name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Execute the graph workflow
   */
  async execute(
    input: string,
    context: AIContext,
    agentExecutor?: (role: string, task: string, state: WorkflowState) => Promise<string>,
    toolExecutor?: (toolName: string, state: WorkflowState) => Promise<string>,
    maxIterations = 20,
  ): Promise<WorkflowResult> {
    const executionId = uuidv4();
    const startTime = Date.now();
    const nodeHistory: NodeResult[] = [];

    const state: WorkflowState = {
      executionId,
      input,
      context,
      currentNodeId: this.startNodeId || '',
      nodeResults: {},
      variables: {},
      iteration: 0,
      maxIterations,
      status: 'running',
    };

    if (!this.startNodeId || !this.nodes.has(this.startNodeId)) {
      return {
        executionId,
        success: false,
        finalOutput: 'No start node defined',
        nodeHistory,
        totalDurationMs: Date.now() - startTime,
        state: { ...state, status: 'failed' },
      };
    }

    let currentNode = this.nodes.get(this.startNodeId);
    if (!currentNode) {
      return {
        executionId,
        success: false,
        finalOutput: `Start node ${this.startNodeId} not found`,
        nodeHistory,
        totalDurationMs: Date.now() - startTime,
        state: { ...state, status: 'failed' },
      };
    }
    let lastOutput = '';

    while (state.iteration < maxIterations && state.status === 'running') {
      state.iteration++;
      state.currentNodeId = currentNode.id;
      const nodeStart = Date.now();

      this.emitProgress({
        type: 'node_start',
        executionId,
        nodeId: currentNode.id,
        nodeType: currentNode.type,
      });

      try {
        let output = '';

        switch (currentNode.type) {
          case 'agent': {
            const role = currentNode.config.agentRole || 'researcher';
            const task = lastOutput || input;
            output = agentExecutor
              ? await agentExecutor(role, task, state)
              : `[Agent ${role} output for: ${task.substring(0, 100)}]`;
            lastOutput = output;
            break;
          }

          case 'tool': {
            const toolName = currentNode.config.toolName || '';
            output = toolExecutor
              ? await toolExecutor(toolName, state)
              : `[Tool ${toolName} result]`;
            lastOutput = output;
            break;
          }

          case 'condition': {
            if (!currentNode.config.condition) {
              throw new Error(`Condition node ${currentNode.id} has no condition function`);
            }
            const nextNodeId = currentNode.config.condition(state);
            const nextNode = this.nodes.get(nextNodeId);
            if (!nextNode) {
              throw new Error(`Condition routed to unknown node: ${nextNodeId}`);
            }

            const condResult: NodeResult = {
              nodeId: currentNode.id,
              nodeType: 'condition',
              output: `-> ${nextNodeId}`,
              success: true,
              durationMs: Date.now() - nodeStart,
            };
            nodeHistory.push(condResult);
            state.nodeResults[currentNode.id] = condResult;

            this.emitProgress({
              type: 'node_complete',
              executionId,
              nodeId: currentNode.id,
              nodeType: 'condition',
              result: condResult,
            });

            currentNode = nextNode;
            continue;
          }

          case 'human_review': {
            state.status = 'paused';
            const pauseResult: NodeResult = {
              nodeId: currentNode.id,
              nodeType: 'human_review',
              output: 'Awaiting human review',
              success: true,
              durationMs: Date.now() - nodeStart,
            };
            nodeHistory.push(pauseResult);
            state.nodeResults[currentNode.id] = pauseResult;

            this.emitProgress({
              type: 'workflow_paused',
              executionId,
              nodeId: currentNode.id,
              state: { status: 'paused' },
            });

            return {
              executionId,
              success: true,
              finalOutput: lastOutput,
              nodeHistory,
              totalDurationMs: Date.now() - startTime,
              state,
            };
          }

          case 'parallel': {
            const parallelConfig = currentNode.config.parallel;
            if (!parallelConfig || !parallelConfig.branches.length) {
              throw new Error(`Parallel node ${currentNode.id} has no branches configured`);
            }

            const branchResults = await this.executeParallelBranches(
              parallelConfig,
              input,
              state,
              agentExecutor,
              toolExecutor,
            );

            // Store merged results in state variables for downstream nodes
            state.variables['parallel_results'] = branchResults;
            lastOutput = branchResults.join('\n\n---\n\n');
            output = lastOutput;
            break;
          }
        }

        const result: NodeResult = {
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          output,
          success: true,
          durationMs: Date.now() - nodeStart,
        };
        nodeHistory.push(result);
        state.nodeResults[currentNode.id] = result;

        this.emitProgress({
          type: 'node_complete',
          executionId,
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          result,
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorResult: NodeResult = {
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          output: errorMsg,
          success: false,
          durationMs: Date.now() - nodeStart,
        };
        nodeHistory.push(errorResult);
        state.nodeResults[currentNode.id] = errorResult;

        this.emitProgress({
          type: 'node_error',
          executionId,
          nodeId: currentNode.id,
          result: errorResult,
        });

        state.status = 'failed';
        break;
      }

      // Find next node via edges
      const nextNode = this.getNextNode(currentNode.id);
      if (!nextNode) {
        state.status = 'completed';
        break;
      }
      currentNode = nextNode;
    }

    if (state.iteration >= maxIterations && state.status === 'running') {
      state.status = 'failed';
      logger.warn('Workflow exceeded max iterations', {
        operation: 'agent-graph',
        executionId,
        maxIterations,
      });
    }

    this.emitProgress({
      type: 'workflow_complete',
      executionId,
      state: { status: state.status },
    });

    return {
      executionId,
      success: state.status === 'completed',
      finalOutput: lastOutput,
      nodeHistory,
      totalDurationMs: Date.now() - startTime,
      state,
    };
  }

  /**
   * Serialize graph for storage
   */
  serialize(): { nodes: GraphNode[]; edges: GraphEdge[]; startNodeId: string | null; name: string } {
    const nodes = Array.from(this.nodes.values()).map(n => ({
      ...n,
      config: {
        ...n.config,
        condition: undefined,
      },
    }));

    return {
      nodes,
      edges: [...this.edges],
      startNodeId: this.startNodeId,
      name: this.name,
    };
  }

  /**
   * Execute parallel branches with merge strategy and timeout
   */
  private async executeParallelBranches(
    config: ParallelConfig,
    input: string,
    state: WorkflowState,
    agentExecutor?: (role: string, task: string, state: WorkflowState) => Promise<string>,
    toolExecutor?: (toolName: string, state: WorkflowState) => Promise<string>,
  ): Promise<string[]> {
    const branchPromises = config.branches.map(async (branchEdges) => {
      // Each branch targets a single node (the `to` of the first edge)
      const targetNodeId = branchEdges[0]?.to;
      if (!targetNodeId) {return '';}

      const targetNode = this.nodes.get(targetNodeId);
      if (!targetNode) {return '';}

      // Clone state for branch isolation
      const branchState: WorkflowState = {
        ...state,
        nodeResults: { ...state.nodeResults },
        variables: { ...state.variables },
      };

      if (targetNode.type === 'agent' && agentExecutor) {
        const role = targetNode.config.agentRole || 'researcher';
        return agentExecutor(role, input, branchState);
      } else if (targetNode.type === 'tool' && toolExecutor) {
        const toolName = targetNode.config.toolName || '';
        return toolExecutor(toolName, branchState);
      }
      return `[${targetNode.type} node ${targetNodeId}]`;
    });

    const timeoutPromise = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), config.timeout_ms)
    );

    if (config.merge_strategy === 'first') {
      // Race: first successful branch wins
      const result = await Promise.race([
        Promise.any(branchPromises),
        timeoutPromise,
      ]);
      return [result === 'timeout' ? '' : result as string].filter(Boolean);
    }

    // All: collect all results, timeout returns available results
    const raceResult = await Promise.race([
      Promise.allSettled(branchPromises),
      timeoutPromise,
    ]);

    if (raceResult === 'timeout') {
      // On timeout, wait a brief moment for any already-resolved promises
      const settled = await Promise.allSettled(
        branchPromises.map(p => Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), 0))]))
      );
      return settled
        .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled' && !!r.value)
        .map(r => r.value as string);
    }

    return (raceResult as PromiseSettledResult<string>[])
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && !!r.value)
      .map(r => r.value);
  }

  /**
   * Find next node via edges
   */
  private getNextNode(currentId: string): GraphNode | null {
    const outEdges = this.edges.filter(e => e.from === currentId);
    if (outEdges.length === 0) {return null;}

    const nextEdge = outEdges[0];
    return this.nodes.get(nextEdge.to) || null;
  }

  /**
   * Emit progress event
   */
  private emitProgress(event: GraphProgressEvent): void {
    if (this.onProgress) {
      try {
        this.onProgress(event);
      } catch {
        // Ignore progress callback errors
      }
    }
  }
}

// ===========================================
// Dynamic Model Routing (Phase 114, Task 50)
// ===========================================

/**
 * Model tiers for dynamic routing based on task complexity.
 * - fast: Claude Haiku (cheap, fast) — simple tasks
 * - standard: Claude Sonnet (balanced) — general tasks
 * - powerful: Claude Opus (most capable) — critical/complex tasks
 */
export type ModelTier = 'fast' | 'standard' | 'powerful';

export interface ModelRoutingDecision {
  tier: ModelTier;
  model: string;
  reason: string;
}

/** Model names mapped from tiers */
const MODEL_TIER_MAP: Record<ModelTier, string> = {
  fast: 'claude-haiku-4-5',
  standard: 'claude-sonnet-4-5',
  powerful: 'claude-opus-4-5',
};

/**
 * Complexity signals used to determine model tier.
 */
interface ComplexitySignals {
  wordCount: number;
  toolCountNeeded: number;
  domainComplexity: 'low' | 'medium' | 'high';
}

/**
 * Extract complexity signals from a task description.
 */
function extractComplexitySignals(task: string, toolCount = 0): ComplexitySignals {
  const words = task.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Detect domain complexity from keywords
  const highComplexityKeywords = [
    'architecture', 'refactor', 'strategy', 'analyze', 'synthesize', 'optimize',
    'research', 'compare', 'evaluate', 'comprehensive', 'complex', 'advanced',
    // German
    'architektur', 'strategisch', 'analysiere', 'synthetisiere', 'optimiere',
    'recherchiere', 'vergleiche', 'bewerte', 'umfassend', 'komplex', 'fortgeschritten',
  ];
  const lowComplexityKeywords = [
    'summarize', 'list', 'count', 'simple', 'quick', 'brief', 'basic',
    'translate', 'convert', 'format', 'check',
    // German
    'zusammenfassen', 'auflisten', 'zählen', 'einfach', 'schnell', 'kurz', 'einfache',
    'übersetzen', 'konvertieren', 'formatieren', 'prüfen',
  ];

  const taskLower = task.toLowerCase();
  const highMatches = highComplexityKeywords.filter(kw => taskLower.includes(kw)).length;
  const lowMatches = lowComplexityKeywords.filter(kw => taskLower.includes(kw)).length;

  let domainComplexity: 'low' | 'medium' | 'high';
  if (highMatches >= 2 || (highMatches >= 1 && wordCount > 50)) {
    domainComplexity = 'high';
  } else if (lowMatches >= 1 && wordCount <= 20) {
    domainComplexity = 'low';
  } else {
    domainComplexity = 'medium';
  }

  return { wordCount, toolCountNeeded: toolCount, domainComplexity };
}

/**
 * Select the appropriate model tier based on task complexity.
 *
 * Heuristic rules:
 * - simple (short, low-complexity, no tools) → fast (haiku)
 * - complex (long, high-complexity, many tools) → powerful (opus)
 * - everything else → standard (sonnet)
 */
export function selectModelForTask(
  task: string,
  toolCount = 0,
  overrideTier?: ModelTier,
): ModelRoutingDecision {
  if (overrideTier) {
    return {
      tier: overrideTier,
      model: MODEL_TIER_MAP[overrideTier],
      reason: 'override provided',
    };
  }

  const signals = extractComplexitySignals(task, toolCount);

  // Criteria for 'fast' tier
  const isFast =
    signals.wordCount <= 15 &&
    signals.toolCountNeeded === 0 &&
    signals.domainComplexity === 'low';

  // Criteria for 'powerful' tier
  const isPowerful =
    signals.domainComplexity === 'high' &&
    (signals.wordCount > 50 || signals.toolCountNeeded >= 3);

  if (isFast) {
    return {
      tier: 'fast',
      model: MODEL_TIER_MAP.fast,
      reason: `short task (${signals.wordCount} words), no tools, low complexity`,
    };
  }

  if (isPowerful) {
    return {
      tier: 'powerful',
      model: MODEL_TIER_MAP.powerful,
      reason: `high complexity task (${signals.wordCount} words, ${signals.toolCountNeeded} tools)`,
    };
  }

  return {
    tier: 'standard',
    model: MODEL_TIER_MAP.standard,
    reason: `standard task (${signals.wordCount} words, ${signals.domainComplexity} complexity)`,
  };
}

// ===========================================
// Pre-built Workflow Templates
// ===========================================

/**
 * Create a research -> write -> review workflow
 */
export function createResearchWriteReviewGraph(): AgentGraph {
  return new AgentGraph('research-write-review')
    .addNode({ id: 'research', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
    .addNode({ id: 'write', type: 'agent', config: { agentRole: 'writer', label: 'Write' } })
    .addNode({ id: 'review', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } })
    .addEdge({ from: 'research', to: 'write' })
    .addEdge({ from: 'write', to: 'review' })
    .setStart('research');
}

/**
 * Create a code solve -> review workflow
 */
export function createCodeReviewGraph(): AgentGraph {
  return new AgentGraph('code-review')
    .addNode({ id: 'code', type: 'agent', config: { agentRole: 'coder', label: 'Code' } })
    .addNode({ id: 'review', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } })
    .addEdge({ from: 'code', to: 'review' })
    .setStart('code');
}

/**
 * Create a research -> code -> review workflow
 */
export function createResearchCodeReviewGraph(): AgentGraph {
  return new AgentGraph('research-code-review')
    .addNode({ id: 'research', type: 'agent', config: { agentRole: 'researcher', label: 'Research' } })
    .addNode({ id: 'code', type: 'agent', config: { agentRole: 'coder', label: 'Code' } })
    .addNode({ id: 'review', type: 'agent', config: { agentRole: 'reviewer', label: 'Review' } })
    .addEdge({ from: 'research', to: 'code' })
    .addEdge({ from: 'code', to: 'review' })
    .setStart('research');
}
