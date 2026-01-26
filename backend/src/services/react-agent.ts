/**
 * ReAct Agent Service
 *
 * Implements the ReAct (Reasoning + Acting) pattern for complex task execution.
 * The agent iteratively:
 * 1. THINKS - Analyzes the current state and decides next action
 * 2. ACTS - Executes a tool or action
 * 3. OBSERVES - Processes the result
 * 4. REPEATS until task is complete
 *
 * This pattern enables:
 * - Multi-step problem solving
 * - Self-correction on errors
 * - Transparent reasoning chains
 * - Robust task completion
 *
 * @module services/react-agent
 */

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from './claude/client';
import { toolRegistry, ToolDefinition, ToolCall } from './claude/tool-use';
import { AIContext } from '../utils/database-context';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * A single step in the agent's reasoning chain
 */
export interface AgentStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'final_answer';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Tool call within an action step
 */
export interface AgentAction {
  tool: string;
  input: Record<string, unknown>;
  reasoning: string;
}

/**
 * Result from agent execution
 */
export interface AgentResult {
  /** Unique execution ID */
  executionId: string;
  /** Whether the task was completed successfully */
  success: boolean;
  /** Final answer/response */
  answer: string;
  /** Full reasoning chain */
  steps: AgentStep[];
  /** Total iterations used */
  iterations: number;
  /** Tools that were called */
  toolsUsed: string[];
  /** Execution time in ms */
  executionTimeMs: number;
  /** Error if failed */
  error?: string;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Maximum reasoning iterations */
  maxIterations: number;
  /** Available tools */
  tools: string[];
  /** System context */
  systemContext?: string;
  /** Temperature for reasoning */
  temperature: number;
  /** Enable verbose logging */
  verbose: boolean;
  /** Timeout per iteration in ms */
  iterationTimeoutMs: number;
}

/**
 * Task for the agent to execute
 */
export interface AgentTask {
  /** Task description */
  description: string;
  /** Additional context */
  context?: string;
  /** AI context (personal/work) */
  aiContext: AIContext;
  /** Expected output format (optional) */
  expectedFormat?: string;
}

// ===========================================
// Configuration
// ===========================================

const DEFAULT_CONFIG: AgentConfig = {
  maxIterations: 10,
  tools: [],
  temperature: 0.3, // Lower for more deterministic reasoning
  verbose: false,
  iterationTimeoutMs: 60000,
};

// ===========================================
// System Prompts
// ===========================================

const REACT_SYSTEM_PROMPT = `Du bist ein intelligenter Agent, der Aufgaben durch schrittweises Denken und Handeln löst.

WICHTIGE REGELN:
1. Denke IMMER zuerst nach, bevor du handelst
2. Nutze Tools nur wenn nötig - oft kannst du direkt antworten
3. Korrigiere Fehler selbstständig
4. Gib eine klare Endantwort wenn die Aufgabe erledigt ist

ABLAUF:
Für jeden Schritt, antworte im folgenden Format:

THOUGHT: [Deine Überlegung - was weißt du, was brauchst du noch?]
ACTION: [tool_name]
ACTION_INPUT: [JSON-Input für das Tool]

ODER wenn du die Antwort hast:

THOUGHT: [Finale Überlegung]
FINAL_ANSWER: [Deine vollständige Antwort]

BEISPIEL:
User: Wie viele meiner Ideen behandeln das Thema "KI"?

THOUGHT: Der Benutzer möchte wissen, wie viele Ideen das Thema KI behandeln. Ich muss in den Ideen suchen.
ACTION: search_ideas
ACTION_INPUT: {"query": "KI künstliche Intelligenz AI", "limit": 50}

[Nach Beobachtung]

THOUGHT: Ich habe 12 Ergebnisse gefunden. Ich kann jetzt die Frage beantworten.
FINAL_ANSWER: Du hast 12 Ideen, die das Thema KI/Künstliche Intelligenz behandeln.`;

