/**
 * Maps Tool Handlers Tests - Phase 41
 */

// Mock google-maps service
jest.mock('../../../services/google-maps', () => ({
  isGoogleMapsAvailable: jest.fn<any>(),
  getDirections: jest.fn<any>(),
  getPlaceDetails: jest.fn<any>(),
  searchNearby: jest.fn<any>(),
  autocomplete: jest.fn<any>(),
  geocode: jest.fn<any>(),
  getDistanceMatrix: jest.fn<any>(),
}));

// Mock location-cache
jest.mock('../../../services/location-cache', () => ({
  getCachedGeocode: jest.fn<any>().mockResolvedValue(null),
  setCachedGeocode: jest.fn<any>().mockResolvedValue(undefined),
  getCachedPlaceDetails: jest.fn<any>().mockResolvedValue(null),
  setCachedPlaceDetails: jest.fn<any>().mockResolvedValue(undefined),
}));

// Mock travel-estimator
jest.mock('../../../services/travel-estimator', () => ({
  estimateTravelDuration: jest.fn<any>(),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  handleGetDirections,
  handleGetOpeningHours,
  handleFindNearbyPlaces,
  handleOptimizeDayRoute,
} from '../../../services/tool-handlers/maps-tools';

import { isGoogleMapsAvailable, getDirections, autocomplete, getPlaceDetails, geocode, searchNearby, getDistanceMatrix } from '../../../services/google-maps';
import { estimateTravelDuration } from '../../../services/travel-estimator';
import type { ToolExecutionContext } from '../../../services/claude/tool-use';

var mockContext: ToolExecutionContext = {
  aiContext: 'personal',
  sessionId: 'test-session',
};

describe('Maps Tool Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleGetDirections', () => {
    it('returns error when origin is missing', async () => {
      const result = await handleGetDirections({ destination: 'Munich' }, mockContext);
      expect(result).toContain('Fehler');
    });

    it('returns error when destination is missing', async () => {
      const result = await handleGetDirections({ origin: 'Berlin' }, mockContext);
      expect(result).toContain('Fehler');
    });

    it('uses Google Maps when available', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(true);
      (getDirections as jest.Mock<any>).mockResolvedValue({
        origin: 'Berlin, Germany',
        destination: 'Munich, Germany',
        durationMinutes: 360,
        durationInTrafficMinutes: 390,
        distanceKm: 585,
        summary: 'A9',
        steps: [],
        departureTime: null,
        arrivalTime: null,
      });

      const result = await handleGetDirections(
        { origin: 'Berlin', destination: 'Munich' },
        mockContext
      );

      expect(result).toContain('585 km');
      expect(result).toContain('6 Std.');
      expect(result).toContain('Google Maps');
    });

    it('shows traffic duration when different from normal', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(true);
      (getDirections as jest.Mock<any>).mockResolvedValue({
        origin: 'Berlin',
        destination: 'Munich',
        durationMinutes: 360,
        durationInTrafficMinutes: 420,
        distanceKm: 585,
        summary: 'A9',
        steps: [],
        departureTime: null,
        arrivalTime: null,
      });

      const result = await handleGetDirections(
        { origin: 'Berlin', destination: 'Munich' },
        mockContext
      );

      expect(result).toContain('aktuellem Verkehr');
      expect(result).toContain('7 Std.');
    });

    it('falls back to travel estimator when Google Maps unavailable', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(false);
      (estimateTravelDuration as jest.Mock<any>).mockResolvedValue({
        origin: 'Berlin',
        destination: 'Munich',
        duration_minutes: 360,
        distance_km: 585,
        mode: 'driving',
        source: 'estimate',
      });

      const result = await handleGetDirections(
        { origin: 'Berlin', destination: 'Munich' },
        mockContext
      );

      expect(result).toContain('Schaetzung');
      expect(result).toContain('585 km');
    });
  });

  describe('handleGetOpeningHours', () => {
    it('returns error when place is missing', async () => {
      const result = await handleGetOpeningHours({}, mockContext);
      expect(result).toContain('Fehler');
    });

    it('returns message when Google Maps is not configured', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(false);
      const result = await handleGetOpeningHours({ place: 'Cafe Leopold' }, mockContext);
      expect(result).toContain('nicht konfiguriert');
    });

    it('returns opening hours for a place', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(true);
      (autocomplete as jest.Mock<any>).mockResolvedValue([{
        placeId: 'place1',
        description: 'Cafe Leopold, Munich',
      }]);
      (getPlaceDetails as jest.Mock<any>).mockResolvedValue({
        placeId: 'place1',
        name: 'Cafe Leopold',
        formattedAddress: 'Leopoldstr. 50, Munich',
        lat: 48.157,
        lng: 11.583,
        types: ['cafe'],
        openingHours: {
          openNow: true,
          periods: [],
          weekdayText: ['Montag: 08:00-23:00', 'Dienstag: 08:00-23:00'],
        },
        phone: '+49 89 123456',
        website: null,
        rating: 4.2,
        priceLevel: 2,
      });

      const result = await handleGetOpeningHours({ place: 'Cafe Leopold' }, mockContext);

      expect(result).toContain('Cafe Leopold');
      expect(result).toContain('Geoeffnet');
      expect(result).toContain('Montag: 08:00-23:00');
      expect(result).toContain('+49 89 123456');
    });

    it('returns not found message for unknown place', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(true);
      (autocomplete as jest.Mock<any>).mockResolvedValue([]);

      const result = await handleGetOpeningHours({ place: 'NonexistentPlace123' }, mockContext);
      expect(result).toContain('Kein Geschaeft gefunden');
    });
  });

  describe('handleFindNearbyPlaces', () => {
    it('returns error when location is missing', async () => {
      const result = await handleFindNearbyPlaces({}, mockContext);
      expect(result).toContain('Fehler');
    });

    it('returns message when Google Maps is not configured', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(false);
      const result = await handleFindNearbyPlaces({ location: 'Berlin' }, mockContext);
      expect(result).toContain('nicht konfiguriert');
    });

    it('returns nearby places', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(true);
      (geocode as jest.Mock<any>).mockResolvedValue({
        lat: 52.52,
        lng: 13.405,
        formattedAddress: 'Berlin',
        placeId: 'place1',
        addressComponents: [],
      });
      (searchNearby as jest.Mock<any>).mockResolvedValue([
        { placeId: 'p1', name: 'Cafe XYZ', vicinity: 'Friedrichstr.', lat: 52.52, lng: 13.41, types: ['cafe'], rating: 4.0, openNow: true },
        { placeId: 'p2', name: 'Restaurant ABC', vicinity: 'Unter den Linden', lat: 52.52, lng: 13.39, types: ['restaurant'], rating: 3.5, openNow: false },
      ]);

      const result = await handleFindNearbyPlaces(
        { location: 'Berlin Mitte', keyword: 'Cafe' },
        mockContext
      );

      expect(result).toContain('2 Ergebnisse');
      expect(result).toContain('Cafe XYZ');
      expect(result).toContain('Geoeffnet');
      expect(result).toContain('Restaurant ABC');
      expect(result).toContain('Geschlossen');
    });
  });

  describe('handleOptimizeDayRoute', () => {
    it('returns error when locations list is too short', async () => {
      const result = await handleOptimizeDayRoute({ locations: ['Berlin'] }, mockContext);
      expect(result).toContain('Mindestens 2 Orte');
    });

    it('returns error when locations list is too long', async () => {
      const locations = Array.from({ length: 11 }, (_, i) => `City ${i}`);
      const result = await handleOptimizeDayRoute({ locations }, mockContext);
      expect(result).toContain('Maximal 10');
    });

    it('returns message when Google Maps is not configured', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(false);
      const result = await handleOptimizeDayRoute({ locations: ['A', 'B'] }, mockContext);
      expect(result).toContain('nicht konfiguriert');
    });

    it('optimizes route with distance matrix', async () => {
      (isGoogleMapsAvailable as jest.Mock<any>).mockReturnValue(true);
      (getDistanceMatrix as jest.Mock<any>).mockResolvedValue([
        { origin: 'A', destination: 'A', durationMinutes: 0, durationInTrafficMinutes: null, distanceKm: 0, status: 'OK' },
        { origin: 'A', destination: 'B', durationMinutes: 30, durationInTrafficMinutes: null, distanceKm: 25, status: 'OK' },
        { origin: 'A', destination: 'C', durationMinutes: 60, durationInTrafficMinutes: null, distanceKm: 50, status: 'OK' },
        { origin: 'B', destination: 'A', durationMinutes: 30, durationInTrafficMinutes: null, distanceKm: 25, status: 'OK' },
        { origin: 'B', destination: 'B', durationMinutes: 0, durationInTrafficMinutes: null, distanceKm: 0, status: 'OK' },
        { origin: 'B', destination: 'C', durationMinutes: 20, durationInTrafficMinutes: null, distanceKm: 15, status: 'OK' },
        { origin: 'C', destination: 'A', durationMinutes: 60, durationInTrafficMinutes: null, distanceKm: 50, status: 'OK' },
        { origin: 'C', destination: 'B', durationMinutes: 20, durationInTrafficMinutes: null, distanceKm: 15, status: 'OK' },
        { origin: 'C', destination: 'C', durationMinutes: 0, durationInTrafficMinutes: null, distanceKm: 0, status: 'OK' },
      ]);

      const result = await handleOptimizeDayRoute(
        { locations: ['A', 'B', 'C'] },
        mockContext
      );

      expect(result).toContain('Optimierte Reihenfolge');
      expect(result).toContain('Gesamte Reisezeit');
    });
  });
});
