import { queryPublic } from '../../utils/database';
import { logger } from '../../utils/logger';
import { checkedFetch } from '../../utils/checked-http';

export interface AgentSkill {
  name: string;
  description: string;
  inputModes?: string[];
  outputModes?: string[];
}

export interface IndexedAgent {
  id: string;
  url: string;
  name: string;
  description: string;
  skills: AgentSkill[];
  successRate: number;
  avgResponseTimeMs: number;
  totalExecutions: number;
  lastHealthCheck: Date | null;
  isHealthy: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskMatch {
  agent: IndexedAgent;
  relevanceScore: number;
  matchedSkills: string[];
}

function rowToAgent(row: Record<string, unknown>): IndexedAgent {
  return {
    id: row.id as string,
    url: row.url as string,
    name: row.name as string,
    description: row.description as string,
    skills: (row.skills as AgentSkill[]) || [],
    successRate: Number(row.success_rate) || 0,
    avgResponseTimeMs: Number(row.avg_response_time_ms) || 0,
    totalExecutions: Number(row.total_executions) || 0,
    lastHealthCheck: row.last_health_check ? new Date(row.last_health_check as string) : null,
    isHealthy: Boolean(row.is_healthy),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class CapabilityIndex {
  async indexAgent(url: string): Promise<IndexedAgent> {
    logger.info(`Indexing agent at ${url}`);

    const response = await checkedFetch(`${url}/.well-known/agent.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent card from ${url}: ${response.status}`);
    }

    const card = await response.json() as Record<string, unknown>;
    const name = card.name || 'Unknown Agent';
    const description = card.description || '';
    const skills: AgentSkill[] = ((card.skills || []) as Record<string, unknown>[]).map((s: Record<string, unknown>) => ({
      name: s.name as string,
      description: s.description as string,
      inputModes: s.inputModes as string[] | undefined,
      outputModes: s.outputModes as string[] | undefined,
    }));

    const result = await queryPublic(
      `INSERT INTO agent_capability_index (url, name, description, skills, is_healthy, last_health_check)
       VALUES ($1, $2, $3, $4, true, NOW())
       ON CONFLICT (url) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         skills = EXCLUDED.skills,
         is_healthy = true,
         last_health_check = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [url, name, description, JSON.stringify(skills)]
    );

    const agent = rowToAgent(result.rows[0]);
    logger.info(`Indexed agent: ${agent.name} (${agent.id})`);
    return agent;
  }

  async findAgentsForTask(description: string): Promise<TaskMatch[]> {
    const result = await queryPublic(
      `SELECT * FROM agent_capability_index WHERE is_healthy = true`
    );

    if (result.rows.length === 0) {
      return [];
    }

    const descriptionWords = description.toLowerCase().split(/\s+/).filter(Boolean);
    if (descriptionWords.length === 0) {
      return [];
    }

    const matches: TaskMatch[] = [];

    for (const row of result.rows) {
      const agent = rowToAgent(row);
      const matchedSkills: string[] = [];
      let matchCount = 0;

      for (const skill of agent.skills) {
        const skillWords = `${skill.name} ${skill.description}`.toLowerCase().split(/\s+/);
        const hasOverlap = descriptionWords.some((word) => skillWords.includes(word));
        if (hasOverlap) {
          matchedSkills.push(skill.name);
          const overlap = descriptionWords.filter((word) => skillWords.includes(word));
          matchCount += overlap.length;
        }
      }

      if (matchedSkills.length > 0) {
        const relevanceScore = matchCount / descriptionWords.length;
        matches.push({ agent, relevanceScore, matchedSkills });
      }
    }

    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return matches.slice(0, 10);
  }

  async findAgentsBySkill(skillName: string): Promise<IndexedAgent[]> {
    const result = await queryPublic(
      `SELECT * FROM agent_capability_index WHERE skills::text ILIKE '%' || $1 || '%'`,
      [skillName]
    );

    return result.rows.map(rowToAgent);
  }

  async recordExecution(agentId: string, success: boolean, responseTimeMs: number): Promise<void> {
    await queryPublic(
      `UPDATE agent_capability_index SET
         total_executions = total_executions + 1,
         success_rate = success_rate * 0.9 + $2 * 0.1,
         avg_response_time_ms = avg_response_time_ms * 0.9 + $3 * 0.1,
         updated_at = NOW()
       WHERE id = $1`,
      [agentId, success ? 1 : 0, responseTimeMs]
    );

    logger.debug(`Recorded execution for agent ${agentId}: success=${success}, time=${responseTimeMs}ms`);
  }

  async refreshAll(): Promise<{ healthy: number; unhealthy: number }> {
    const result = await queryPublic(`SELECT * FROM agent_capability_index`);
    let healthy = 0;
    let unhealthy = 0;

    for (const row of result.rows) {
      const agent = rowToAgent(row);
      let isHealthy = false;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await checkedFetch(`${agent.url}/.well-known/agent.json`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        isHealthy = response.ok;
      } catch {
        isHealthy = false;
      }

      await queryPublic(
        `UPDATE agent_capability_index SET
           is_healthy = $2,
           last_health_check = NOW(),
           updated_at = NOW()
         WHERE id = $1`,
        [agent.id, isHealthy]
      );

      if (isHealthy) {
        healthy++;
      } else {
        unhealthy++;
      }
    }

    logger.info(`Refresh complete: ${healthy} healthy, ${unhealthy} unhealthy`);
    return { healthy, unhealthy };
  }

  async getLeaderboard(limit: number = 10): Promise<IndexedAgent[]> {
    const result = await queryPublic(
      `SELECT * FROM agent_capability_index
       WHERE is_healthy = true
       ORDER BY success_rate DESC, total_executions DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(rowToAgent);
  }
}

export const capabilityIndex = new CapabilityIndex();
