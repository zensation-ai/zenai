import { queryPublic } from '../../utils/database';
import { logger } from '../../utils/logger';

export type CompositeOperator = 'AND' | 'OR' | 'SEQUENCE';

export interface CompositeTrigger {
  operator: CompositeOperator;
  conditions: Array<{ type: string; config: Record<string, unknown> }>;
  timeWindowMs?: number; // For SEQUENCE: max time between conditions
}

export interface ContextState {
  busyCalendar: boolean;
  focusMode: boolean;
  currentContext: string;
  timeOfDay: number; // 0-23
}

export interface TriggerChain {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  condition: 'on_success' | 'on_failure' | 'always';
  delayMs: number;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
}

export interface TriggerEvent {
  type: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

function rowToChain(row: Record<string, unknown>): TriggerChain {
  return {
    id: row.id as string,
    sourceAgentId: row.source_agent_id as string,
    targetAgentId: row.target_agent_id as string,
    condition: row.condition as TriggerChain['condition'],
    delayMs: (row.delay_ms as number) ?? 0,
    config: (row.config as Record<string, unknown>) ?? {},
    enabled: row.enabled as boolean,
    createdAt: new Date(row.created_at as string),
  };
}

export class SmartTriggerEngine {
  matchCompositeTrigger(
    trigger: CompositeTrigger,
    event: TriggerEvent,
    recentEvents?: TriggerEvent[],
  ): boolean {
    const { operator, conditions, timeWindowMs } = trigger;

    if (conditions.length === 0) {
      return false;
    }

    switch (operator) {
      case 'AND':
        return conditions.every((c) => c.type === event.type);

      case 'OR':
        return conditions.some((c) => c.type === event.type);

      case 'SEQUENCE': {
        if (!recentEvents || recentEvents.length === 0) {
          return false;
        }

        const window = timeWindowMs ?? 3600000; // default 1 hour
        const allEvents = [...recentEvents, event];

        // Find an ordered subsequence of events matching each condition within the time window
        let condIdx = 0;
        let firstMatchTime: number | null = null;

        for (const evt of allEvents) {
          if (condIdx >= conditions.length) break;

          if (evt.type === conditions[condIdx].type) {
            if (condIdx === 0) {
              firstMatchTime = evt.timestamp.getTime();
            }

            // Check time window from first match
            if (
              firstMatchTime !== null &&
              evt.timestamp.getTime() - firstMatchTime > window
            ) {
              return false;
            }

            condIdx++;
          }
        }

        return condIdx >= conditions.length;
      }

      default:
        logger.warn(`Unknown composite operator: ${operator}`);
        return false;
    }
  }

  evaluateContextRules(contextState: ContextState): {
    action: 'execute' | 'skip' | 'delay';
    reason: string;
    delayMs?: number;
  } {
    const { busyCalendar, focusMode } = contextState;

    if (busyCalendar && focusMode) {
      return {
        action: 'skip',
        reason: 'User is in focus mode with a busy calendar',
      };
    }

    if (focusMode) {
      return {
        action: 'delay',
        reason: 'User is in focus mode, delaying 30 minutes',
        delayMs: 30 * 60 * 1000,
      };
    }

    if (busyCalendar) {
      return {
        action: 'delay',
        reason: 'Calendar is busy, delaying 10 minutes',
        delayMs: 10 * 60 * 1000,
      };
    }

    return {
      action: 'execute',
      reason: 'No blocking context detected',
    };
  }

  async processTriggerChains(
    sourceAgentId: string,
    executionResult: { success: boolean; rating?: number },
  ): Promise<TriggerChain[]> {
    try {
      const result = await queryPublic(
        `SELECT * FROM agent_trigger_chains WHERE source_agent_id = $1 AND enabled = true`,
        [sourceAgentId],
      );

      const chains: TriggerChain[] = (result.rows || []).map(rowToChain);

      return chains.filter((chain) => {
        if (chain.condition === 'always') return true;
        if (chain.condition === 'on_success' && executionResult.success) return true;
        if (chain.condition === 'on_failure' && !executionResult.success) return true;
        return false;
      });
    } catch (error) {
      logger.error('Failed to process trigger chains', error instanceof Error ? error : undefined);
      return [];
    }
  }

  async createChain(
    chain: Omit<TriggerChain, 'id' | 'createdAt'>,
  ): Promise<TriggerChain> {
    const result = await queryPublic(
      `INSERT INTO agent_trigger_chains (source_agent_id, target_agent_id, condition, delay_ms, config, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        chain.sourceAgentId,
        chain.targetAgentId,
        chain.condition,
        chain.delayMs,
        JSON.stringify(chain.config),
        chain.enabled,
      ],
    );

    return rowToChain(result.rows[0]);
  }

  async deleteChain(id: string): Promise<void> {
    await queryPublic(
      `DELETE FROM agent_trigger_chains WHERE id = $1`,
      [id],
    );

    logger.info('Deleted trigger chain', { id });
  }

  async listChains(agentId?: string): Promise<TriggerChain[]> {
    let sql = 'SELECT * FROM agent_trigger_chains';
    const params: string[] = [];

    if (agentId) {
      sql += ' WHERE source_agent_id = $1';
      params.push(agentId);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await queryPublic(sql, params);
    return (result.rows || []).map(rowToChain);
  }
}

export const smartTriggerEngine = new SmartTriggerEngine();
