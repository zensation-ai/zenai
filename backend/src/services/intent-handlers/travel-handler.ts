/**
 * Travel Intent Handler - Phase 35
 *
 * Estimates travel duration between locations.
 * Uses OpenRouteService API with Haversine fallback.
 */

import { AIContext } from '../../utils/database-context';
import { estimateTravelDuration, type TravelEstimate } from '../travel-estimator';
import { logger } from '../../utils/logger';
import type { DetectedIntent } from '../intent-detector';
import type { IntentHandlerResult } from './index';

/**
 * Handle a travel_query intent
 */
export async function handleTravelIntent(
  context: AIContext,
  intent: DetectedIntent,
  originalText: string
): Promise<IntentHandlerResult> {
  const data = intent.extracted_data;

  const origin = (data.origin as string) || (data.from as string) || (data.start as string);
  const destination = (data.destination as string) || (data.to as string) || (data.end as string);

  if (!origin && !destination) {
    return {
      success: false,
      intent_type: 'travel_query',
      error: 'Konnte keinen Start- oder Zielort aus dem Text extrahieren',
    };
  }

  // At minimum we need a destination
  if (!destination) {
    return {
      success: false,
      intent_type: 'travel_query',
      error: 'Konnte keinen Zielort aus dem Text extrahieren',
    };
  }

  const mode = (data.mode as string) || 'driving';
  const validModes = ['driving', 'walking', 'cycling', 'transit'];
  const travelMode = validModes.includes(mode) ? mode as 'driving' | 'walking' | 'cycling' | 'transit' : 'driving';

  try {
    const estimate = await estimateTravelDuration(
      origin || 'Aktueller Standort',
      destination,
      travelMode
    );

    const summary = buildSummary(estimate);

    return {
      success: true,
      intent_type: 'travel_query',
      created_resource: {
        type: 'travel_estimate',
        id: `travel_${Date.now()}`,
        summary,
        data: {
          origin: estimate.origin,
          destination: estimate.destination,
          duration_minutes: estimate.duration_minutes,
          distance_km: estimate.distance_km,
          mode: estimate.mode,
          source: estimate.source,
        },
      },
    };
  } catch (err) {
    logger.error('Travel estimation failed', err instanceof Error ? err : undefined, {
      origin, destination, mode: travelMode,
      operation: 'handleTravelIntent'
    });
    return {
      success: false,
      intent_type: 'travel_query',
      error: (err as Error).message,
    };
  }
}

function buildSummary(estimate: TravelEstimate): string {
  const hours = Math.floor(estimate.duration_minutes / 60);
  const minutes = estimate.duration_minutes % 60;
  const durationStr = hours > 0
    ? `${hours} Std. ${minutes} Min.`
    : `${minutes} Min.`;
  const distStr = estimate.distance_km.toFixed(1);

  return `${estimate.origin} → ${estimate.destination}: ${durationStr} (${distStr} km, ${modeLabel(estimate.mode)})`;
}

function modeLabel(mode: string): string {
  switch (mode) {
    case 'driving': return 'Auto';
    case 'transit': return 'OEPNV';
    case 'walking': return 'zu Fuss';
    case 'cycling': return 'Fahrrad';
    default: return mode;
  }
}
