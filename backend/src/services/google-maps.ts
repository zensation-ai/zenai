/**
 * Google Maps Service - Phase 41
 *
 * Wrapper for Google Maps Platform APIs:
 * - Geocoding API (address → coordinates)
 * - Places API (autocomplete, details, opening hours)
 * - Directions API (routes, travel time with traffic)
 * - Distance Matrix API (multi-point travel times)
 *
 * Falls back to existing travel-estimator when GOOGLE_MAPS_API_KEY is not set.
 */

import axios from 'axios';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export interface GeocodingResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId: string;
  addressComponents: AddressComponent[];
}

export interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface PlaceAutocompleteResult {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  types: string[];
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  types: string[];
  openingHours: OpeningHours | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  priceLevel: number | null;
}

export interface OpeningHours {
  openNow: boolean;
  periods: OpeningPeriod[];
  weekdayText: string[];
}

export interface OpeningPeriod {
  open: { day: number; time: string };
  close?: { day: number; time: string };
}

export interface DirectionsResult {
  origin: string;
  destination: string;
  durationMinutes: number;
  durationInTrafficMinutes: number | null;
  distanceKm: number;
  summary: string;
  steps: DirectionStep[];
  departureTime: string | null;
  arrivalTime: string | null;
}

export interface DirectionStep {
  instruction: string;
  distanceKm: number;
  durationMinutes: number;
  travelMode: string;
}

export interface DistanceMatrixEntry {
  origin: string;
  destination: string;
  durationMinutes: number;
  durationInTrafficMinutes: number | null;
  distanceKm: number;
  status: string;
}

export interface NearbyPlace {
  placeId: string;
  name: string;
  vicinity: string;
  lat: number;
  lng: number;
  types: string[];
  rating: number | null;
  openNow: boolean | null;
  distanceKm?: number;
}

export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

// ============================================================
// Configuration
// ============================================================

function getApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY || '';
}

const BASE_URL = 'https://maps.googleapis.com/maps/api';
const TIMEOUT = 10000;

/**
 * Check if Google Maps is configured
 */
export function isGoogleMapsAvailable(): boolean {
  return !!getApiKey();
}

// ============================================================
// Geocoding
// ============================================================

/**
 * Convert an address string to coordinates
 */
export async function geocode(address: string): Promise<GeocodingResult | null> {
  if (!getApiKey()) {
    logger.debug('Google Maps not configured, geocoding unavailable');
    return null;
  }

  try {
    const response = await axios.get(`${BASE_URL}/geocode/json`, {
      params: {
        address,
        key: getApiKey(),
        language: 'de',
        region: 'de',
      },
      timeout: TIMEOUT,
    });

    const result = response.data.results?.[0];
    if (!result) {
      logger.debug('No geocoding results', { address });
      return null;
    }

    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
      addressComponents: result.address_components || [],
    };
  } catch (error) {
    logger.error('Geocoding failed', error as Error, { operation: 'geocode' });
    return null;
  }
}

/**
 * Convert coordinates to an address (reverse geocoding)
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  if (!getApiKey()) {return null;}

  try {
    const response = await axios.get(`${BASE_URL}/geocode/json`, {
      params: {
        latlng: `${lat},${lng}`,
        key: getApiKey(),
        language: 'de',
      },
      timeout: TIMEOUT,
    });

    const result = response.data.results?.[0];
    if (!result) {return null;}

    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
      addressComponents: result.address_components || [],
    };
  } catch (error) {
    logger.error('Reverse geocoding failed', error as Error);
    return null;
  }
}

// ============================================================
// Places Autocomplete
// ============================================================

/**
 * Get place suggestions for a text input
 */
