/**
 * A2A Client
 *
 * Client for communicating with external A2A-compatible agents.
 * Handles agent discovery, task sending, and external agent management.
 *
 * Uses built-in Node.js fetch for HTTP calls.
 *
 * @module services/a2a/a2a-client
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { A2AAgentCard } from './agent-card';

// ===========================================
// Types
// ===========================================

export interface ExternalAgent {
  id: string;
  name: string;
  description?: string;
  url: string;
  agent_card?: A2AAgentCard;
  skills: unknown[];
  auth_type: string;
  auth_token?: string;
  is_active: boolean;
  last_health_check?: string;
  health_status: string;
  created_at: string;
  updated_at: string;
}

export interface RegisterAgentRequest {
  name: string;
  description?: string;
  url: string;
  auth_type?: string;
  auth_token?: string;
}

export interface HealthResult {
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTimeMs: number;
  agentCard?: A2AAgentCard;
  error?: string;
}

// ===========================================
// A2AClient
// ===========================================

export class A2AClient {
  private readonly timeout = 10000; // 10 second timeout

  /**
   * Discover an agent by fetching its Agent Card
   */
  async discoverAgent(url: string): Promise<A2AAgentCard> {
    const agentCardUrl = `${url.replace(/\/$/, '')}/.well-known/agent.json`;

    try {
      const response = await fetch(agentCardUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Agent discovery failed: HTTP ${response.status}`);
      }

      const card = await response.json() as A2AAgentCard;

      if (!card.name || !card.skills) {
        throw new Error('Invalid agent card: missing required fields');
      }

      return card;
    } catch (error) {
      logger.error('A2A agent discovery failed', error instanceof Error ? error : undefined, {
        operation: 'a2a-client',
        url: agentCardUrl,
      });
      throw error;
    }
  }

  /**
   * Send a task to an external A2A agent
   */
  async sendTask(
    agentUrl: string,
    skillId: string,
    message: Record<string, unknown>,
    authToken?: string
  ): Promise<Record<string, unknown>> {
    const taskUrl = `${agentUrl.replace(/\/$/, '')}/api/a2a/tasks`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      const response = await fetch(taskUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          skill_id: skillId,
          message,
          caller_agent_url: process.env.API_URL || 'http://localhost:3000',
          caller_agent_name: 'ZenAI Agent',
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Task send failed: HTTP ${response.status} - ${errorBody}`);
      }

      return await response.json() as Record<string, unknown>;
    } catch (error) {
      logger.error('A2A send task failed', error instanceof Error ? error : undefined, {
        operation: 'a2a-client',
        agentUrl,
        skillId,
      });
      throw error;
    }
  }

  /**
   * Get the status of a task on an external agent
   */
  async getTaskStatus(
    agentUrl: string,
    taskId: string,
    authToken?: string
  ): Promise<Record<string, unknown>> {
    const statusUrl = `${agentUrl.replace(/\/$/, '')}/api/a2a/tasks/${taskId}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Task status fetch failed: HTTP ${response.status}`);
      }

      return await response.json() as Record<string, unknown>;
    } catch (error) {
      logger.error('A2A get task status failed', error instanceof Error ? error : undefined, {
        operation: 'a2a-client',
        agentUrl,
        taskId,
      });
      throw error;
    }
  }

  /**
   * Cancel a task on an external agent
   */
  async cancelTask(
    agentUrl: string,
    taskId: string,
    authToken?: string
  ): Promise<void> {
    const cancelUrl = `${agentUrl.replace(/\/$/, '')}/api/a2a/tasks/${taskId}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      const response = await fetch(cancelUrl, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Task cancel failed: HTTP ${response.status}`);
      }
    } catch (error) {
      logger.error('A2A cancel task failed', error instanceof Error ? error : undefined, {
        operation: 'a2a-client',
        agentUrl,
        taskId,
      });
      throw error;
    }
  }

  // ===========================================
  // External Agent Management
  // ===========================================

  /**
   * Register an external A2A agent in the database
   */
  async registerAgent(context: AIContext, agent: RegisterAgentRequest): Promise<ExternalAgent> {
    // Try to discover the agent card first
    let agentCard: A2AAgentCard | null = null;
    let skills: unknown[] = [];

    try {
      agentCard = await this.discoverAgent(agent.url);
      skills = agentCard.skills || [];
    } catch {
      logger.warn('Could not discover agent card during registration', {
        operation: 'a2a-client',
        url: agent.url,
      });
    }

    const result = await queryContext(
      context,
      `INSERT INTO a2a_external_agents (name, description, url, agent_card, skills, auth_type, auth_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        agent.name,
        agent.description || null,
        agent.url,
        agentCard ? JSON.stringify(agentCard) : null,
        JSON.stringify(skills),
        agent.auth_type || 'bearer',
        agent.auth_token || null,
      ]
    );

    return this.rowToAgent(result.rows[0]);
  }

  /**
   * List all registered external agents
   */
  async listAgents(context: AIContext): Promise<ExternalAgent[]> {
    const result = await queryContext(
      context,
      'SELECT * FROM a2a_external_agents WHERE is_active = true ORDER BY created_at DESC'
    );

    return result.rows.map(row => this.rowToAgent(row));
  }

  /**
   * Remove an external agent
   */
  async removeAgent(context: AIContext, agentId: string): Promise<void> {
    const result = await queryContext(
      context,
      'DELETE FROM a2a_external_agents WHERE id = $1 RETURNING id',
      [agentId]
    );

    if (result.rows.length === 0) {
      throw new Error(`External agent ${agentId} not found`);
    }

    logger.info('External A2A agent removed', {
      operation: 'a2a-client',
      agentId,
    });
  }

  /**
   * Health check an external agent
   */
  async healthCheck(context: AIContext, agentId: string): Promise<HealthResult> {
    // Get agent from DB
    const agentResult = await queryContext(
      context,
      'SELECT * FROM a2a_external_agents WHERE id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      throw new Error(`External agent ${agentId} not found`);
    }

    const agent = this.rowToAgent(agentResult.rows[0]);
    const startTime = Date.now();

    let healthResult: HealthResult;

    try {
      const agentCard = await this.discoverAgent(agent.url);
      const responseTimeMs = Date.now() - startTime;

      healthResult = {
        status: 'healthy',
        responseTimeMs,
        agentCard,
      };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;

      healthResult = {
        status: 'unhealthy',
        responseTimeMs,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Update health status in DB
    await queryContext(
      context,
      `UPDATE a2a_external_agents SET
        last_health_check = NOW(),
        health_status = $1,
        agent_card = COALESCE($2, agent_card),
        skills = COALESCE($3, skills),
        updated_at = NOW()
       WHERE id = $4`,
      [
        healthResult.status,
        healthResult.agentCard ? JSON.stringify(healthResult.agentCard) : null,
        healthResult.agentCard?.skills ? JSON.stringify(healthResult.agentCard.skills) : null,
        agentId,
      ]
    );

    return healthResult;
  }

  /**
   * Convert a database row to an ExternalAgent object
   */
  private rowToAgent(row: Record<string, unknown>): ExternalAgent {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      url: row.url as string,
      agent_card: row.agent_card ? (typeof row.agent_card === 'string' ? JSON.parse(row.agent_card) : row.agent_card) : undefined,
      skills: row.skills ? (typeof row.skills === 'string' ? JSON.parse(row.skills) : row.skills) as unknown[] : [],
      auth_type: (row.auth_type as string) || 'bearer',
      auth_token: row.auth_token as string | undefined,
      is_active: row.is_active as boolean,
      last_health_check: row.last_health_check as string | undefined,
      health_status: (row.health_status as string) || 'unknown',
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}

// Export singleton instance
export const a2aClient = new A2AClient();
