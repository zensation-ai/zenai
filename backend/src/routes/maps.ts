/**
 * Maps Routes - Phase 41
 *
 * REST API for Google Maps features:
 * - Geocoding & reverse geocoding
 * - Places autocomplete & details
 * - Directions & distance matrix
 * - Nearby search
 * - Saved locations CRUD
 * - Service status
 *
 * All routes are context-aware: /api/:context/maps/*
 */

import { Router, Request, Response } from 'express';
import {
  geocode,
  reverseGeocode,
  autocomplete,
  getPlaceDetails,
  getDirections,
  getDistanceMatrix,
  searchNearby,
  isGoogleMapsAvailable,
} from '../services/google-maps';
import type { TravelMode } from '../services/google-maps';
import {
  getCachedGeocode,
  setCachedGeocode,
  getCachedPlaceDetails,
  setCachedPlaceDetails,
  getSavedLocations,
  saveSavedLocation,
  deleteSavedLocation,
} from '../services/location-cache';
import { isValidContext } from '../utils/database-context';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================
// Middleware: Validate context
// ============================================================

function validateContext(req: Request, res: Response): string | null {
  const context = req.params.context;
  if (!isValidContext(context)) {
    res.status(400).json({ success: false, error: `Invalid context: ${context}` });
    return null;
  }
  return context as string;
}

// ============================================================
// Status
// ============================================================

/**
 * GET /api/:context/maps/status
 * Check if Google Maps is configured and available
 */
router.get('/:context/maps/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    available: isGoogleMapsAvailable(),
    features: {
      geocoding: isGoogleMapsAvailable(),
      autocomplete: isGoogleMapsAvailable(),
      directions: isGoogleMapsAvailable(),
      distanceMatrix: isGoogleMapsAvailable(),
      placeDetails: isGoogleMapsAvailable(),
      nearbySearch: isGoogleMapsAvailable(),
    },
  });
});

// ============================================================
// Geocoding
// ============================================================

/**
 * POST /api/:context/maps/geocode
 * Convert address to coordinates (with cache)
 */
router.post('/:context/maps/geocode', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  const { address } = req.body;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ success: false, error: 'address is required' });
  }

  try {
    // Check cache first
    const cached = await getCachedGeocode(context as 'personal' | 'work' | 'learning' | 'creative', address);
    if (cached) {
      return res.json({ success: true, data: cached, source: 'cache' });
    }

    // Call Google Maps
    const result = await geocode(address);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    // Cache the result
    await setCachedGeocode(context as 'personal' | 'work' | 'learning' | 'creative', address, result);

    res.json({ success: true, data: result, source: 'google' });
  } catch (error) {
    logger.error('Geocode endpoint failed', error as Error);
    res.status(500).json({ success: false, error: 'Geocoding failed' });
  }
});

/**
 * POST /api/:context/maps/reverse-geocode
 * Convert coordinates to address
 */
router.post('/:context/maps/reverse-geocode', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ success: false, error: 'lat and lng are required numbers' });
  }

  try {
    const result = await reverseGeocode(lat, lng);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Reverse geocode failed', error as Error);
    res.status(500).json({ success: false, error: 'Reverse geocoding failed' });
  }
});

// ============================================================
// Autocomplete
// ============================================================

/**
 * GET /api/:context/maps/autocomplete?input=...&lat=...&lng=...
 * Get place suggestions for text input
 */
router.get('/:context/maps/autocomplete', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  const input = req.query.input as string;
  if (!input || input.length < 2) {
    return res.json({ success: true, data: [] });
  }

  try {
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const location = lat && lng ? { lat, lng } : undefined;

    const results = await autocomplete(input, { location });
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Autocomplete endpoint failed', error as Error);
    res.status(500).json({ success: false, error: 'Autocomplete failed' });
  }
});

// ============================================================
// Place Details
// ============================================================

/**
 * GET /api/:context/maps/places/:placeId
 * Get place details with opening hours (cached)
 */
router.get('/:context/maps/places/:placeId', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  const { placeId } = req.params;

  try {
    // Check cache first
    const cached = await getCachedPlaceDetails(context as 'personal' | 'work' | 'learning' | 'creative', placeId);
    if (cached) {
      return res.json({ success: true, data: cached, source: 'cache' });
    }

    // Call Google Maps
    const details = await getPlaceDetails(placeId);
    if (!details) {
      return res.status(404).json({ success: false, error: 'Place not found' });
    }

    // Cache the result
    await setCachedPlaceDetails(context as 'personal' | 'work' | 'learning' | 'creative', details);

    res.json({ success: true, data: details, source: 'google' });
  } catch (error) {
    logger.error('Place details endpoint failed', error as Error);
    res.status(500).json({ success: false, error: 'Place details failed' });
  }
});

