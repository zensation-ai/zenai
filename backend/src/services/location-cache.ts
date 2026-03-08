/**
 * Location Cache Service - Phase 41
 *
 * Caches Google Maps API results in Supabase to minimize API costs.
 * - Geocoding results: 30 days TTL
 * - Place details (opening hours): 24 hours TTL
 * - Expired entries are lazily cleaned on read
 */

import { queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import type { GeocodingResult, PlaceDetails } from './google-maps';

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

// ============================================================
// Geocoding Cache
// ============================================================

/**
 * Get cached geocoding result for an address query
 */
export async function getCachedGeocode(
  context: AIContext,
  addressQuery: string
): Promise<GeocodingResult | null> {
  try {
    const normalized = addressQuery.toLowerCase().trim();
    const result = await queryContext(
      context,
      `SELECT formatted_address, lat, lng, google_place_id, address_components
       FROM geocoding_cache
       WHERE address_query = $1 AND expires_at > NOW()`,
      [normalized]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      formattedAddress: row.formatted_address || addressQuery,
      placeId: row.google_place_id || '',
      addressComponents: row.address_components || [],
    };
  } catch (error) {
    logger.debug('Geocoding cache miss', { addressQuery, error: (error as Error).message });
    return null;
  }
}

/**
 * Store a geocoding result in the cache
 */
export async function setCachedGeocode(
  context: AIContext,
  addressQuery: string,
  result: GeocodingResult
): Promise<void> {
  try {
    const normalized = addressQuery.toLowerCase().trim();
    await queryContext(
      context,
      `INSERT INTO geocoding_cache (address_query, formatted_address, lat, lng, google_place_id, address_components)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (address_query)
       DO UPDATE SET formatted_address = $2, lat = $3, lng = $4, google_place_id = $5,
         address_components = $6, expires_at = NOW() + INTERVAL '30 days'`,
      [
        normalized,
        result.formattedAddress,
        result.lat,
        result.lng,
        result.placeId,
        JSON.stringify(result.addressComponents),
      ]
    );
  } catch (error) {
    logger.debug('Geocoding cache write failed', { error: (error as Error).message });
  }
}

// ============================================================
// Places Cache
// ============================================================

/**
 * Get cached place details
 */
export async function getCachedPlaceDetails(
  context: AIContext,
  placeId: string
): Promise<PlaceDetails | null> {
  try {
    const result = await queryContext(
      context,
      `SELECT name, formatted_address, lat, lng, types, opening_hours, phone, website, rating, price_level
       FROM places_cache
       WHERE google_place_id = $1 AND expires_at > NOW()`,
      [placeId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      placeId,
      name: row.name || '',
      formattedAddress: row.formatted_address || '',
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      types: row.types || [],
      openingHours: row.opening_hours || null,
      phone: row.phone || null,
      website: row.website || null,
      rating: row.rating ? parseFloat(row.rating) : null,
      priceLevel: row.price_level,
    };
  } catch (error) {
    logger.debug('Places cache miss', { placeId, error: (error as Error).message });
    return null;
  }
}

/**
 * Store place details in the cache (24h TTL)
 */
export async function setCachedPlaceDetails(
  context: AIContext,
  details: PlaceDetails
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO places_cache (google_place_id, name, formatted_address, lat, lng, types, opening_hours, phone, website, rating, price_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (google_place_id)
       DO UPDATE SET name = $2, formatted_address = $3, lat = $4, lng = $5, types = $6,
         opening_hours = $7, phone = $8, website = $9, rating = $10, price_level = $11,
         updated_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'`,
      [
        details.placeId,
        details.name,
        details.formattedAddress,
        details.lat,
        details.lng,
        JSON.stringify(details.types),
        details.openingHours ? JSON.stringify(details.openingHours) : null,
        details.phone,
        details.website,
        details.rating,
        details.priceLevel,
      ]
    );
  } catch (error) {
    logger.debug('Places cache write failed', { error: (error as Error).message });
  }
}

// ============================================================
// Saved Locations
// ============================================================

export interface SavedLocation {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  icon: string;
  isDefault: boolean;
}

/**
 * Get user's saved locations
 */
export async function getSavedLocations(context: AIContext): Promise<SavedLocation[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, label, address, lat, lng, google_place_id, icon, is_default
       FROM saved_locations
       WHERE context = $1
       ORDER BY is_default DESC, label ASC`,
      [context]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      label: row.label as string,
      address: row.address as string,
      lat: parseFloat(row.lat as string),
      lng: parseFloat(row.lng as string),
      googlePlaceId: (row.google_place_id as string) || null,
      icon: (row.icon as string) || 'pin',
      isDefault: row.is_default as boolean,
    }));
  } catch (error) {
    logger.error('Failed to get saved locations', error as Error);
    return [];
  }
}

/**
 * Save a new location
 */
export async function saveSavedLocation(
  context: AIContext,
  location: Omit<SavedLocation, 'id'>
): Promise<SavedLocation | null> {
  try {
    const result = await queryContext(
      context,
      `INSERT INTO saved_locations (context, label, address, lat, lng, google_place_id, icon, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, label, address, lat, lng, google_place_id, icon, is_default`,
      [context, location.label, location.address, location.lat, location.lng,
       location.googlePlaceId, location.icon || 'pin', location.isDefault || false]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      label: row.label,
      address: row.address,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      googlePlaceId: row.google_place_id || null,
      icon: row.icon || 'pin',
      isDefault: row.is_default,
    };
  } catch (error) {
    logger.error('Failed to save location', error as Error);
    return null;
  }
}

/**
 * Delete a saved location
 */
export async function deleteSavedLocation(context: AIContext, id: string): Promise<boolean> {
  try {
    const result = await queryContext(
      context,
      `DELETE FROM saved_locations WHERE id = $1 AND context = $2`,
      [id, context]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to delete saved location', error as Error);
    return false;
  }
}

// ============================================================
// Cache Cleanup
// ============================================================

/**
 * Remove expired cache entries (call periodically or via cron)
 */
export async function cleanExpiredCache(context: AIContext): Promise<{ geocoding: number; places: number }> {
  try {
    const geoResult = await queryContext(
      context,
      `DELETE FROM geocoding_cache WHERE expires_at < NOW()`,
      []
    );
    const placesResult = await queryContext(
      context,
      `DELETE FROM places_cache WHERE expires_at < NOW()`,
      []
    );

    return {
      geocoding: geoResult.rowCount ?? 0,
      places: placesResult.rowCount ?? 0,
    };
  } catch (error) {
    logger.error('Cache cleanup failed', error as Error);
    return { geocoding: 0, places: 0 };
  }
}
