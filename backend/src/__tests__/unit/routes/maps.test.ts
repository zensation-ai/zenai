/**
 * Maps Route Tests
 *
 * Tests the REST API for Google Maps features.
 */

import express from 'express';
import request from 'supertest';
import { mapsRouter } from '../../../routes/maps';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock google-maps service
const mockGeocode = jest.fn();
const mockReverseGeocode = jest.fn();
const mockAutocomplete = jest.fn();
const mockGetPlaceDetails = jest.fn();
const mockGetDirections = jest.fn();
const mockGetDistanceMatrix = jest.fn();
const mockSearchNearby = jest.fn();
const mockIsAvailable = jest.fn();

jest.mock('../../../services/google-maps', () => ({
  geocode: (...args: unknown[]) => mockGeocode(...args),
  reverseGeocode: (...args: unknown[]) => mockReverseGeocode(...args),
  autocomplete: (...args: unknown[]) => mockAutocomplete(...args),
  getPlaceDetails: (...args: unknown[]) => mockGetPlaceDetails(...args),
  getDirections: (...args: unknown[]) => mockGetDirections(...args),
  getDistanceMatrix: (...args: unknown[]) => mockGetDistanceMatrix(...args),
  searchNearby: (...args: unknown[]) => mockSearchNearby(...args),
  isGoogleMapsAvailable: (...args: unknown[]) => mockIsAvailable(...args),
}));

// Mock location-cache service
const mockGetCachedGeocode = jest.fn();
const mockSetCachedGeocode = jest.fn();
const mockGetCachedPlaceDetails = jest.fn();
const mockSetCachedPlaceDetails = jest.fn();
const mockGetSavedLocations = jest.fn();
const mockSaveSavedLocation = jest.fn();
const mockDeleteSavedLocation = jest.fn();

