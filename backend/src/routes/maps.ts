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
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';

const router = Router();

// ============================================================
// Helpers
// ============================================================

type ValidContext = 'personal' | 'work' | 'learning' | 'creative';

function extractContext(req: Request): ValidContext {
  const context = req.params.context;
  if (!isValidContext(context)) {
    throw new ValidationError(`Invalid context: ${context}`);
  }
  return context as ValidContext;
}

// ============================================================
// Status
// ============================================================

/**
 * GET /api/:context/maps/status
 * Check if Google Maps is configured and available
 */
router.get('/:context/maps/status', apiKeyAuth, (_req: Request, res: Response) => {
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
router.post('/:context/maps/geocode', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = extractContext(req);

  const { address } = req.body;
  if (!address || typeof address !== 'string') {
    throw new ValidationError('address is required');
  }

  // Check cache first
  const cached = await getCachedGeocode(context, address);
  if (cached) {
    return res.json({ success: true, data: cached, source: 'cache' });
  }

  // Call Google Maps
  const result = await geocode(address);
  if (!result) {
    return res.status(404).json({ success: false, error: 'Address not found' });
  }

  // Cache the result
  await setCachedGeocode(context, address, result);

  res.json({ success: true, data: result, source: 'google' });
}));

/**
 * POST /api/:context/maps/reverse-geocode
 * Convert coordinates to address
 */
router.post('/:context/maps/reverse-geocode', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = extractContext(req);
  void context; // validated but not needed for this call

  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new ValidationError('lat and lng are required numbers');
  }

  const result = await reverseGeocode(lat, lng);
  if (!result) {
    return res.status(404).json({ success: false, error: 'Location not found' });
  }
  res.json({ success: true, data: result });
}));

// ============================================================
// Autocomplete
// ============================================================

/**
 * GET /api/:context/maps/autocomplete?input=...&lat=...&lng=...
 * Get place suggestions for text input
 */
router.get('/:context/maps/autocomplete', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  extractContext(req);

  const input = req.query.input as string;
  if (!input || input.length < 2) {
    return res.json({ success: true, data: [] });
  }

  const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
  const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
  const location = lat && lng ? { lat, lng } : undefined;

  const results = await autocomplete(input, { location });
  res.json({ success: true, data: results });
}));

// ============================================================
// Place Details
// ============================================================

/**
 * GET /api/:context/maps/places/:placeId
 * Get place details with opening hours (cached)
 */
router.get('/:context/maps/places/:placeId', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = extractContext(req);
  const { placeId } = req.params;

  // Check cache first
  const cached = await getCachedPlaceDetails(context, placeId);
  if (cached) {
    return res.json({ success: true, data: cached, source: 'cache' });
  }

  // Call Google Maps
  const details = await getPlaceDetails(placeId);
  if (!details) {
    return res.status(404).json({ success: false, error: 'Place not found' });
  }

  // Cache the result
  await setCachedPlaceDetails(context, details);

  res.json({ success: true, data: details, source: 'google' });
}));

// ============================================================
// Directions
// ============================================================

/**
 * POST /api/:context/maps/directions
 * Get directions between two places (with traffic)
 */
router.post('/:context/maps/directions', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  extractContext(req);

  const { origin, destination, mode, departure_time } = req.body;
  if (!origin || !destination) {
    throw new ValidationError('origin and destination are required');
  }

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
}));

// ============================================================
// Distance Matrix
// ============================================================

/**
 * POST /api/:context/maps/distance-matrix
 * Calculate travel times between multiple points
 */
router.post('/:context/maps/distance-matrix', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  extractContext(req);

  const { origins, destinations, mode } = req.body;
  if (!Array.isArray(origins) || !Array.isArray(destinations)) {
    throw new ValidationError('origins and destinations must be arrays');
  }
  if (origins.length === 0 || destinations.length === 0) {
    throw new ValidationError('origins and destinations must not be empty');
  }
  if (origins.length * destinations.length > 25) {
    throw new ValidationError('Maximum 25 origin-destination pairs allowed');
  }

  const results = await getDistanceMatrix(
    origins,
    destinations,
    (mode as TravelMode) || 'driving'
  );

  res.json({ success: true, data: results });
}));

// ============================================================
// Nearby Search
// ============================================================

/**
 * POST /api/:context/maps/nearby
 * Find places near a location
 */
router.post('/:context/maps/nearby', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  extractContext(req);

  const { lat, lng, radius, type, keyword } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new ValidationError('lat and lng are required numbers');
  }

  const results = await searchNearby(lat, lng, { radius, type, keyword });
  res.json({ success: true, data: results });
}));

// ============================================================
// Saved Locations
// ============================================================

/**
 * GET /api/:context/maps/saved-locations
 * List user's saved locations
 */
router.get('/:context/maps/saved-locations', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const context = extractContext(req);
  const userId = getUserId(req);
  const locations = await getSavedLocations(context, userId);
  res.json({ success: true, data: locations });
}));

/**
 * POST /api/:context/maps/saved-locations
 * Save a new location
 */
router.post('/:context/maps/saved-locations', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = extractContext(req);
  const userId = getUserId(req);

  const { label, address, lat, lng, googlePlaceId, icon, isDefault } = req.body;
  if (!label || !address || typeof lat !== 'number' || typeof lng !== 'number') {
    throw new ValidationError('label, address, lat, and lng are required');
  }

  const location = await saveSavedLocation(context, {
    label, address, lat, lng,
    googlePlaceId: googlePlaceId || null,
    icon: icon || 'pin',
    isDefault: isDefault || false,
  }, userId);

  if (!location) {
    return res.status(500).json({ success: false, error: 'Failed to save location' });
  }

  res.status(201).json({ success: true, data: location });
}));

/**
 * DELETE /api/:context/maps/saved-locations/:id
 * Delete a saved location
 */
router.delete('/:context/maps/saved-locations/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = extractContext(req);
  const userId = getUserId(req);
  const { id } = req.params;

  const deleted = await deleteSavedLocation(context, id, userId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Location not found' });
  }
  res.json({ success: true });
}));

export { router as mapsRouter };
