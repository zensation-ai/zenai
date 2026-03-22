/**
 * IntegrationRegistry - Phase 6
 *
 * Central registry for all integration connectors.
 * Handles connector registration, user installation tracking, and lifecycle management.
 */

import { queryPublic } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import {
  SYNC_INTERVAL_MIN,
  SYNC_INTERVAL_MAX,
} from './types';
import type {
  Connector,
  ConnectorDefinition,
  IntegrationCategory,
  IntegrationConfig,
  UserIntegration,
  HealthStatus,
} from './types';

export interface ListFilter {
  category?: IntegrationCategory;
  provider?: string;
}

export class IntegrationRegistry {
  private connectors: Map<string, Connector> = new Map();

  /** Register a connector so it can be installed by users. */
  register(connector: Connector): void {
    const { id } = connector.definition;
    this.connectors.set(id, connector);
    logger.info(`IntegrationRegistry: registered connector '${id}'`);
  }

  /** Retrieve a connector by its definition ID. Returns undefined if not found. */
  get(connectorId: string): Connector | undefined {
    return this.connectors.get(connectorId);
  }

  /** List all registered connectors, optionally filtered by category or provider. */
  list(filter?: ListFilter): Connector[] {
    let result = Array.from(this.connectors.values());

    if (filter?.category !== undefined) {
      result = result.filter((c) => c.definition.category === filter.category);
    }

    if (filter?.provider !== undefined) {
      result = result.filter((c) => c.definition.provider === filter.provider);
    }

    return result;
  }

  /**
   * Install a connector for a user. Upserts the user_integrations row.
   * Throws if the connector is not registered.
   */
  async install(
    userId: string,
    connectorId: string,
    config: IntegrationConfig = { targetContext: 'personal', syncEnabled: true },
  ): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`IntegrationRegistry: unknown connector '${connectorId}'`);
    }

    const { targetContext, syncEnabled, syncIntervalMinutes } = config;
    const interval = syncIntervalMinutes ?? connector.definition.defaultContext ? undefined : undefined;

    await queryPublic(
      `INSERT INTO public.user_integrations
         (user_id, connector_id, status, target_context, sync_enabled, sync_interval_minutes)
       VALUES ($1, $2, 'disconnected', $3, $4, $5)
       ON CONFLICT (user_id, connector_id)
       DO UPDATE SET
         target_context = EXCLUDED.target_context,
         sync_enabled = EXCLUDED.sync_enabled,
         sync_interval_minutes = EXCLUDED.sync_interval_minutes`,
      [userId, connectorId, targetContext, syncEnabled, interval ?? null],
    );

    logger.info(`IntegrationRegistry: installed connector '${connectorId}' for user '${userId}'`);
  }

  /**
   * Uninstall a connector for a user.
   * Calls connector.disconnect() first, then deletes the user_integrations row.
   */
  async uninstall(userId: string, connectorId: string): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (connector) {
      await connector.disconnect(userId);
    }

    await queryPublic(
      `DELETE FROM public.user_integrations
       WHERE user_id = $1 AND connector_id = $2`,
      [userId, connectorId],
    );

    logger.info(`IntegrationRegistry: uninstalled connector '${connectorId}' for user '${userId}'`);
  }

  /** Return all integrations for a user with their connector definitions attached. */
  async getForUser(userId: string): Promise<UserIntegration[]> {
    const { rows } = await queryPublic(
      `SELECT connector_id, status, target_context, sync_enabled, sync_interval_minutes,
              last_sync_at, error
       FROM public.user_integrations
       WHERE user_id = $1`,
      [userId],
    );

    const integrations: UserIntegration[] = [];

    for (const row of rows) {
      const connectorId = row['connector_id'] as string;
      const connector = this.connectors.get(connectorId);

      if (!connector) {
        logger.warn(`IntegrationRegistry: skipping unknown connector '${connectorId}' for user '${userId}'`);
        continue;
      }

      integrations.push({
        connectorId,
        definition: connector.definition,
        status: row['status'] as UserIntegration['status'],
        config: {
          targetContext: row['target_context'] as IntegrationConfig['targetContext'],
          syncEnabled: row['sync_enabled'] as boolean,
          syncIntervalMinutes: row['sync_interval_minutes'] as number | undefined,
        },
        lastSyncAt: row['last_sync_at'] ? new Date(row['last_sync_at'] as string) : undefined,
        error: row['error'] as string | undefined,
      });
    }

    return integrations;
  }

  /** Update a user's integration configuration. Clamps syncIntervalMinutes to [5, 1440]. */
  async updateConfig(
    userId: string,
    connectorId: string,
    config: IntegrationConfig,
  ): Promise<void> {
    const { targetContext, syncEnabled } = config;

    let syncIntervalMinutes = config.syncIntervalMinutes;
    if (syncIntervalMinutes !== undefined) {
      syncIntervalMinutes = Math.max(SYNC_INTERVAL_MIN, Math.min(SYNC_INTERVAL_MAX, syncIntervalMinutes));
    }

    await queryPublic(
      `UPDATE public.user_integrations
       SET target_context = $3,
           sync_enabled = $4,
           sync_interval_minutes = $5,
           updated_at = NOW()
       WHERE user_id = $1 AND connector_id = $2`,
      [userId, connectorId, targetContext, syncEnabled, syncIntervalMinutes ?? null],
    );

    logger.info(`IntegrationRegistry: updated config for connector '${connectorId}', user '${userId}'`);
  }

  /** Delegate health check to the connector implementation. */
  async health(userId: string, connectorId: string): Promise<HealthStatus> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      return { connected: false, tokenValid: false, error: `Unknown connector '${connectorId}'` };
    }
    return connector.health(userId);
  }
}

/** Singleton registry instance for the application. */
export const integrationRegistry = new IntegrationRegistry();
