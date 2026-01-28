/**
 * URL Fetch Service Tests
 */

import { fetchUrl, isValidUrl, extractDomain, formatForTool } from '../services/url-fetch';

describe('URL Fetch Service', () => {
  describe('isValidUrl', () => {
    it('should accept valid HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path/to/page')).toBe(true);
      expect(isValidUrl('https://sub.domain.example.com')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('file:///etc/passwd')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from URL', () => {
      expect(extractDomain('https://www.example.com/page')).toBe('www.example.com');
      expect(extractDomain('https://api.github.com/repos')).toBe('api.github.com');
    });

    it('should return null for invalid URLs', () => {
      expect(extractDomain('not-a-url')).toBeNull();
    });
  });

  describe('fetchUrl', () => {
    it('should return error for invalid URL', async () => {
      const result = await fetchUrl('not-a-url');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Ungültige URL.');
    });

    it('should return error for non-HTTP protocol', async () => {
      const result = await fetchUrl('ftp://example.com');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Nur HTTP und HTTPS URLs werden unterstützt.');
    });

    // Integration test - only run if network available
    it('should fetch real URL content', async () => {
      // Skip in CI or if no network
      if (process.env.CI || process.env.SKIP_NETWORK_TESTS) {
        return;
      }

      const result = await fetchUrl('https://example.com', { timeout: 5000 });

      expect(result.success).toBe(true);
      expect(result.title).toBeTruthy();
      expect(result.domain).toBe('example.com');
      expect(result.content).toBeTruthy();
      expect(result.wordCount).toBeGreaterThan(0);
    }, 10000);
  });

  describe('formatForTool', () => {
    it('should format error result', () => {
      const result = {
        title: '',
        content: '',
        description: '',
        url: 'https://example.com',
        domain: 'example.com',
        readingTimeMinutes: 0,
        wordCount: 0,
        success: false,
        error: 'Connection failed',
      };

      const formatted = formatForTool(result);
      expect(formatted).toContain('Fehler');
      expect(formatted).toContain('Connection failed');
    });

    it('should format successful result', () => {
      const result = {
        title: 'Test Article',
        content: 'This is the article content.',
        description: 'A test description',
        url: 'https://example.com/article',
        domain: 'example.com',
        readingTimeMinutes: 2,
        wordCount: 400,
        author: 'Test Author',
        success: true,
      };

      const formatted = formatForTool(result);
      expect(formatted).toContain('**Test Article**');
      expect(formatted).toContain('example.com/article');
      expect(formatted).toContain('Test Author');
      expect(formatted).toContain('400 Wörter');
    });
  });
});
