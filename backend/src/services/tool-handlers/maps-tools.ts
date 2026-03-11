/**
 * Maps Tool Handlers - Phase 41
 *
 * Claude tool handlers for Google Maps integration:
 * - get_directions: Travel time with traffic between two places
 * - get_opening_hours: Opening hours of a business/place
 * - find_nearby_places: POI search near a location
 * - optimize_day_route: Optimize order of multiple appointments
 */

import { logger } from '../../utils/logger';
import type { ToolExecutionContext } from '../claude/tool-use';
import {
  getDirections,
  getPlaceDetails,
  searchNearby,
  autocomplete,
  getDistanceMatrix,
  geocode,
  isGoogleMapsAvailable,
} from '../google-maps';
import type { TravelMode } from '../google-maps';
import {
  getCachedGeocode,
  setCachedGeocode,
  getCachedPlaceDetails,
  setCachedPlaceDetails,
} from '../location-cache';
import { estimateTravelDuration } from '../travel-estimator';

// ============================================================
// get_directions handler
// ============================================================

export async function handleGetDirections(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const origin = input.origin as string;
  const destination = input.destination as string;

  if (!origin || !destination) {
    return 'Fehler: Start- und Zielort sind erforderlich.';
  }

  const mode = (input.mode as TravelMode) || 'driving';
  const departureTimeStr = input.departure_time as string | undefined;
  const departureTime = departureTimeStr ? new Date(departureTimeStr) : undefined;

  // Try Google Maps first
  if (isGoogleMapsAvailable()) {
    try {
      const result = await getDirections(origin, destination, mode, departureTime);
      if (result) {
        const modeLabels: Record<string, string> = {
          driving: 'Auto', transit: 'OEPNV', walking: 'zu Fuss', bicycling: 'Fahrrad',
        };

        const lines = [
          `Route: ${result.origin} → ${result.destination}`,
          `Entfernung: ${result.distanceKm} km`,
          `Dauer: ${formatDuration(result.durationMinutes)}`,
        ];

        if (result.durationInTrafficMinutes && result.durationInTrafficMinutes !== result.durationMinutes) {
          lines.push(`Mit aktuellem Verkehr: ${formatDuration(result.durationInTrafficMinutes)}`);
        }

        lines.push(`Transportmittel: ${modeLabels[mode] || mode}`);

        if (result.summary) {
          lines.push(`Route: ueber ${result.summary}`);
        }
        if (result.departureTime) {
          lines.push(`Abfahrt: ${result.departureTime}`);
        }
        if (result.arrivalTime) {
          lines.push(`Ankunft: ${result.arrivalTime}`);
        }

        lines.push('Quelle: Google Maps (Echtzeit-Verkehr)');

        return lines.join('\n');
      }
    } catch (error) {
      logger.warn('Google Maps directions failed, using fallback', {
        error: (error as Error).message,
      });
    }
  }

  // Fallback to existing travel estimator
  try {
    const fallbackMode = mode === 'bicycling' ? 'cycling' : mode;
    const estimate = await estimateTravelDuration(origin, destination, fallbackMode as 'driving' | 'walking' | 'cycling' | 'transit');
    const modeLabels: Record<string, string> = {
      driving: 'Auto', transit: 'OEPNV', walking: 'zu Fuss', cycling: 'Fahrrad',
    };

    return `Reisezeit-Schaetzung:\n- Von: ${estimate.origin}\n- Nach: ${estimate.destination}\n- Dauer: ${formatDuration(estimate.duration_minutes)}\n- Entfernung: ${estimate.distance_km} km\n- Transportmittel: ${modeLabels[estimate.mode] || estimate.mode}\n- Quelle: ${estimate.source === 'openrouteservice' ? 'OpenRouteService' : 'Schaetzung (kein Google Maps konfiguriert)'}`;
  } catch (error) {
    logger.error('Travel estimation fallback failed', error as Error);
    return `Fehler bei der Routenberechnung: ${(error as Error).message}`;
  }
}

// ============================================================
// get_opening_hours handler
// ============================================================

