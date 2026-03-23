import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

const CONTEXTS: AIContext[] = ['personal', 'work', 'learning', 'creative'];

export async function seedEmailWorkflowConfig(): Promise<void> {
  for (const context of CONTEXTS) {
    try {
      const existing = await queryContext(context,
        "SELECT id FROM memory_settings WHERE key = 'email_workflow_enabled'",
        []
      );
      if (existing.rows.length === 0) {
        await queryContext(context,
          "INSERT INTO memory_settings (key, value) VALUES ('email_workflow_enabled', 'true') ON CONFLICT DO NOTHING",
          []
        );
        logger.info('Email workflow config seeded', { context });
      }
    } catch (err) {
      logger.debug('Email workflow config seeding skipped', { context, error: (err as Error).message });
    }
  }
}
