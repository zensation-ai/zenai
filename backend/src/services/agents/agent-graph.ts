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

export interface GraphNode {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'human_review';
  config: {
    agentRole?: string;
    toolName?: string;
    condition?: (state: WorkflowState) => string;
    label?: string;
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

    let currentNode = this.nodes.get(this.startNodeId)!;
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
   * Find next node via edges
   */
  private getNextNode(currentId: string): GraphNode | null {
    const outEdges = this.edges.filter(e => e.from === currentId);
    if (outEdges.length === 0) return null;

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
