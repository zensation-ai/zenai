/**
 * Google Maps Service Tests - Phase 41
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock axios
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
  isGoogleMapsAvailable,
  geocode,
  autocomplete,
  getDirections,
  getDistanceMatrix,
  searchNearby,
  getPlaceDetails,
} from '../../../services/google-maps';

describe('Google Maps Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when GOOGLE_MAPS_API_KEY is not set', () => {
    beforeEach(() => {
      delete process.env.GOOGLE_MAPS_API_KEY;
    });

    it('isGoogleMapsAvailable returns false', () => {
      expect(isGoogleMapsAvailable()).toBe(false);
    });

    it('geocode returns null', async () => {
      const result = await geocode('Berlin');
      expect(result).toBeNull();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('autocomplete returns empty array', async () => {
      const result = await autocomplete('Cafe');
      expect(result).toEqual([]);
    });

    it('getDirections returns null', async () => {
      const result = await getDirections('Berlin', 'Munich');
      expect(result).toBeNull();
    });

    it('getDistanceMatrix returns empty array', async () => {
      const result = await getDistanceMatrix(['Berlin'], ['Munich']);
      expect(result).toEqual([]);
    });

    it('searchNearby returns empty array', async () => {
      const result = await searchNearby(52.52, 13.405);
      expect(result).toEqual([]);
    });

    it('getPlaceDetails returns null', async () => {
      const result = await getPlaceDetails('ChIJAVkDPzdOqEcRcDteW0YgIQQ');
      expect(result).toBeNull();
    });
  });

  describe('when GOOGLE_MAPS_API_KEY is set', () => {
    beforeEach(() => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';
    });

    afterEach(() => {
      delete process.env.GOOGLE_MAPS_API_KEY;
    });

    it('isGoogleMapsAvailable returns true', () => {
      expect(isGoogleMapsAvailable()).toBe(true);
    });

    it('geocode calls Google Maps API and returns result', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          results: [{
            geometry: { location: { lat: 52.52, lng: 13.405 } },
            formatted_address: 'Berlin, Germany',
            place_id: 'ChIJAVkDPzdOqEcRcDteW0YgIQQ',
            address_components: [{ long_name: 'Berlin', short_name: 'Berlin', types: ['locality'] }],
          }],
        },
      });

      const result = await geocode('Berlin');

      expect(result).toEqual({
        lat: 52.52,
        lng: 13.405,
        formattedAddress: 'Berlin, Germany',
        placeId: 'ChIJAVkDPzdOqEcRcDteW0YgIQQ',
        addressComponents: [{ long_name: 'Berlin', short_name: 'Berlin', types: ['locality'] }],
      });
    });

    it('geocode returns null on empty results', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [] } });

      const result = await geocode('nonexistent place xyz');
      expect(result).toBeNull();
    });

    it('geocode returns null on API error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await geocode('Berlin');
      expect(result).toBeNull();
    });

    it('autocomplete calls Places API and returns predictions', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 'OK',
          predictions: [
            {
              place_id: 'place1',
              description: 'Cafe Leopold, Munich',
              structured_formatting: { main_text: 'Cafe Leopold', secondary_text: 'Munich, Germany' },
              types: ['cafe', 'establishment'],
            },
          ],
        },
      });

      const results = await autocomplete('Cafe Leo');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        placeId: 'place1',
        description: 'Cafe Leopold, Munich',
        mainText: 'Cafe Leopold',
        secondaryText: 'Munich, Germany',
        types: ['cafe', 'establishment'],
      });
    });

    it('getPlaceDetails returns full details with opening hours', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 'OK',
          result: {
            place_id: 'place1',
            name: 'Cafe Leopold',
            formatted_address: 'Leopoldstr. 50, Munich',
            geometry: { location: { lat: 48.157, lng: 11.583 } },
            types: ['cafe'],
            opening_hours: {
              open_now: true,
              periods: [{ open: { day: 1, time: '0800' }, close: { day: 1, time: '2300' } }],
              weekday_text: ['Montag: 08:00-23:00'],
            },
            formatted_phone_number: '+49 89 123456',
            website: 'https://cafe-leopold.de',
            rating: 4.2,
            price_level: 2,
          },
        },
      });

      const result = await getPlaceDetails('place1');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Cafe Leopold');
      expect(result!.openingHours).not.toBeNull();
      expect(result!.openingHours!.openNow).toBe(true);
      expect(result!.phone).toBe('+49 89 123456');
      expect(result!.rating).toBe(4.2);
    });

    it('getDirections returns route with traffic data', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 'OK',
          routes: [{
            summary: 'A9',
            legs: [{
              start_address: 'Berlin, Germany',
              end_address: 'Munich, Germany',
              duration: { value: 21600, text: '6 hours' },
              duration_in_traffic: { value: 23400, text: '6 hours 30 min' },
              distance: { value: 585000, text: '585 km' },
              steps: [],
            }],
          }],
        },
      });

      const result = await getDirections('Berlin', 'Munich');

      expect(result).not.toBeNull();
      expect(result!.durationMinutes).toBe(360);
      expect(result!.durationInTrafficMinutes).toBe(390);
      expect(result!.distanceKm).toBe(585);
      expect(result!.summary).toBe('A9');
    });

    it('getDistanceMatrix returns matrix entries', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 'OK',
          origin_addresses: ['Berlin', 'Munich'],
          destination_addresses: ['Berlin', 'Munich'],
          rows: [
            { elements: [
              { status: 'OK', duration: { value: 0 }, distance: { value: 0 } },
              { status: 'OK', duration: { value: 21600 }, duration_in_traffic: { value: 23400 }, distance: { value: 585000 } },
            ]},
            { elements: [
              { status: 'OK', duration: { value: 21600 }, distance: { value: 585000 } },
              { status: 'OK', duration: { value: 0 }, distance: { value: 0 } },
            ]},
          ],
        },
      });

      const results = await getDistanceMatrix(['Berlin', 'Munich'], ['Berlin', 'Munich']);

      expect(results).toHaveLength(4);
      expect(results[1].durationMinutes).toBe(360);
      expect(results[1].durationInTrafficMinutes).toBe(390);
    });

    it('searchNearby returns places', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 'OK',
          results: [{
            place_id: 'place1',
            name: 'Cafe Leopold',
            vicinity: 'Leopoldstr. 50',
            geometry: { location: { lat: 48.157, lng: 11.583 } },
            types: ['cafe'],
            rating: 4.2,
            opening_hours: { open_now: true },
          }],
        },
      });

      const results = await searchNearby(48.15, 11.58, { keyword: 'Cafe' });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Cafe Leopold');
      expect(results[0].openNow).toBe(true);
    });
  });
});
