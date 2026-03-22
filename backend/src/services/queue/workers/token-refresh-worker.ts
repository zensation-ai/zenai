import { OAuthTokenStore } from '../../integrations/oauth-token-store';
import { queryPublic } from '../../../utils/database-context';
import { logger } from '../../../utils/logger';

interface BullJob {
  data: Record<string, unknown>;
  updateProgress(progress: number | Record<string, unknown>): Promise<void>;
}

let tokenStore: OAuthTokenStore | null = null;

function getTokenStore(): OAuthTokenStore {
  if (!tokenStore) {
    tokenStore = new OAuthTokenStore();
  }
  return tokenStore;
}

export async function processTokenRefresh(
  job: BullJob,
): Promise<{ refreshed: number; failed: number }> {
  logger.info('Token refresh job started', { operation: 'token-refresh-worker' });
  await job.updateProgress(10);

  const expiring = await getTokenStore().findExpiringTokens(5);
  if (expiring.length === 0) {
    await job.updateProgress(100);
    return { refreshed: 0, failed: 0 };
  }

  let refreshed = 0;
  let failed = 0;

  for (const token of expiring) {
    try {
      await getTokenStore().getValidToken(token.userId, token.connectorId);
      refreshed++;
    } catch (error) {
      failed++;
      logger.warn('Token refresh failed', {
        operation: 'token-refresh-worker',
        userId: token.userId,
        connectorId: token.connectorId,
      });

      await queryPublic(
        `UPDATE public.user_integrations
         SET status = $1, error_message = $2, updated_at = NOW()
         WHERE user_id = $3 AND connector_id = $4`,
        [
          'error',
          error instanceof Error ? error.message : 'Token refresh failed',
          token.userId,
          token.connectorId,
        ],
      );
    }
  }

  await job.updateProgress(100);
  return { refreshed, failed };
}