// ===========================================
// ReAct Agent Class
// ===========================================

/**
 * ReAct Agent for complex task execution
 */
export class ReActAgent {
  private config: AgentConfig;
  private client: Anthropic;

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = getClaudeClient();
  }

  /**
   * Execute a task using ReAct pattern
   */
  async execute(task: AgentTask): Promise<AgentResult> {
    const executionId = uuidv4();
    const startTime = Date.now();
    const steps: AgentStep[] = [];
    const toolsUsed: string[] = [];

    logger.info('ReAct agent starting', {
      executionId,
      task: task.description.substring(0, 100),
      tools: this.config.tools,
    });

    // Build system prompt
    let systemPrompt = REACT_SYSTEM_PROMPT;
    if (this.config.systemContext) {
      systemPrompt += `\n\n[KONTEXT]\n${this.config.systemContext}`;
    }
    if (task.context) {
      systemPrompt += `\n\n[AUFGABENKONTEXT]\n${task.context}`;
    }
    if (task.expectedFormat) {
      systemPrompt += `\n\n[ERWARTETES FORMAT]\n${task.expectedFormat}`;
    }

    // Get tool definitions
    const toolDefinitions = this.config.tools.length > 0
      ? toolRegistry.getDefinitionsFor(this.config.tools)
      : toolRegistry.getDefinitions();

    if (toolDefinitions.length > 0) {
      systemPrompt += '\n\n[VERFÜGBARE TOOLS]\n';
      for (const tool of toolDefinitions) {
        systemPrompt += `- ${tool.name}: ${tool.description}\n`;
      }
    }

    // Initialize conversation
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: task.description },
    ];

    let iteration = 0;
    let finalAnswer = '';
    let success = false;
    let error: string | undefined;

    try {
      while (iteration < this.config.maxIterations) {
        iteration++;

        if (this.config.verbose) {
          logger.debug('ReAct iteration', { executionId, iteration });
        }

        // Get agent's response
        const response = await this.getAgentResponse(systemPrompt, messages);

        // Parse the response
        const parsed = this.parseResponse(response);

        // Record thought
        if (parsed.thought) {
          steps.push({
            id: uuidv4(),
            type: 'thought',
            content: parsed.thought,
            timestamp: new Date(),
          });
        }

        // Check for final answer
        if (parsed.finalAnswer) {
          finalAnswer = parsed.finalAnswer;
          steps.push({
            id: uuidv4(),
            type: 'final_answer',
            content: parsed.finalAnswer,
            timestamp: new Date(),
          });
          success = true;
          break;
        }

        // Check for action
        if (parsed.action) {
          steps.push({
            id: uuidv4(),
            type: 'action',
            content: `${parsed.action.tool}(${JSON.stringify(parsed.action.input)})`,
            timestamp: new Date(),
            metadata: { tool: parsed.action.tool, input: parsed.action.input },
          });

          if (!toolsUsed.includes(parsed.action.tool)) {
            toolsUsed.push(parsed.action.tool);
          }

          // Execute the tool
          let observation: string;
          try {
            observation = await toolRegistry.execute(parsed.action.tool, parsed.action.input);
          } catch (toolError) {
            observation = `Fehler: ${toolError instanceof Error ? toolError.message : 'Unbekannter Fehler'}`;
          }

          steps.push({
            id: uuidv4(),
            type: 'observation',
            content: observation,
            timestamp: new Date(),
          });

          // Add to conversation for next iteration
          messages.push({
            role: 'assistant',
            content: response,
          });
          messages.push({
            role: 'user',
            content: `OBSERVATION: ${observation}`,
          });
        } else {
          // No action and no final answer - prompt for continuation
          messages.push({
            role: 'assistant',
            content: response,
          });
          messages.push({
            role: 'user',
            content: 'Bitte fahre fort mit deiner Analyse oder gib eine FINAL_ANSWER.',
          });
        }
      }

      // Max iterations reached without final answer
      if (!success) {
        // Try to get a final answer
        messages.push({
          role: 'user',
          content: 'Du hast das Maximum an Iterationen erreicht. Gib jetzt deine beste FINAL_ANSWER basierend auf dem bisherigen Wissen.',
        });

        const finalResponse = await this.getAgentResponse(systemPrompt, messages);
        const parsed = this.parseResponse(finalResponse);

        if (parsed.finalAnswer) {
          finalAnswer = parsed.finalAnswer;
          success = true;
        } else if (parsed.thought) {
          finalAnswer = parsed.thought;
          success = true;
        } else {
          finalAnswer = finalResponse;
          success = true;
        }

        steps.push({
          id: uuidv4(),
          type: 'final_answer',
          content: finalAnswer,
          timestamp: new Date(),
          metadata: { forced: true },
        });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      logger.error('ReAct agent failed', { executionId, error, iteration });
    }

    const executionTimeMs = Date.now() - startTime;

    logger.info('ReAct agent complete', {
      executionId,
      success,
      iterations: iteration,
      toolsUsed,
      executionTimeMs,
    });

    return {
      executionId,
      success,
      answer: finalAnswer,
      steps,
      iterations: iteration,
      toolsUsed,
      executionTimeMs,
      error,
    };
  }

  /**
   * Get response from Claude
   */
  private async getAgentResponse(
    systemPrompt: string,
    messages: Anthropic.MessageParam[]
  ): Promise<string> {
    return executeWithProtection(async () => {
      const response = await this.client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        temperature: this.config.temperature,
        system: systemPrompt,
        messages,
      });

      if (response.content[0]?.type === 'text') {
        return response.content[0].text;
      }
      return '';
    });
  }

  /**
   * Parse agent response into structured components
   */
  private parseResponse(response: string): {
    thought?: string;
    action?: AgentAction;
    finalAnswer?: string;
  } {
    const result: {
      thought?: string;
      action?: AgentAction;
      finalAnswer?: string;
    } = {};

    // Extract THOUGHT
    const thoughtMatch = response.match(/THOUGHT:\s*(.+?)(?=ACTION:|FINAL_ANSWER:|$)/s);
    if (thoughtMatch) {
      result.thought = thoughtMatch[1].trim();
    }

    // Extract FINAL_ANSWER
    const finalMatch = response.match(/FINAL_ANSWER:\s*(.+?)$/s);
    if (finalMatch) {
      result.finalAnswer = finalMatch[1].trim();
      return result; // Final answer takes precedence
    }

    // Extract ACTION
    const actionMatch = response.match(/ACTION:\s*(\w+)/);
    const inputMatch = response.match(/ACTION_INPUT:\s*(\{[\s\S]*?\})/);

    if (actionMatch) {
      result.action = {
        tool: actionMatch[1],
        input: {},
        reasoning: result.thought || '',
      };

      if (inputMatch) {
        try {
          result.action.input = JSON.parse(inputMatch[1]);
        } catch {
          // Try to extract as plain text
          const simpleInput = inputMatch[1].replace(/[{}]/g, '').trim();
          result.action.input = { query: simpleInput };
        }
      }
    }

    return result;
  }

  /**
   * Update configuration
   */
  configure(config: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }
}

// ===========================================
// Convenience Functions
// ===========================================

/**
 * Create and execute a one-off agent task
 */
export async function executeAgentTask(
  task: AgentTask,
  config?: Partial<AgentConfig>
): Promise<AgentResult> {
  const agent = new ReActAgent(config);
  return agent.execute(task);
}

/**
 * Quick agent call for simple tasks
 */
export async function quickAgent(
  description: string,
  context: AIContext = 'personal',
  tools: string[] = []
): Promise<string> {
  const result = await executeAgentTask(
    { description, aiContext: context },
    { tools, maxIterations: 5 }
  );
  return result.answer;
}

// ===========================================
// Singleton Export
// ===========================================

export const defaultAgent = new ReActAgent();