jest.mock('../../../services/location-cache', () => ({
  getCachedGeocode: (...args: unknown[]) => mockGetCachedGeocode(...args),
  setCachedGeocode: (...args: unknown[]) => mockSetCachedGeocode(...args),
  getCachedPlaceDetails: (...args: unknown[]) => mockGetCachedPlaceDetails(...args),
  setCachedPlaceDetails: (...args: unknown[]) => mockSetCachedPlaceDetails(...args),
  getSavedLocations: (...args: unknown[]) => mockGetSavedLocations(...args),
  saveSavedLocation: (...args: unknown[]) => mockSaveSavedLocation(...args),
  deleteSavedLocation: (...args: unknown[]) => mockDeleteSavedLocation(...args),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Maps Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', mapsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockIsAvailable.mockReturnValue(true);
    mockGeocode.mockResolvedValue({ lat: 52.52, lng: 13.405, formattedAddress: 'Berlin, Germany' });
    mockReverseGeocode.mockResolvedValue({ address: 'Alexanderplatz, Berlin' });
    mockAutocomplete.mockResolvedValue([{ placeId: 'p1', description: 'Berlin' }]);
    mockGetPlaceDetails.mockResolvedValue({ name: 'Brandenburger Tor', lat: 52.5163, lng: 13.3777 });
    mockGetDirections.mockResolvedValue({ distance: '5 km', duration: '12 min' });
    mockGetDistanceMatrix.mockResolvedValue({ rows: [{ elements: [{ distance: '5 km' }] }] });
    mockSearchNearby.mockResolvedValue([{ name: 'Cafe Nearby', lat: 52.52, lng: 13.41 }]);
    mockGetCachedGeocode.mockResolvedValue(null);
    mockSetCachedGeocode.mockResolvedValue(undefined);
    mockGetCachedPlaceDetails.mockResolvedValue(null);
    mockSetCachedPlaceDetails.mockResolvedValue(undefined);
    mockGetSavedLocations.mockResolvedValue([{ id: 'loc1', label: 'Home', lat: 52.52, lng: 13.405 }]);
    mockSaveSavedLocation.mockResolvedValue({ id: 'loc2', label: 'Work', lat: 52.5, lng: 13.4 });
    mockDeleteSavedLocation.mockResolvedValue(true);
  });

  // ===========================================
  // Status
  // ===========================================

  describe('GET /api/:context/maps/status', () => {
    it('should return maps availability status', async () => {
      const res = await request(app).get('/api/personal/maps/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.available).toBe(true);
      expect(res.body.features).toHaveProperty('geocoding');
    });
  });

  // ===========================================
  // Geocoding
  // ===========================================

  describe('POST /api/:context/maps/geocode', () => {
    it('should geocode an address', async () => {
      const res = await request(app)
        .post('/api/personal/maps/geocode')
        .send({ address: 'Berlin, Germany' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lat).toBe(52.52);
      expect(res.body.source).toBe('google');
    });

    it('should return cached result if available', async () => {
      mockGetCachedGeocode.mockResolvedValueOnce({ lat: 52.52, lng: 13.405 });
      const res = await request(app)
        .post('/api/personal/maps/geocode')
        .send({ address: 'Berlin' });
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('cache');
      expect(mockGeocode).not.toHaveBeenCalled();
    });

    it('should return 400 when address is missing', async () => {
      const res = await request(app)
        .post('/api/personal/maps/geocode')
        .send({});
      expect(res.status).toBe(400);
    });

    it('should return 404 when address not found', async () => {
      mockGeocode.mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/api/personal/maps/geocode')
        .send({ address: 'nonexistent place' });
      expect(res.status).toBe(404);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/maps/geocode')
        .send({ address: 'Berlin' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/maps/reverse-geocode', () => {
    it('should reverse geocode coordinates', async () => {
      const res = await request(app)
        .post('/api/personal/maps/reverse-geocode')
        .send({ lat: 52.52, lng: 13.405 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when coordinates are invalid', async () => {
      const res = await request(app)
        .post('/api/personal/maps/reverse-geocode')
        .send({ lat: 'not-a-number', lng: 13.405 });
      expect(res.status).toBe(400);
    });

    it('should return 404 when location not found', async () => {
      mockReverseGeocode.mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/api/personal/maps/reverse-geocode')
        .send({ lat: 0, lng: 0 });
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Autocomplete
  // ===========================================

  describe('GET /api/:context/maps/autocomplete', () => {
    it('should return autocomplete suggestions', async () => {
      const res = await request(app).get('/api/personal/maps/autocomplete?input=Berlin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should return empty array for short input', async () => {
      const res = await request(app).get('/api/personal/maps/autocomplete?input=B');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ===========================================
  // Place Details
  // ===========================================

  describe('GET /api/:context/maps/places/:placeId', () => {
    it('should return place details', async () => {
      const res = await request(app).get('/api/personal/maps/places/ChIJAVkDPzdOqEcRcDteW0YgIQQ');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Brandenburger Tor');
    });

    it('should return 404 for unknown place', async () => {
      mockGetPlaceDetails.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/personal/maps/places/unknown-id');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Directions
  // ===========================================

  describe('POST /api/:context/maps/directions', () => {
    it('should return directions', async () => {
      const res = await request(app)
        .post('/api/personal/maps/directions')
        .send({ origin: 'Berlin', destination: 'Hamburg' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when origin or destination missing', async () => {
      const res = await request(app)
        .post('/api/personal/maps/directions')
        .send({ origin: 'Berlin' });
      expect(res.status).toBe(400);
    });

    it('should return 404 when no route found', async () => {
      mockGetDirections.mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/api/personal/maps/directions')
        .send({ origin: 'A', destination: 'B' });
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Distance Matrix
  // ===========================================

  describe('POST /api/:context/maps/distance-matrix', () => {
    it('should return distance matrix', async () => {
      const res = await request(app)
        .post('/api/personal/maps/distance-matrix')
        .send({ origins: ['Berlin'], destinations: ['Hamburg'] });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when origins is not an array', async () => {
      const res = await request(app)
        .post('/api/personal/maps/distance-matrix')
        .send({ origins: 'Berlin', destinations: ['Hamburg'] });
      expect(res.status).toBe(400);
    });

    it('should return 400 when arrays are empty', async () => {
      const res = await request(app)
        .post('/api/personal/maps/distance-matrix')
        .send({ origins: [], destinations: ['Hamburg'] });
      expect(res.status).toBe(400);
    });

    it('should return 400 when too many pairs', async () => {
      const res = await request(app)
        .post('/api/personal/maps/distance-matrix')
        .send({ origins: Array(6).fill('A'), destinations: Array(6).fill('B') });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Nearby Search
  // ===========================================

  describe('POST /api/:context/maps/nearby', () => {
    it('should search nearby places', async () => {
      const res = await request(app)
        .post('/api/personal/maps/nearby')
        .send({ lat: 52.52, lng: 13.405, type: 'cafe' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should return 400 when coordinates are missing', async () => {
      const res = await request(app)
        .post('/api/personal/maps/nearby')
        .send({ type: 'cafe' });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Saved Locations
  // ===========================================

  describe('GET /api/:context/maps/saved-locations', () => {
    it('should list saved locations', async () => {
      const res = await request(app).get('/api/personal/maps/saved-locations');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/:context/maps/saved-locations', () => {
    it('should save a new location', async () => {
      const res = await request(app)
        .post('/api/personal/maps/saved-locations')
        .send({ label: 'Work', address: 'Friedrichstr. 1, Berlin', lat: 52.5, lng: 13.4 });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/personal/maps/saved-locations')
        .send({ label: 'Home' });
      expect(res.status).toBe(400);
    });

    it('should return 500 when save fails', async () => {
      mockSaveSavedLocation.mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/api/personal/maps/saved-locations')
        .send({ label: 'X', address: 'Y', lat: 0, lng: 0 });
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/:context/maps/saved-locations/:id', () => {
    it('should delete a saved location', async () => {
      const res = await request(app).delete('/api/personal/maps/saved-locations/loc1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent location', async () => {
      mockDeleteSavedLocation.mockResolvedValueOnce(false);
      const res = await request(app).delete('/api/personal/maps/saved-locations/unknown');
      expect(res.status).toBe(404);
    });
  });
});
