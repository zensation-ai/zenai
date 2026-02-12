/**
 * Travel Estimator Service - Phase 35
 *
 * Estimates travel duration between two locations.
 * Primary: OpenRouteService API (free, GDPR-compliant)
 * Fallback: Haversine formula with road-distance heuristic
 */

import axios from 'axios';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export interface TravelEstimate {
  origin: string;
  destination: string;
  duration_minutes: number;
  distance_km: number;
  mode: 'driving' | 'walking' | 'cycling' | 'transit';
  source: 'openrouteservice' | 'estimate';
}

interface GeocodingResult {
  lat: number;
  lon: number;
  label: string;
}

// ============================================================
// Configuration
// ============================================================

const ORS_API_KEY = process.env.OPENROUTESERVICE_API_KEY;
const ORS_BASE_URL = 'https://api.openrouteservice.org';

// Profile mapping for OpenRouteService
const ORS_PROFILES: Record<string, string> = {
  driving: 'driving-car',
  walking: 'foot-walking',
  cycling: 'cycling-regular',
  transit: 'driving-car', // ORS doesn't support transit, fall back to driving
};

// Average speeds for fallback estimation (km/h)
const AVERAGE_SPEEDS: Record<string, number> = {
  driving: 50,
  walking: 5,
  cycling: 15,
  transit: 35,
};

// ============================================================
// Main Function
// ============================================================

/**
 * Estimate travel duration between two locations
 */
export async function estimateTravelDuration(
  origin: string,
  destination: string,
  mode: 'driving' | 'walking' | 'cycling' | 'transit' = 'driving'
): Promise<TravelEstimate> {
  // Try OpenRouteService if API key is configured
  if (ORS_API_KEY) {
    try {
      return await estimateWithORS(origin, destination, mode);
    } catch (err) {
      logger.warn('OpenRouteService estimation failed, using fallback', {
        error: (err as Error).message,
        operation: 'estimateTravelDuration'
      });
    }
  }

  // Fallback: Geocode and estimate with Haversine
  try {
    return await estimateWithFallback(origin, destination, mode);
  } catch (err) {
    logger.warn('Geocoding fallback failed, using rough estimate', {
      error: (err as Error).message,
      operation: 'estimateTravelDuration'
    });

    // Last resort: return a rough estimate
    return {
      origin,
      destination,
      duration_minutes: 30, // Default 30 min
      distance_km: 20,
      mode,
      source: 'estimate',
    };
  }
}

// ============================================================
// OpenRouteService
// ============================================================

async function estimateWithORS(
  origin: string,
  destination: string,
  mode: 'driving' | 'walking' | 'cycling' | 'transit'
): Promise<TravelEstimate> {
  // Step 1: Geocode both addresses
  const [originGeo, destGeo] = await Promise.all([
    geocodeORS(origin),
    geocodeORS(destination),
  ]);

  // Step 2: Get route
  const profile = ORS_PROFILES[mode] || 'driving-car';
  const response = await axios.post(
    `${ORS_BASE_URL}/v2/directions/${profile}`,
    {
      coordinates: [
        [originGeo.lon, originGeo.lat],
        [destGeo.lon, destGeo.lat],
      ],
    },
    {
      headers: {
        Authorization: ORS_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  const route = response.data.routes?.[0];
  if (!route) {
    throw new Error('No route found');
  }

  const durationSeconds = route.summary.duration;
  const distanceMeters = route.summary.distance;

  return {
    origin: originGeo.label || origin,
    destination: destGeo.label || destination,
    duration_minutes: Math.round(durationSeconds / 60),
    distance_km: Math.round(distanceMeters / 100) / 10, // 1 decimal
    mode,
    source: 'openrouteservice',
  };
}

async function geocodeORS(address: string): Promise<GeocodingResult> {
  const response = await axios.get(`${ORS_BASE_URL}/geocode/search`, {
    params: {
      api_key: ORS_API_KEY,
      text: address,
      size: 1,
      'boundary.country': 'DE,AT,CH', // DACH region
    },
    timeout: 5000,
  });

  const feature = response.data.features?.[0];
  if (!feature) {
    throw new Error(`Could not geocode address: ${address}`);
  }

  return {
    lon: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
    label: feature.properties.label || address,
  };
}

// ============================================================
// Fallback: Haversine + Heuristic
// ============================================================

async function estimateWithFallback(
  origin: string,
  destination: string,
  mode: 'driving' | 'walking' | 'cycling' | 'transit'
): Promise<TravelEstimate> {
  // Try free geocoding via Nominatim (OpenStreetMap)
  const [originGeo, destGeo] = await Promise.all([
    geocodeNominatim(origin),
    geocodeNominatim(destination),
  ]);

  // Calculate straight-line distance
  const straightLineKm = haversineDistance(
    originGeo.lat, originGeo.lon,
    destGeo.lat, destGeo.lon
  );

  // Apply road-distance multiplier (roads are ~1.4x straight-line)
  const roadDistanceKm = straightLineKm * 1.4;

  // Estimate duration based on average speed
  const avgSpeed = AVERAGE_SPEEDS[mode] || 50;
  const durationMinutes = Math.round((roadDistanceKm / avgSpeed) * 60);

  return {
    origin: originGeo.label || origin,
    destination: destGeo.label || destination,
    duration_minutes: durationMinutes,
    distance_km: Math.round(roadDistanceKm * 10) / 10,
    mode,
    source: 'estimate',
  };
}

async function geocodeNominatim(address: string): Promise<GeocodingResult> {
  const response = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: {
      q: address,
      format: 'json',
      limit: 1,
      countrycodes: 'de,at,ch',
    },
    headers: {
      'User-Agent': 'ZenAI/1.0 (calendar-travel-estimation)',
    },
    timeout: 5000,
  });

  const result = response.data?.[0];
  if (!result) {
    throw new Error(`Could not geocode address: ${address}`);
  }

  return {
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
    label: result.display_name || address,
  };
}

// ============================================================
// Haversine Formula
// ============================================================

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
