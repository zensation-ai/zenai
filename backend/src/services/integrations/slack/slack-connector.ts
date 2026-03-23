import type { Connector, ConnectorDefinition, OAuthTokens, SyncOptions, SyncResult, HealthStatus, RawWebhookEvent, IntegrationEvent } from '../types';
import type { SlackConnectorTokens, AIContext } from './types';
import { DEFAULT_PROACTIVE_CONFIG } from './types';
import { queryPublic } from '../../../utils/database-context';
import { logger } from '../../../utils/logger';

export class SlackConnector implements Connector {
  definition: ConnectorDefinition = {
    id: 'slack',
    name: 'Slack',
    provider: 'slack',
    category: 'messaging',
    capabilities: [
      'messaging.read',
      'messaging.write',
      'messaging.sync',
      'messaging.webhook',
      'messaging.slash_commands',
    ],
    requiredScopes: [
      'channels:history',
      'channels:read',
      'chat:write',
      'commands',
      'reactions:read',
      'reactions:write',
      'users:read',
      'im:history',
      'im:read',
      'im:write',
      'groups:history',
      'groups:read',
    ],
    webhookSupported: true,
    syncSupported: true,
    defaultContext: 'work',
    icon: 'MessageSquare',
    description: 'Bidirectional Slack integration with proactive channel presence and autonomous workflows.',
  };

  async connect(userId: string, tokens: OAuthTokens): Promise<void> {
    const slackTokens = tokens as SlackConnectorTokens;
    const { botUserId, teamId, teamName } = slackTokens;

    if (!botUserId || !teamId) {
      throw new Error('SlackConnector.connect requires botUserId and teamId in tokens');
    }

    // Upsert workspace
    await queryPublic(
      `INSERT INTO public.slack_workspaces (user_id, team_id, team_name, bot_user_id, channel_context_mapping, proactive_config)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, team_id) DO UPDATE SET
         team_name = EXCLUDED.team_name,
         bot_user_id = EXCLUDED.bot_user_id,
         updated_at = NOW()
       RETURNING id`,
      [userId, teamId, teamName, botUserId, JSON.stringify({}), JSON.stringify(DEFAULT_PROACTIVE_CONFIG)],
    );

    logger.info('Slack workspace connected', { userId, teamId, teamName });
  }

  async disconnect(userId: string): Promise<void> {
    const wsResult = await queryPublic(
      'SELECT id FROM public.slack_workspaces WHERE user_id = $1',
      [userId],
    );

    if (wsResult.rows.length === 0) {
      logger.warn('Slack disconnect: no workspace found', { userId });
      return;
    }

    const workspaceId = wsResult.rows[0].id;

    // Cascade delete handles channels via FK
    await queryPublic('DELETE FROM public.slack_workspaces WHERE id = $1', [workspaceId]);

    logger.info('Slack workspace disconnected', { userId, workspaceId });
  }

  async sync(userId: string, _options: SyncOptions): Promise<SyncResult> {
    const start = Date.now();
    const itemsSynced = 0;
    let errors = 0;

    try {
      const wsResult = await queryPublic(
        'SELECT id, team_id FROM public.slack_workspaces WHERE user_id = $1',
        [userId],
      );

      if (wsResult.rows.length === 0) {
        return { itemsSynced: 0, errors: 1, duration: Date.now() - start };
      }

      const workspaceId = wsResult.rows[0].id;

      // Get channels to sync
      const channelResult = await queryPublic(
        'SELECT channel_id, channel_name, target_context, last_sync_cursor FROM public.slack_channels WHERE workspace_id = $1',
        [workspaceId],
      );

      for (const channel of channelResult.rows) {
        try {
          // In real implementation: call Slack API conversations.history
          // For now, sync logic is a placeholder that subclasses/callers extend
          const targetContext = (channel.target_context || 'work') as AIContext;
          logger.debug('Syncing channel', { channelId: channel.channel_id, targetContext });
        } catch (err) {
          errors++;
          logger.error('Error syncing channel', err instanceof Error ? err : undefined, { channelId: channel.channel_id });
        }
      }

      // Update last sync
      await queryPublic(
        'UPDATE public.slack_workspaces SET updated_at = NOW() WHERE id = $1',
        [workspaceId],
      );
    } catch (err) {
      errors++;
      logger.error('Slack sync failed', err instanceof Error ? err : undefined, { userId });
    }

    return { itemsSynced, errors, duration: Date.now() - start };
  }

  async health(userId: string): Promise<HealthStatus> {
    try {
      const wsResult = await queryPublic(
        'SELECT id, team_name, created_at FROM public.slack_workspaces WHERE user_id = $1',
        [userId],
      );

      if (wsResult.rows.length === 0) {
        return { connected: false, tokenValid: false };
      }

      return {
        connected: true,
        tokenValid: true,
        lastSync: wsResult.rows[0].created_at ? new Date(wsResult.rows[0].created_at) : undefined,
      };
    } catch (err) {
      logger.error('Slack health check failed', err instanceof Error ? err : undefined, { userId });
      return { connected: false, tokenValid: false, error: String(err) };
    }
  }

  async handleWebhook(_event: RawWebhookEvent): Promise<IntegrationEvent | null> {
    // Slack webhooks are handled by Bolt.js directly (see slack-bot.ts).
    // This method exists for Connector interface compliance only.
    return null;
  }
}