export async function handleGetOpeningHours(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const place = input.place as string;

  if (!place) {
    return 'Fehler: Ort oder Geschaeftsname ist erforderlich.';
  }

  if (!isGoogleMapsAvailable()) {
    return 'Google Maps ist nicht konfiguriert. Oeffnungszeiten koennen nicht abgerufen werden. Bitte GOOGLE_MAPS_API_KEY setzen.';
  }

  try {
    // Step 1: Find the place via autocomplete
    const suggestions = await autocomplete(place, { types: 'establishment' });
    if (suggestions.length === 0) {
      return `Kein Geschaeft gefunden fuer: "${place}"`;
    }

    const placeId = suggestions[0].placeId;

    // Step 2: Check cache
    const cached = await getCachedPlaceDetails(execContext.aiContext, placeId);
    if (cached?.openingHours) {
      return formatOpeningHoursResponse(cached.name, cached.openingHours, cached);
    }

    // Step 3: Get details from Google
    const details = await getPlaceDetails(placeId);
    if (!details) {
      return `Details fuer "${suggestions[0].description}" konnten nicht abgerufen werden.`;
    }

    // Cache the result
    await setCachedPlaceDetails(execContext.aiContext, details);

    if (!details.openingHours) {
      return `${details.name} (${details.formattedAddress})\n\nKeine Oeffnungszeiten verfuegbar fuer diesen Ort.`;
    }

    return formatOpeningHoursResponse(details.name, details.openingHours, details);
  } catch (error) {
    logger.error('Opening hours tool failed', error as Error);
    return `Fehler beim Abrufen der Oeffnungszeiten: ${(error as Error).message}`;
  }
}

function formatOpeningHoursResponse(
  name: string,
  openingHours: { openNow: boolean; weekdayText: string[] },
  details: { formattedAddress: string; phone?: string | null; rating?: number | null; website?: string | null }
): string {
  const lines = [
    `**${name}**`,
    details.formattedAddress,
    '',
    `Status: ${openingHours.openNow ? 'Geoeffnet' : 'Geschlossen'}`,
    '',
    '**Oeffnungszeiten:**',
    ...openingHours.weekdayText.map(t => `  ${t}`),
  ];

  if (details.phone) {lines.push(`\nTelefon: ${details.phone}`);}
  if (details.rating) {lines.push(`Bewertung: ${details.rating}/5`);}
  if (details.website) {lines.push(`Website: ${details.website}`);}

  return lines.join('\n');
}

// ============================================================
// find_nearby_places handler
// ============================================================

export async function handleFindNearbyPlaces(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const location = input.location as string;
  const type = input.type as string | undefined;
  const keyword = input.keyword as string | undefined;
  const radius = input.radius as number | undefined;

  if (!location) {
    return 'Fehler: Ein Standort ist erforderlich (Adresse oder Ortsname).';
  }

  if (!isGoogleMapsAvailable()) {
    return 'Google Maps ist nicht konfiguriert. Umgebungssuche nicht verfuegbar.';
  }

  try {
    // Geocode the location first
    let lat: number;
    let lng: number;

    const cached = await getCachedGeocode(execContext.aiContext, location);
    if (cached) {
      lat = cached.lat;
      lng = cached.lng;
    } else {
      const geoResult = await geocode(location);
      if (!geoResult) {
        return `Standort nicht gefunden: "${location}"`;
      }
      lat = geoResult.lat;
      lng = geoResult.lng;
      await setCachedGeocode(execContext.aiContext, location, geoResult);
    }

    // Search nearby
    const results = await searchNearby(lat, lng, {
      radius: radius || 2000,
      type,
      keyword,
    });

    if (results.length === 0) {
      const searchDesc = keyword || type || 'Orte';
      return `Keine ${searchDesc} in der Naehe von "${location}" gefunden.`;
    }

    const lines = [`**${results.length} Ergebnisse in der Naehe von "${location}":**`, ''];

    for (const place of results.slice(0, 10)) {
      const parts = [`- **${place.name}**`];
      if (place.vicinity) {parts.push(`(${place.vicinity})`);}
      if (place.rating) {parts.push(`- Bewertung: ${place.rating}/5`);}
      if (place.openNow !== null) {
        parts.push(`- ${place.openNow ? 'Geoeffnet' : 'Geschlossen'}`);
      }
      lines.push(parts.join(' '));
    }

    return lines.join('\n');
  } catch (error) {
    logger.error('Find nearby places failed', error as Error);
    return `Fehler bei der Umgebungssuche: ${(error as Error).message}`;
  }
}