export async function autocomplete(
  input: string,
  options?: { location?: { lat: number; lng: number }; radius?: number; types?: string }
): Promise<PlaceAutocompleteResult[]> {
  if (!getApiKey()) {return [];}

  try {
    const params: Record<string, string | number> = {
      input,
      key: getApiKey(),
      language: 'de',
      components: 'country:de|country:at|country:ch',
    };

    if (options?.location) {
      params.location = `${options.location.lat},${options.location.lng}`;
      params.radius = options.radius || 50000;
    }
    if (options?.types) {
      params.types = options.types;
    }

    const response = await axios.get(`${BASE_URL}/place/autocomplete/json`, {
      params,
      timeout: TIMEOUT,
    });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      logger.warn('Places autocomplete error', { status: response.data.status });
      return [];
    }

    return (response.data.predictions || []).map((p: Record<string, unknown>) => ({
      placeId: p.place_id as string,
      description: p.description as string,
      mainText: (p.structured_formatting as Record<string, string>)?.main_text || '',
      secondaryText: (p.structured_formatting as Record<string, string>)?.secondary_text || '',
      types: (p.types as string[]) || [],
    }));
  } catch (error) {
    logger.error('Autocomplete failed', error as Error);
    return [];
  }
}

// ============================================================
// Place Details
// ============================================================

/**
 * Get detailed information about a place (opening hours, phone, etc.)
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!getApiKey()) {return null;}

  try {
    const response = await axios.get(`${BASE_URL}/place/details/json`, {
      params: {
        place_id: placeId,
        key: getApiKey(),
        language: 'de',
        fields: 'place_id,name,formatted_address,geometry,type,opening_hours,formatted_phone_number,website,rating,price_level',
      },
      timeout: TIMEOUT,
    });

    if (response.data.status !== 'OK') {
      logger.warn('Place details error', { placeId, status: response.data.status });
      return null;
    }

    const r = response.data.result;
    return {
      placeId: r.place_id,
      name: r.name,
      formattedAddress: r.formatted_address,
      lat: r.geometry?.location?.lat,
      lng: r.geometry?.location?.lng,
      types: r.types || [],
      openingHours: r.opening_hours ? {
        openNow: r.opening_hours.open_now ?? false,
        periods: (r.opening_hours.periods || []).map((p: Record<string, Record<string, unknown>>) => ({
          open: { day: p.open?.day, time: p.open?.time },
          close: p.close ? { day: p.close.day, time: p.close.time } : undefined,
        })),
        weekdayText: r.opening_hours.weekday_text || [],
      } : null,
      phone: r.formatted_phone_number || null,
      website: r.website || null,
      rating: r.rating ?? null,
      priceLevel: r.price_level ?? null,
    };
  } catch (error) {
    logger.error('Place details failed', error as Error);
    return null;
  }
}

// ============================================================
// Directions
// ============================================================

/**
 * Get directions between two points with traffic
 */
export async function getDirections(
  origin: string,
  destination: string,
  mode: TravelMode = 'driving',
  departureTime?: Date
): Promise<DirectionsResult | null> {
  if (!getApiKey()) {return null;}

  try {
    const params: Record<string, string | number> = {
      origin,
      destination,
      key: getApiKey(),
      language: 'de',
      mode,
      units: 'metric',
    };

    // For driving, add departure_time for traffic-based estimates
    if (mode === 'driving') {
      params.departure_time = departureTime
        ? Math.floor(departureTime.getTime() / 1000)
        : 'now';
      params.traffic_model = 'best_guess';
    }

    const response = await axios.get(`${BASE_URL}/directions/json`, {
      params,
      timeout: TIMEOUT,
    });

    if (response.data.status !== 'OK') {
      logger.warn('Directions error', { origin, destination, status: response.data.status });
      return null;
    }

    const route = response.data.routes?.[0];
    const leg = route?.legs?.[0];
    if (!leg) {return null;}

    return {
      origin: leg.start_address,
      destination: leg.end_address,
      durationMinutes: Math.round(leg.duration.value / 60),
      durationInTrafficMinutes: leg.duration_in_traffic
        ? Math.round(leg.duration_in_traffic.value / 60)
        : null,
      distanceKm: Math.round(leg.distance.value / 100) / 10,
      summary: route.summary || '',
      steps: (leg.steps || []).map((s: Record<string, unknown>) => ({
        instruction: ((s.html_instructions as string) || '').replace(/<[^>]*>/g, ''),
        distanceKm: Math.round(((s.distance as Record<string, number>)?.value || 0) / 100) / 10,
        durationMinutes: Math.round(((s.duration as Record<string, number>)?.value || 0) / 60),
        travelMode: (s.travel_mode as string) || mode,
      })),
      departureTime: leg.departure_time?.text || null,
      arrivalTime: leg.arrival_time?.text || null,
    };
  } catch (error) {
    logger.error('Directions failed', error as Error);
    return null;
  }
}

