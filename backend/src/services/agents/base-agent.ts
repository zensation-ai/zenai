/**
 * Base Agent Interface & Common Types
 *
 * Defines the contract for all specialized agents in the
 * multi-agent orchestration system.
 *
 * @module services/agents/base-agent
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { getClaudeClient } from '../claude/client';
import { toolRegistry, ToolExecutionContext } from '../claude/tool-use';
import { sharedMemory, AgentRole, SharedEntryType } from '../memory/shared-memory';

// ===========================================
// Types & Interfaces
// ===========================================

export interface AgentConfig {
  /** Agent role identifier */
  role: AgentRole;
  /** Model ID to use */
  modelId: string;
  /** System prompt */
  systemPrompt: string;
  /** Available tools for this agent */
  tools: string[];
  /** Temperature (0-1) */
  temperature: number;
  /** Maximum output tokens */
  maxTokens: number;
  /** Maximum tool-use iterations */
  maxIterations: number;
  /** Optional persona prompt from DB identity (prepended to system prompt) */
  personaPrompt?: string;
}

export interface AgentInput {
  /** The task/instruction for this agent */
  task: string;
  /** Additional context */
  context?: string;
  /** AI context (personal/work) */
  aiContext: AIContext;
  /** Team ID for shared memory */
  teamId: string;
}

export interface AgentOutput {
  /** Agent role */
  role: AgentRole;
  /** Whether the agent succeeded */
  success: boolean;
  /** The agent's response */
  content: string;
  /** Tools used during execution */
  toolsUsed: string[];
  /** Tokens consumed */
  tokensUsed: { input: number; output: number };
  /** Execution time in ms */
  executionTimeMs: number;
  /** Error message if failed */
  error?: string;
}

// ===========================================
// Base Agent Class
// ===========================================

export abstract class BaseAgent {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  get role(): AgentRole {
    return this.config.role;
  }

  /** Timeout for agent execution in milliseconds */
  static AGENT_TIMEOUT_MS = 60_000;

  /** Maximum tokens (input + output) per agent execution */
  static MAX_TOKENS_PER_AGENT = 100_000;

  /**
   * Execute the agent's task with timeout enforcement
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Agent ${this.config.role} timed out after ${BaseAgent.AGENT_TIMEOUT_MS}ms`)),
        BaseAgent.AGENT_TIMEOUT_MS
      )
    );

    try {
      return await Promise.race([this._executeInternal(input), timeoutPromise]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMsg.includes('timed out');
      logger.error(`Agent ${this.config.role} ${isTimeout ? 'timed out' : 'failed'}`, error instanceof Error ? error : undefined);

      return {
        role: this.config.role,
        success: false,
        content: '',
        toolsUsed: [],
        tokensUsed: { input: 0, output: 0 },
        executionTimeMs: BaseAgent.AGENT_TIMEOUT_MS,
        error: errorMsg,
      };
    }
  }

  /**
   * Internal execution logic (wrapped by timeout in execute())
   */
  private async _executeInternal(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const toolsUsed: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      const client = getClaudeClient();

      // Build system prompt with shared memory context
      const sharedContext = sharedMemory.getContext(input.teamId, this.config.role);
      const fullSystemPrompt = this.buildSystemPrompt(input, sharedContext);

      // Prepare messages
      const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: input.task },
      ];

      // Get tool definitions
      const toolDefs = this.config.tools.length > 0
        ? toolRegistry.getDefinitionsFor(this.config.tools)
        : [];

      const execContext: ToolExecutionContext = {
        aiContext: input.aiContext,
      };

      // Iterative tool-use loop
      let finalContent = '';
      let iterations = 0;

      while (iterations < this.config.maxIterations) {
        iterations++;

        const params: Anthropic.MessageCreateParams = {
          model: this.config.modelId,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: fullSystemPrompt,
          messages,
        };

        if (toolDefs.length > 0) {
          params.tools = toolDefs as Anthropic.Tool[];
          params.tool_choice = { type: 'auto' };
        }

        const response = await client.messages.create(params);

        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;

        // Enforce token limit
        if (totalInputTokens + totalOutputTokens > BaseAgent.MAX_TOKENS_PER_AGENT) {
          logger.warn(`Agent ${this.config.role} exceeded token limit`, {
            totalInputTokens,
            totalOutputTokens,
            limit: BaseAgent.MAX_TOKENS_PER_AGENT,
          });
          // Collect any text we have so far
          const partialText = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('\n');
          if (partialText) finalContent = partialText;
          break;
        }

        // Process response blocks
        const textParts: string[] = [];
        const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            textParts.push(block.text);
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          finalContent = textParts.join('\n');
          break;
        }

        // Execute tool calls
        const toolResults: Array<{
          type: 'tool_result';
          tool_use_id: string;
          content: string;
          is_error?: boolean;
        }> = [];

        for (const call of toolCalls) {
          if (!toolsUsed.includes(call.name)) {
            toolsUsed.push(call.name);
          }

          try {
            const result = await toolRegistry.execute(call.name, call.input, execContext);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: result,
            });

            // Write finding to shared memory
            sharedMemory.write(
              input.teamId,
              this.config.role,
              'finding',
              `[${call.name}] ${result.substring(0, 500)}`,
              { tool: call.name, input: call.input }
            );
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            toolResults.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: `Error: ${errorMsg}`,
              is_error: true,
            });
          }
        }

        // Add to conversation
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });

        // If stop_reason is end_turn after processing tools, get final response
        if (response.stop_reason === 'end_turn' && textParts.length > 0) {
          finalContent = textParts.join('\n');
          break;
        }
      }

      // Write final output to shared memory
      sharedMemory.write(
        input.teamId,
        this.config.role,
        'artifact',
        finalContent.substring(0, 2000),
        { type: 'agent_output' }
      );

      logger.info(`Agent ${this.config.role} completed`, {
        teamId: input.teamId,
        iterations,
        toolsUsed,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });

      return {
        role: this.config.role,
        success: true,
        content: finalContent,
        toolsUsed,
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Agent ${this.config.role} failed`, error instanceof Error ? error : undefined);

      return {
        role: this.config.role,
        success: false,
        content: '',
        toolsUsed,
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
        executionTimeMs: Date.now() - startTime,
        error: errorMsg,
      };
    }
  }

  /**
   * Build the full system prompt including shared memory
   */
  protected buildSystemPrompt(input: AgentInput, sharedContext: string): string {
    const parts: string[] = [];

    // Prepend persona prompt from DB identity if available
    if (this.config.personaPrompt) {
      parts.push(this.config.personaPrompt);
      parts.push('');
    }

    parts.push(this.config.systemPrompt);

    if (input.context) {
      parts.push(`\n[ADDITIONAL CONTEXT]\n${input.context}`);
    }

    if (sharedContext) {
      parts.push(`\n${sharedContext}`);
    }

    return parts.join('\n');
  }

  /**
   * Write to shared memory
   */
  protected writeToSharedMemory(
    teamId: string,
    type: SharedEntryType,
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    sharedMemory.write(teamId, this.config.role, type, content, metadata);
  }
}