// ============================================================
// Directions
// ============================================================

/**
 * POST /api/:context/maps/directions
 * Get directions between two places (with traffic)
 */
router.post('/:context/maps/directions', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  const { origin, destination, mode, departure_time } = req.body;
  if (!origin || !destination) {
    return res.status(400).json({ success: false, error: 'origin and destination are required' });
  }

  try {
    const departureTime = departure_time ? new Date(departure_time) : undefined;
    const result = await getDirections(
      origin,
      destination,
      (mode as TravelMode) || 'driving',
      departureTime
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'No route found' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Directions endpoint failed', error as Error);
    res.status(500).json({ success: false, error: 'Directions failed' });
  }
});

// ============================================================
// Distance Matrix
// ============================================================

/**
 * POST /api/:context/maps/distance-matrix
 * Calculate travel times between multiple points
 */
router.post('/:context/maps/distance-matrix', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  const { origins, destinations, mode } = req.body;
  if (!Array.isArray(origins) || !Array.isArray(destinations)) {
    return res.status(400).json({ success: false, error: 'origins and destinations must be arrays' });
  }
  if (origins.length === 0 || destinations.length === 0) {
    return res.status(400).json({ success: false, error: 'origins and destinations must not be empty' });
  }
  if (origins.length * destinations.length > 25) {
    return res.status(400).json({ success: false, error: 'Maximum 25 origin-destination pairs allowed' });
  }

  try {
    const results = await getDistanceMatrix(
      origins,
      destinations,
      (mode as TravelMode) || 'driving'
    );

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Distance matrix endpoint failed', error as Error);
    res.status(500).json({ success: false, error: 'Distance matrix failed' });
  }
});

// ============================================================
// Nearby Search
// ============================================================

/**
 * POST /api/:context/maps/nearby
 * Find places near a location
 */
router.post('/:context/maps/nearby', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  const { lat, lng, radius, type, keyword } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ success: false, error: 'lat and lng are required numbers' });
  }

  try {
    const results = await searchNearby(lat, lng, { radius, type, keyword });
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Nearby search endpoint failed', error as Error);
    res.status(500).json({ success: false, error: 'Nearby search failed' });
  }
});

// ============================================================
// Saved Locations
// ============================================================

/**
 * GET /api/:context/maps/saved-locations
 * List user's saved locations
 */
router.get('/:context/maps/saved-locations', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  try {
    const locations = await getSavedLocations(context as 'personal' | 'work' | 'learning' | 'creative');
    res.json({ success: true, data: locations });
  } catch (error) {
    logger.error('Get saved locations failed', error as Error);
    res.status(500).json({ success: false, error: 'Failed to get saved locations' });
  }
});

/**
 * POST /api/:context/maps/saved-locations
 * Save a new location
 */
router.post('/:context/maps/saved-locations', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  const { label, address, lat, lng, googlePlaceId, icon, isDefault } = req.body;
  if (!label || !address || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ success: false, error: 'label, address, lat, and lng are required' });
  }

  try {
    const location = await saveSavedLocation(
      context as 'personal' | 'work' | 'learning' | 'creative',
      { label, address, lat, lng, googlePlaceId: googlePlaceId || null, icon: icon || 'pin', isDefault: isDefault || false }
    );

    if (!location) {
      return res.status(500).json({ success: false, error: 'Failed to save location' });
    }

    res.status(201).json({ success: true, data: location });
  } catch (error) {
    logger.error('Save location failed', error as Error);
    res.status(500).json({ success: false, error: 'Failed to save location' });
  }
});

/**
 * DELETE /api/:context/maps/saved-locations/:id
 * Delete a saved location
 */
router.delete('/:context/maps/saved-locations/:id', async (req: Request, res: Response) => {
  const context = validateContext(req, res);
  if (!context) return;

  const { id } = req.params;

  try {
    const deleted = await deleteSavedLocation(context as 'personal' | 'work' | 'learning' | 'creative', id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete location failed', error as Error);
    res.status(500).json({ success: false, error: 'Failed to delete location' });
  }
});

export { router as mapsRouter };
