/**
 * WebhookRouter - Routes incoming webhooks to the correct connector,
 * deduplicates by payload hash (SHA-256, 5-min window), logs to DB,
 * and emits integration events to the EventSystem.
 */

import crypto from 'crypto';
import { queryPublic } from '../../utils/database-context';
import { emitSystemEvent } from '../event-system';
import { logger } from '../../utils/logger';
import type { Connector, RawWebhookEvent, IntegrationEvent } from './types';

export class WebhookRouter {
  private handlers: Map<string, Connector> = new Map();

  /**
   * Register a connector under the given connectorId.
   */
  register(connectorId: string, connector: Connector): void {
    this.handlers.set(connectorId, connector);
  }

  /**
   * Route an incoming raw webhook event to the appropriate connector.
   *
   * Steps:
   * 1. Find connector; return null if unknown or lacks handleWebhook.
   * 2. Compute SHA-256 hash of the body.
   * 3. Check DB for duplicate within 5-min window; return null if duplicate.
   * 4. Call connector.handleWebhook(rawEvent).
   * 5. Log to integration_webhook_log.
   * 6. If event returned, emit to EventSystem.
   * 7. Return the event or null.
   */
  async route(connectorId: string, rawEvent: RawWebhookEvent): Promise<IntegrationEvent | null> {
    // 1. Find connector
    const connector = this.handlers.get(connectorId);
    if (!connector) {
      logger.debug('WebhookRouter: unknown connector', { connectorId });
      return null;
    }
    if (!connector.handleWebhook) {
      logger.debug('WebhookRouter: connector has no handleWebhook', { connectorId });
      return null;
    }

    // 2. Compute SHA-256 hash of body
    const bodyBuffer = Buffer.isBuffer(rawEvent.body)
      ? rawEvent.body
      : Buffer.from(JSON.stringify(rawEvent.body));
    const payloadHash = crypto.createHash('sha256').update(bodyBuffer).digest('hex');

    // 3. Dedup check — look for same hash within 5 minutes
    const dedupResult = await queryPublic(
      `SELECT id FROM integration_webhook_log
       WHERE payload_hash = $1
         AND created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [payloadHash]
    );

    if (dedupResult.rows.length > 0) {
      logger.debug('WebhookRouter: duplicate webhook ignored', { connectorId, payloadHash });
      return null;
    }

    // 4. Call connector handler
    const startedAt = Date.now();
    let event: IntegrationEvent | null = null;
    let status = 'success';

    try {
      event = await connector.handleWebhook(rawEvent);
    } catch (err) {
      status = 'error';
      logger.error(
        'WebhookRouter: connector handleWebhook threw',
        err instanceof Error ? err : new Error(String(err)),
        { operation: 'webhook-router', connectorId },
      );
    }

    const processingTimeMs = Date.now() - startedAt;

    // 5. Log to integration_webhook_log
    try {
      await queryPublic(
        `INSERT INTO integration_webhook_log
           (connector_id, payload_hash, status, processing_time_ms)
         VALUES ($1, $2, $3, $4)`,
        [connectorId, payloadHash, status, processingTimeMs]
      );
    } catch (logErr) {
      logger.error(
        'WebhookRouter: failed to write webhook log',
        logErr instanceof Error ? logErr : new Error(String(logErr)),
        { operation: 'webhook-router', connectorId },
      );
    }

    // 6. Emit event to EventSystem if the connector returned one
    if (event) {
      await emitSystemEvent({
        context: event.targetContext,
        eventType: `integration.${event.type}`,
        eventSource: connectorId,
        payload: event.payload,
      });
    }

    // 7. Return event or null
    return event;
  }
}