// ============================================================
// optimize_day_route handler
// ============================================================

export async function handleOptimizeDayRoute(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const locations = input.locations as string[];
  const startLocation = input.start_location as string | undefined;
  const mode = (input.mode as TravelMode) || 'driving';

  if (!locations || locations.length < 2) {
    return 'Fehler: Mindestens 2 Orte sind erforderlich fuer eine Routenoptimierung.';
  }

  if (locations.length > 10) {
    return 'Fehler: Maximal 10 Orte fuer die Routenoptimierung erlaubt.';
  }

  if (!isGoogleMapsAvailable()) {
    return 'Google Maps ist nicht konfiguriert. Routenoptimierung nicht verfuegbar.';
  }

  try {
    // Calculate distance matrix between all points
    const allLocations = startLocation ? [startLocation, ...locations] : locations;
    const matrix = await getDistanceMatrix(allLocations, allLocations, mode);

    if (matrix.length === 0) {
      return 'Konnte die Entfernungsmatrix nicht berechnen.';
    }

    // Build adjacency matrix
    const n = allLocations.length;
    const durations: number[][] = Array.from({ length: n }, () => Array(n).fill(Infinity));

    for (const entry of matrix) {
      const i = allLocations.indexOf(entry.origin);
      const j = allLocations.indexOf(entry.destination);
      if (i >= 0 && j >= 0 && entry.status === 'OK') {
        durations[i][j] = entry.durationInTrafficMinutes || entry.durationMinutes;
      }
    }

    // Simple nearest-neighbor heuristic for route optimization
    const visited = new Set<number>();
    const route: number[] = [startLocation ? 0 : 0];
    visited.add(route[0]);

    while (visited.size < n) {
      const current = route[route.length - 1];
      let bestNext = -1;
      let bestDuration = Infinity;

      for (let j = 0; j < n; j++) {
        if (!visited.has(j) && durations[current][j] < bestDuration) {
          bestDuration = durations[current][j];
          bestNext = j;
        }
      }

      if (bestNext === -1) {break;}
      route.push(bestNext);
      visited.add(bestNext);
    }

    // Format result
    let totalDuration = 0;
    const lines = ['**Optimierte Reihenfolge:**', ''];

    for (let i = 0; i < route.length; i++) {
      const idx = route[i];
      lines.push(`${i + 1}. ${allLocations[idx]}`);
      if (i < route.length - 1) {
        const nextIdx = route[i + 1];
        const dur = durations[idx][nextIdx];
        if (dur < Infinity) {
          totalDuration += dur;
          lines.push(`   → ${formatDuration(Math.round(dur))} Fahrt`);
        }
      }
    }

    lines.push('');
    lines.push(`**Gesamte Reisezeit: ${formatDuration(Math.round(totalDuration))}**`);

    const modeLabels: Record<string, string> = {
      driving: 'Auto', transit: 'OEPNV', walking: 'zu Fuss', bicycling: 'Fahrrad',
    };
    lines.push(`Transportmittel: ${modeLabels[mode] || mode}`);

    return lines.join('\n');
  } catch (error) {
    logger.error('Route optimization failed', error as Error);
    return `Fehler bei der Routenoptimierung: ${(error as Error).message}`;
  }
}

// ============================================================
// Helpers
// ============================================================

function formatDuration(minutes: number): string {
  if (minutes < 60) {return `${minutes} Min.`;}
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {return `${hours} Std.`;}
  return `${hours} Std. ${mins} Min.`;
}
