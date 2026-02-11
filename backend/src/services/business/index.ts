/**
 * Business Module Index
 *
 * Exports all business connectors and provides initialization function.
 *
 * @module services/business
 */

import { logger } from '../../utils/logger';
import { stripeConnector } from './stripe-connector';
import { gscConnector } from './gsc-connector';
import { ga4Connector } from './ga4-connector';
import { uptimeConnector } from './uptime-connector';
import { lighthouseConnector } from './lighthouse-connector';
import { dataAggregator } from './data-aggregator';
import { insightGenerator } from './insight-generator';
import { reportGenerator } from './report-generator';

// Re-export all connectors
export { stripeConnector } from './stripe-connector';
export { gscConnector } from './gsc-connector';
export { ga4Connector } from './ga4-connector';
export { uptimeConnector } from './uptime-connector';
export { lighthouseConnector } from './lighthouse-connector';
export { dataAggregator } from './data-aggregator';
export { insightGenerator } from './insight-generator';
export { reportGenerator } from './report-generator';

/**
 * Initialize all business connectors.
 * Called during server startup in main.ts.
 * Each connector handles its own configuration gracefully.
 */
export async function initializeBusinessConnectors(): Promise<void> {
  logger.info('[Business] Initializing business connectors...');

  const connectors = [
    { name: 'Stripe', init: () => stripeConnector.initialize() },
    { name: 'Google Search Console', init: () => gscConnector.initialize() },
    { name: 'Google Analytics 4', init: () => ga4Connector.initialize() },
    { name: 'UptimeRobot', init: () => uptimeConnector.initialize() },
    { name: 'Lighthouse', init: () => lighthouseConnector.initialize() },
  ];

  for (const { name, init } of connectors) {
    try {
      await init();
    } catch (error) {
      logger.error(`[Business] Failed to initialize ${name}:`, error instanceof Error ? error : undefined);
    }
  }

  // Initialize insight generator and report generator
  insightGenerator.initialize();
  reportGenerator.initialize();

  // Start data aggregation scheduler
  await dataAggregator.start();

  const available = [
    stripeConnector.isAvailable() && 'Stripe',
    gscConnector.isAvailable() && 'GSC',
    ga4Connector.isAvailable() && 'GA4',
    uptimeConnector.isAvailable() && 'Uptime',
    lighthouseConnector.isAvailable() && 'Lighthouse',
  ].filter(Boolean);

  logger.info(`[Business] Connectors ready: ${available.length > 0 ? available.join(', ') : 'none (configure env vars)'}`);
}

/**
 * Get status of all connectors.
 */
export function getConnectorStatuses(): Array<{ name: string; type: string; available: boolean }> {
  return [
    { name: 'Stripe', type: 'stripe', available: stripeConnector.isAvailable() },
    { name: 'Google Search Console', type: 'gsc', available: gscConnector.isAvailable() },
    { name: 'Google Analytics 4', type: 'ga4', available: ga4Connector.isAvailable() },
    { name: 'UptimeRobot', type: 'uptime', available: uptimeConnector.isAvailable() },
    { name: 'Lighthouse', type: 'lighthouse', available: lighthouseConnector.isAvailable() },
  ];
}
