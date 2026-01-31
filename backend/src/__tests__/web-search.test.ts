/**
 * Web Search Service Tests
 */

import { searchWeb, formatSearchResults } from '../services/web-search';

describe('Web Search Service', () => {
  describe('searchWeb', () => {
    it('should return error for empty query', async () => {
      const result = await searchWeb('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('leer');
    });

    it('should return error for whitespace-only query', async () => {
      const result = await searchWeb('   ');
      expect(result.success).toBe(false);
      expect(result.error).toContain('leer');
    });

    // Integration test - only run if network available
    it('should search with DuckDuckGo fallback', async () => {
      // Skip in CI or if no network
      if (process.env.CI || process.env.SKIP_NETWORK_TESTS) {
        return;
      }

      // Without BRAVE_SEARCH_API_KEY, it falls back to DuckDuckGo
      const result = await searchWeb('TypeScript programming', { count: 3, timeout: 10000 });

      // DuckDuckGo may rate-limit or block - test is non-deterministic
      // We only verify the response structure, not that results are returned
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('searchTimeMs');

      if (result.success && result.results.length > 0) {
        expect(result.results[0].url).toBeTruthy();
        expect(result.results[0].title).toBeTruthy();
      }
    }, 15000);
  });

  describe('formatSearchResults', () => {
    it('should format error response', () => {
      const response = {
        query: 'test',
        results: [],
        totalResults: 0,
        searchTimeMs: 0,
        success: false,
        error: 'API Error',
      };

      const formatted = formatSearchResults(response);
      expect(formatted).toContain('fehlgeschlagen');
      expect(formatted).toContain('API Error');
    });

    it('should format empty results', () => {
      const response = {
        query: 'obscure query xyz123',
        results: [],
        totalResults: 0,
        searchTimeMs: 100,
        success: true,
      };

      const formatted = formatSearchResults(response);
      expect(formatted).toContain('Keine Ergebnisse');
      expect(formatted).toContain('obscure query xyz123');
    });

    it('should format results with descriptions', () => {
      const response = {
        query: 'test query',
        results: [
          {
            title: 'Test Result 1',
            url: 'https://example.com/1',
            description: 'This is the first result',
            domain: 'example.com',
            position: 1,
          },
          {
            title: 'Test Result 2',
            url: 'https://example.com/2',
            description: 'This is the second result',
            domain: 'example.com',
            position: 2,
          },
        ],
        totalResults: 2,
        searchTimeMs: 150,
        success: true,
      };

      const formatted = formatSearchResults(response);
      expect(formatted).toContain('**Suchergebnisse für "test query"**');
      expect(formatted).toContain('1. **Test Result 1**');
      expect(formatted).toContain('2. **Test Result 2**');
      expect(formatted).toContain('example.com/1');
      expect(formatted).toContain('This is the first result');
      expect(formatted).toContain('150ms');
    });

    it('should include published date if available', () => {
      const response = {
        query: 'news',
        results: [
          {
            title: 'News Article',
            url: 'https://news.example.com/article',
            description: 'Breaking news',
            domain: 'news.example.com',
            position: 1,
            publishedDate: '2026-01-15',
          },
        ],
        totalResults: 1,
        searchTimeMs: 100,
        success: true,
      };

      const formatted = formatSearchResults(response);
      expect(formatted).toContain('2026-01-15');
      expect(formatted).toContain('Veröffentlicht');
    });
  });
});
