/**
 * Google Maps Service Tests
 *
 * Tests for geocoding, reverse geocoding, autocomplete,
 * place details, directions, and distance matrix.
 */

jest.mock('axios');
jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import axios from 'axios';
import {
  isGoogleMapsAvailable,
  geocode,
  reverseGeocode,
  autocomplete,
  getPlaceDetails,
  getDirections,
  getDistanceMatrix,
} from '../../../services/google-maps';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Google Maps Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isGoogleMapsAvailable', () => {
    it('should return true when API key is set', () => {
      expect(isGoogleMapsAvailable()).toBe(true);
    });

    it('should return false when API key is missing', () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      expect(isGoogleMapsAvailable()).toBe(false);
    });
  });

  describe('geocode', () => {
    it('should return geocoding result', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          results: [{
            geometry: { location: { lat: 52.52, lng: 13.405 } },
            formatted_address: 'Berlin, Germany',
            place_id: 'place-123',
            address_components: [{ long_name: 'Berlin', short_name: 'Berlin', types: ['locality'] }],
          }],
        },
      });

      const result = await geocode('Berlin');

      expect(result).not.toBeNull();
      expect(result!.lat).toBe(52.52);
      expect(result!.formattedAddress).toBe('Berlin, Germany');
    });

    it('should return null when no results', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [] } });

      const result = await geocode('Nonexistent Place');
      expect(result).toBeNull();
    });

    it('should return null when API key is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;

      const result = await geocode('Berlin');
      expect(result).toBeNull();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should return null on API error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await geocode('Berlin');
      expect(result).toBeNull();
    });
  });

  describe('reverseGeocode', () => {
    it('should return address from coordinates', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          results: [{
            geometry: { location: { lat: 48.137, lng: 11.576 } },
            formatted_address: 'Munich, Germany',
            place_id: 'place-456',
            address_components: [],
          }],
        },
      });

      const result = await reverseGeocode(48.137, 11.576);

      expect(result).not.toBeNull();
      expect(result!.formattedAddress).toBe('Munich, Germany');
    });

    it('should return null without API key', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      expect(await reverseGeocode(48, 11)).toBeNull();
    });
  });

  describe('autocomplete', () => {
    it('should return place suggestions', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 'OK',
          predictions: [{
            place_id: 'p1',
            description: 'Berlin, Germany',
            structured_formatting: { main_text: 'Berlin', secondary_text: 'Germany' },
            types: ['locality'],
          }],
        },
      });

      const results = await autocomplete('Berl');

      expect(results).toHaveLength(1);
      expect(results[0].description).toBe('Berlin, Germany');
      expect(results[0].mainText).toBe('Berlin');
    });

    it('should return empty array when not configured', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      expect(await autocomplete('test')).toEqual([]);
    });

    it('should return empty array on ZERO_RESULTS', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: 'ZERO_RESULTS', predictions: [] },
      });

      expect(await autocomplete('zzzzzzz')).toEqual([]);
    });
  });

  describe('getPlaceDetails', () => {
    it('should return mapped place details', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 'OK',
          result: {
            place_id: 'p1', name: 'Coffee Shop',
            formatted_address: '123 Main St',
            geometry: { location: { lat: 52.5, lng: 13.4 } },
            types: ['cafe'],
            opening_hours: {
              open_now: true,
              periods: [{ open: { day: 1, time: '0800' }, close: { day: 1, time: '1800' } }],
              weekday_text: ['Mo: 08:00-18:00'],
            },
            formatted_phone_number: '+49 123',
            website: 'https://coffee.com',
            rating: 4.5,
            price_level: 2,
          },
        },
      });

      const result = await getPlaceDetails('p1');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Coffee Shop');
      expect(result!.openingHours!.openNow).toBe(true);
      expect(result!.rating).toBe(4.5);
    });

    it('should return null on non-OK status', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: 'NOT_FOUND', result: null },
      });

      expect(await getPlaceDetails('bad-id')).toBeNull();
    });
  });

  describe('getDirections', () => {
    it('should return directions result', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 'OK',
          routes: [{
            summary: 'A9',
            legs: [{
              start_address: 'Berlin',
              end_address: 'Munich',
              duration: { value: 21600 },
              duration_in_traffic: { value: 25200 },
              distance: { value: 584000 },
              steps: [{
                html_instructions: '<b>Head south</b>',
                distance: { value: 1000 },
                duration: { value: 120 },
                travel_mode: 'DRIVING',
              }],
            }],
          }],
        },
      });

      const result = await getDirections('Berlin', 'Munich');

      expect(result).not.toBeNull();
      expect(result!.durationMinutes).toBe(360);
      expect(result!.distanceKm).toBe(584);
      expect(result!.steps[0].instruction).toBe('Head south');
    });

    it('should return null when not configured', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      expect(await getDirections('A', 'B')).toBeNull();
    });

    it('should return null on API error', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: 'NOT_FOUND', routes: [] },
      });

      expect(await getDirections('nowhere', 'nowhere2')).toBeNull();
    });
  });

  describe('getDistanceMatrix', () => {
    it('should return empty array when not configured', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      expect(await getDistanceMatrix(['A'], ['B'])).toEqual([]);
    });
  });
});