// ============================================================
// Distance Matrix
// ============================================================

/**
 * Calculate travel times between multiple origins and destinations
 */
export async function getDistanceMatrix(
  origins: string[],
  destinations: string[],
  mode: TravelMode = 'driving'
): Promise<DistanceMatrixEntry[]> {
  if (!getApiKey()) {return [];}

  try {
    const params: Record<string, string | number> = {
      origins: origins.join('|'),
      destinations: destinations.join('|'),
      key: getApiKey(),
      language: 'de',
      mode,
      units: 'metric',
    };

    if (mode === 'driving') {
      params.departure_time = 'now';
      params.traffic_model = 'best_guess';
    }

    const response = await axios.get(`${BASE_URL}/distancematrix/json`, {
      params,
      timeout: TIMEOUT,
    });

    if (response.data.status !== 'OK') {
      logger.warn('Distance matrix error', { status: response.data.status });
      return [];
    }

    const results: DistanceMatrixEntry[] = [];
    const rows = response.data.rows || [];

    for (let i = 0; i < rows.length; i++) {
      const elements = rows[i].elements || [];
      for (let j = 0; j < elements.length; j++) {
        const el = elements[j];
        results.push({
          origin: response.data.origin_addresses?.[i] || origins[i],
          destination: response.data.destination_addresses?.[j] || destinations[j],
          durationMinutes: el.status === 'OK' ? Math.round(el.duration.value / 60) : 0,
          durationInTrafficMinutes: el.duration_in_traffic
            ? Math.round(el.duration_in_traffic.value / 60)
            : null,
          distanceKm: el.status === 'OK' ? Math.round(el.distance.value / 100) / 10 : 0,
          status: el.status,
        });
      }
    }

    return results;
  } catch (error) {
    logger.error('Distance matrix failed', error as Error);
    return [];
  }
}

// ============================================================
// Nearby Search
// ============================================================

/**
 * Find places near a location
 */
export async function searchNearby(
  lat: number,
  lng: number,
  options?: { radius?: number; type?: string; keyword?: string }
): Promise<NearbyPlace[]> {
  if (!getApiKey()) {return [];}

  try {
    const params: Record<string, string | number> = {
      location: `${lat},${lng}`,
      radius: options?.radius || 5000,
      key: getApiKey(),
      language: 'de',
    };

    if (options?.type) {params.type = options.type;}
    if (options?.keyword) {params.keyword = options.keyword;}

    const response = await axios.get(`${BASE_URL}/place/nearbysearch/json`, {
      params,
      timeout: TIMEOUT,
    });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      logger.warn('Nearby search error', { status: response.data.status });
      return [];
    }

    return (response.data.results || []).slice(0, 20).map((r: Record<string, unknown>) => {
      const geometry = r.geometry as Record<string, Record<string, number>>;
      const openingHours = r.opening_hours as Record<string, boolean> | undefined;
      return {
        placeId: r.place_id as string,
        name: r.name as string,
        vicinity: (r.vicinity as string) || '',
        lat: geometry?.location?.lat,
        lng: geometry?.location?.lng,
        types: (r.types as string[]) || [],
        rating: (r.rating as number) ?? null,
        openNow: openingHours?.open_now ?? null,
      };
    });
  } catch (error) {
    logger.error('Nearby search failed', error as Error);
    return [];
  }
}
