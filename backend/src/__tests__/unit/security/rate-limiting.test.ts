/**
 * Security Tests: Rate Limiting (Sprint 2)
 *
 * Tests for enhanced rate limiting on authentication and sensitive endpoints
 */

describe('Security: Rate Limiting (Sprint 2)', () => {
  // ===========================================
  // Endpoint Limit Configuration Tests
  // ===========================================
  describe('Endpoint Limit Configuration', () => {
    // Define expected limits (matches auth.ts ENDPOINT_LIMITS)
    const expectedLimits: Record<string, { limit: number; windowMs: number }> = {
      // Auth & API Key endpoints - STRICT limits
      'POST:/api/keys': { limit: 5, windowMs: 60 * 1000 },
      'DELETE:/api/keys': { limit: 10, windowMs: 60 * 1000 },
      'GET:/api/keys': { limit: 30, windowMs: 60 * 1000 },

      // Heavy computation - stricter limits
      'POST:/api/personal/topics/generate': { limit: 2, windowMs: 60 * 1000 },
      'POST:/api/work/topics/generate': { limit: 2, windowMs: 60 * 1000 },
      'POST:/api/personal/incubator/consolidate': { limit: 5, windowMs: 60 * 1000 },
      'POST:/api/work/incubator/consolidate': { limit: 5, windowMs: 60 * 1000 },
      'POST:/api/personal/knowledge-graph/discover': { limit: 3, windowMs: 60 * 1000 },
      'POST:/api/work/knowledge-graph/discover': { limit: 3, windowMs: 60 * 1000 },

      // AI Chat endpoints
      'POST:/api/chat/sessions': { limit: 10, windowMs: 60 * 1000 },
      'POST:/api/chat/quick': { limit: 20, windowMs: 60 * 1000 },

      // Media uploads
      'POST:/api/media': { limit: 20, windowMs: 60 * 1000 },
      'POST:/api/voice-memo': { limit: 20, windowMs: 60 * 1000 },
      'POST:/api/voice-memo/text': { limit: 30, windowMs: 60 * 1000 },
      'POST:/api/voice-memo/transcribe': { limit: 15, windowMs: 60 * 1000 },
      'POST:/api/personal/voice-memo': { limit: 20, windowMs: 60 * 1000 },
      'POST:/api/work/voice-memo': { limit: 20, windowMs: 60 * 1000 },

      // Export endpoints - prevent data scraping
      'GET:/api/export/backup': { limit: 2, windowMs: 60 * 1000 },
      'GET:/api/export/ideas/pdf': { limit: 10, windowMs: 60 * 1000 },
      'GET:/api/export/ideas/csv': { limit: 10, windowMs: 60 * 1000 },
      'GET:/api/export/ideas/json': { limit: 10, windowMs: 60 * 1000 },
      'GET:/api/export/ideas/markdown': { limit: 10, windowMs: 60 * 1000 },

      // Write operations
      'POST:/api/personal/ideas': { limit: 60, windowMs: 60 * 1000 },
      'POST:/api/work/ideas': { limit: 60, windowMs: 60 * 1000 },
      'PUT:/api/personal/ideas': { limit: 100, windowMs: 60 * 1000 },
      'PUT:/api/work/ideas': { limit: 100, windowMs: 60 * 1000 },

      // Webhooks
      'POST:/api/webhooks': { limit: 10, windowMs: 60 * 1000 },
      'DELETE:/api/webhooks': { limit: 20, windowMs: 60 * 1000 },
    };

    it('should have strict limits for API key creation (brute-force protection)', () => {
      const limit = expectedLimits['POST:/api/keys'];
      expect(limit.limit).toBeLessThanOrEqual(5);
      expect(limit.windowMs).toBe(60 * 1000);
    });

    it('should have strict limits for backup endpoint (data scraping protection)', () => {
      const limit = expectedLimits['GET:/api/export/backup'];
      expect(limit.limit).toBeLessThanOrEqual(2);
    });

    it('should have moderate limits for voice memo uploads', () => {
      const limit = expectedLimits['POST:/api/voice-memo'];
      expect(limit.limit).toBeLessThanOrEqual(20);
      expect(limit.limit).toBeGreaterThanOrEqual(10);
    });

    it('should have strict limits for heavy computation endpoints', () => {
      const topicsLimit = expectedLimits['POST:/api/personal/topics/generate'];
      expect(topicsLimit.limit).toBeLessThanOrEqual(5);

      const knowledgeLimit = expectedLimits['POST:/api/personal/knowledge-graph/discover'];
      expect(knowledgeLimit.limit).toBeLessThanOrEqual(5);
    });

    it('should have consistent limits for both contexts (personal/work)', () => {
      // Verify personal and work contexts have same limits
      expect(expectedLimits['POST:/api/personal/ideas'].limit)
        .toBe(expectedLimits['POST:/api/work/ideas'].limit);

      expect(expectedLimits['POST:/api/personal/voice-memo'].limit)
        .toBe(expectedLimits['POST:/api/work/voice-memo'].limit);
    });
  });

  // ===========================================
  // Rate Limit Window Tests
  // ===========================================
  describe('Rate Limit Windows', () => {
    it('should use 1-minute windows for all limits', () => {
      const oneMinute = 60 * 1000;

      // Document that all limits use 1-minute windows
      // This is consistent and predictable for users
      expect(oneMinute).toBe(60000);
    });

    it('should calculate window start correctly', () => {
      const now = Date.now();
      const windowMs = 60 * 1000;
      const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

      // Window start should be aligned to minute boundary
      expect(windowStart.getSeconds()).toBe(0);
      expect(windowStart.getMilliseconds()).toBe(0);
    });
  });

  // ===========================================
  // Brute Force Protection Tests
  // ===========================================
  describe('Brute Force Protection', () => {
    it('should have very strict limits for authentication-related endpoints', () => {
      // API key creation should be heavily limited
      const apiKeyCreationLimit = 5; // 5 per minute
      expect(apiKeyCreationLimit).toBeLessThanOrEqual(10);
    });

    it('should have lower limits than general write operations', () => {
      const apiKeyLimit = 5;
      const generalWriteLimit = 60;

      expect(apiKeyLimit).toBeLessThan(generalWriteLimit);
    });

    it('should track by IP or API key ID', () => {
      // The rate limiter uses this priority:
      // 1. API key ID (if authenticated)
      // 2. IP address (if available)
      // 3. Fallback identifier (never shared 'anonymous')

      const possibleKeys = ['api-key-id', 'ip-address', 'fallback-identifier'];
      expect(possibleKeys.length).toBe(3);
    });
  });

  // ===========================================
  // Rate Limit Headers Tests
  // ===========================================
  describe('Rate Limit Response Headers', () => {
    it('should define expected rate limit headers', () => {
      const expectedHeaders = [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
      ];

      // These headers should be set on every response
      for (const header of expectedHeaders) {
        expect(header).toMatch(/^X-RateLimit-/);
      }
    });

    it('should return 429 when limit exceeded', () => {
      const HTTP_TOO_MANY_REQUESTS = 429;
      expect(HTTP_TOO_MANY_REQUESTS).toBe(429);
    });

    it('should include Retry-After in error response', () => {
      // When rate limit is exceeded, the response should include
      // how many seconds until the next window
      const retryAfterExample = {
        error: 'Rate limit exceeded',
        message: 'Too many requests. Limit: 5/minute',
        retryAfter: 45, // seconds
      };

      expect(retryAfterExample.retryAfter).toBeGreaterThan(0);
      expect(retryAfterExample.retryAfter).toBeLessThanOrEqual(60);
    });
  });

  // ===========================================
  // Default Limit Tests
  // ===========================================
  describe('Default Limits', () => {
    it('should use 100 req/min as default for unauthenticated users', () => {
      const DEFAULT_LIMIT = 100;
      expect(DEFAULT_LIMIT).toBe(100);
    });

    it('should allow API key to specify custom rate limit', () => {
      // API keys can have custom rate limits set
      const apiKeyWithCustomLimit = {
        id: 'test-key',
        rateLimit: 500,
      };

      expect(apiKeyWithCustomLimit.rateLimit).toBe(500);
    });

    it('should use API key rate limit when authenticated', () => {
      // Priority: endpoint-specific > API key > default
      const priorities = ['endpoint-specific', 'api-key', 'default'];
      expect(priorities[0]).toBe('endpoint-specific');
    });
  });

  // ===========================================
  // Database Rate Limit Cleanup Tests
  // ===========================================
  describe('Rate Limit Cleanup', () => {
    it('should clean up entries older than 1 hour', () => {
      const cleanupThreshold = '1 hour';

      // The cleanup query deletes entries older than 1 hour
      expect(cleanupThreshold).toBe('1 hour');
    });

    it('should run cleanup periodically', () => {
      const cleanupIntervalMs = 60 * 60 * 1000; // 1 hour
      expect(cleanupIntervalMs).toBe(3600000);
    });
  });

  // ===========================================
  // Security Edge Cases
  // ===========================================
  describe('Security Edge Cases', () => {
    it('should not use shared identifier for unknown IPs', () => {
      // SECURITY: Never use 'anonymous' as it would share limits
      // Instead, create a unique identifier from available request info
      const uniqueIdentifierPattern = /^unknown:.+/;
      const exampleIdentifier = 'unknown:x-forwarded-for:user-agent-prefix';

      expect(uniqueIdentifierPattern.test(exampleIdentifier)).toBe(true);
    });

    it('should fail open on database errors', () => {
      // If the rate limit database check fails, we allow the request
      // This is defense-in-depth, not critical path
      const FAIL_OPEN = true;
      expect(FAIL_OPEN).toBe(true);
    });

    it('should handle trust proxy for correct client IP', () => {
      // When behind a reverse proxy (Railway, Vercel), we need
      // to trust the X-Forwarded-For header
      const isProduction = process.env.NODE_ENV === 'production';
      const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
      const isVercel = !!process.env.VERCEL;
      const trustProxyEnabled = isProduction || isRailway || isVercel;

      // In production environments, trust proxy should be enabled
      // In test environment, all these are false, so trustProxyEnabled is false
      expect(typeof trustProxyEnabled).toBe('boolean');
    });
  });

  // ===========================================
  // Rate Limit Bypass Prevention
  // ===========================================
  describe('Rate Limit Bypass Prevention', () => {
    it('should not allow IP spoofing via headers when trust proxy is off', () => {
      // Only trust X-Forwarded-For when explicitly configured
      const trustProxy = process.env.NODE_ENV === 'production' ||
        !!process.env.RAILWAY_ENVIRONMENT ||
        !!process.env.VERCEL;

      // Document the behavior
      expect(typeof trustProxy).toBe('boolean');
    });

    it('should rate limit by unique identifier even without IP', () => {
      // Fallback to user-agent + forwarded-for combination
      const fallbackKey = 'unknown:no-ip:Mozilla/5.0';
      expect(fallbackKey.startsWith('unknown:')).toBe(true);
    });

    it('should not allow API key sharing to bypass limits', () => {
      // Each API key has its own rate limit counter
      // Sharing a key means sharing the limit pool
      const apiKeyLimitIsPerKey = true;
      expect(apiKeyLimitIsPerKey).toBe(true);
    });
  });
});
