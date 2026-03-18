/**
 * A2A Server - JSON-RPC 2.0 Handler
 *
 * Implements the A2A protocol server-side, handling JSON-RPC 2.0
 * requests for task management operations.
 *
 * Supported methods:
 * - tasks/send: Create a new task
 * - tasks/get: Get task status
 * - tasks/cancel: Cancel a task
 * - tasks/sendSubscribe: Create task + return SSE stream info
 *
 * @module services/a2a/a2a-server
 */

import { AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { a2aTaskManager, A2ATask, A2AMessage } from './task-manager';
import { isValidSkill } from './agent-card';

// ===========================================
// JSON-RPC Types
// ===========================================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// JSON-RPC Error Codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

// ===========================================
// A2AServer
// ===========================================

export class A2AServer {
  /**
   * Handle an incoming JSON-RPC 2.0 request
   */
  async handleRequest(request: JsonRpcRequest, context: AIContext): Promise<JsonRpcResponse> {
    if (request.jsonrpc !== '2.0') {
      return this.errorResponse(request.id, INVALID_REQUEST, 'Invalid JSON-RPC version');
    }

    if (!request.method) {
      return this.errorResponse(request.id, INVALID_REQUEST, 'Method is required');
    }

    try {
      switch (request.method) {
        case 'tasks/send':
          return await this.handleTasksSend(request, context);

        case 'tasks/get':
          return await this.handleTasksGet(request, context);

        case 'tasks/cancel':
          return await this.handleTasksCancel(request, context);

        case 'tasks/sendSubscribe':
          return await this.handleTasksSendSubscribe(request, context);

        default:
          return this.errorResponse(request.id, METHOD_NOT_FOUND, `Method not found: ${request.method}`);
      }
    } catch (error) {
      logger.error('A2A server error', error instanceof Error ? error : undefined, {
        operation: 'a2a-server',
        method: request.method,
      });

      return this.errorResponse(
        request.id,
        INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Internal server error'
      );
    }
  }

  /**
   * Handle tasks/send - Create a new task
   */
  private async handleTasksSend(request: JsonRpcRequest, context: AIContext): Promise<JsonRpcResponse> {
    const params = request.params;

    if (!params?.skill_id || !params?.message) {
      return this.errorResponse(request.id, INVALID_PARAMS, 'skill_id and message are required');
    }

    const skillId = params.skill_id as string;
    if (!isValidSkill(skillId)) {
      return this.errorResponse(request.id, INVALID_PARAMS, `Invalid skill_id: ${skillId}`);
    }

    const task = await a2aTaskManager.createTask(context, {
      skill_id: skillId,
      message: params.message as A2AMessage,
      metadata: (params.metadata as Record<string, unknown>) || {},
      caller_agent_url: params.caller_agent_url as string | undefined,
      caller_agent_name: params.caller_agent_name as string | undefined,
      external_task_id: params.external_task_id as string | undefined,
    });

    return this.successResponse(request.id, { task: this.formatTask(task) });
  }

  /**
   * Handle tasks/get - Get task status
   */
  private async handleTasksGet(request: JsonRpcRequest, context: AIContext): Promise<JsonRpcResponse> {
    const params = request.params;

    if (!params?.task_id) {
      return this.errorResponse(request.id, INVALID_PARAMS, 'task_id is required');
    }

    const task = await a2aTaskManager.getTask(context, params.task_id as string);
    if (!task) {
      return this.errorResponse(request.id, INVALID_PARAMS, 'Task not found');
    }

    return this.successResponse(request.id, { task: this.formatTask(task) });
  }

  /**
   * Handle tasks/cancel - Cancel a task
   */
  private async handleTasksCancel(request: JsonRpcRequest, context: AIContext): Promise<JsonRpcResponse> {
    const params = request.params;

    if (!params?.task_id) {
      return this.errorResponse(request.id, INVALID_PARAMS, 'task_id is required');
    }

    await a2aTaskManager.cancelTask(context, params.task_id as string);
    return this.successResponse(request.id, { success: true });
  }

  /**
   * Handle tasks/sendSubscribe - Create task and return task ID for SSE streaming
   * (SSE streaming is handled at the route level, this just creates the task)
   */
  private async handleTasksSendSubscribe(request: JsonRpcRequest, context: AIContext): Promise<JsonRpcResponse> {
    const params = request.params;

    if (!params?.skill_id || !params?.message) {
      return this.errorResponse(request.id, INVALID_PARAMS, 'skill_id and message are required');
    }

    const skillId = params.skill_id as string;
    if (!isValidSkill(skillId)) {
      return this.errorResponse(request.id, INVALID_PARAMS, `Invalid skill_id: ${skillId}`);
    }

    const task = await a2aTaskManager.createTask(context, {
      skill_id: skillId,
      message: params.message as A2AMessage,
      metadata: (params.metadata as Record<string, unknown>) || {},
      caller_agent_url: params.caller_agent_url as string | undefined,
      caller_agent_name: params.caller_agent_name as string | undefined,
      external_task_id: params.external_task_id as string | undefined,
    });

    return this.successResponse(request.id, {
      task: this.formatTask(task),
      streamUrl: `/api/a2a/tasks/${task.id}/stream`,
    });
  }

  /**
   * Format task for JSON-RPC response
   */
  private formatTask(task: A2ATask): Record<string, unknown> {
    return {
      id: task.id,
      status: task.status,
      skill_id: task.skill_id,
      message: task.message,
      artifacts: task.artifacts,
      metadata: task.metadata,
      error_message: task.error_message,
      tokens_used: task.tokens_used,
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at,
    };
  }

  /**
   * Create a success JSON-RPC response
   */
  private successResponse(id: string | number | undefined, result: unknown): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  /**
   * Create an error JSON-RPC response
   */
  private errorResponse(id: string | number | undefined, code: number, message: string, data?: unknown): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
  }
}

// Export singleton instance
export const a2aServer = new A2AServer();
