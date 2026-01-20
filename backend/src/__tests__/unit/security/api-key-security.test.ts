/**
 * Phase Security Sprint 3: API Key Security Tests
 */

import {
  checkKeyExpiry,
  KeyExpiryInfo,
} from '../../../services/api-key-security';

describe('API Key Security', () => {
  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;

  describe('checkKeyExpiry', () => {
    describe('Non-expiring keys', () => {
      it('should return not expired for key without expiry', () => {
        const createdAt = new Date(now.getTime() - 30 * DAY_MS);
        const result = checkKeyExpiry(null, createdAt);

        expect(result.isExpired).toBe(false);
        expect(result.isExpiringSoon).toBe(false);
        expect(result.isCritical).toBe(false);
        expect(result.daysUntilExpiry).toBeNull();
        expect(result.expiresAt).toBeNull();
      });

      it('should recommend rotation for old keys without expiry', () => {
        const createdAt = new Date(now.getTime() - 100 * DAY_MS); // 100 days old
        const result = checkKeyExpiry(null, createdAt);

        expect(result.rotationRecommended).toBe(true);
        expect(result.rotationReason).toContain('100 days old');
      });

      it('should not recommend rotation for new keys without expiry', () => {
        const createdAt = new Date(now.getTime() - 30 * DAY_MS); // 30 days old
        const result = checkKeyExpiry(null, createdAt);

        expect(result.rotationRecommended).toBe(false);
      });
    });

    describe('Expiring keys', () => {
      it('should detect expired keys', () => {
        const expiresAt = new Date(now.getTime() - DAY_MS); // Expired yesterday
        const createdAt = new Date(now.getTime() - 30 * DAY_MS);
        const result = checkKeyExpiry(expiresAt, createdAt);

        expect(result.isExpired).toBe(true);
        expect(result.warningMessage).toContain('expired');
      });

      it('should detect keys expiring within 1 day as critical', () => {
        const expiresAt = new Date(now.getTime() + 0.5 * DAY_MS); // Expires in 12 hours
        const createdAt = new Date(now.getTime() - 30 * DAY_MS);
        const result = checkKeyExpiry(expiresAt, createdAt);

        expect(result.isExpired).toBe(false);
        expect(result.isCritical).toBe(true);
        expect(result.isExpiringSoon).toBe(true);
        expect(result.daysUntilExpiry).toBe(0);
        expect(result.warningMessage).toContain('less than 1 day');
      });

      it('should detect keys expiring within 7 days', () => {
        const expiresAt = new Date(now.getTime() + 5 * DAY_MS); // Expires in ~5 days
        const createdAt = new Date(now.getTime() - 30 * DAY_MS);
        const result = checkKeyExpiry(expiresAt, createdAt);

        expect(result.isExpired).toBe(false);
        expect(result.isCritical).toBe(false);
        expect(result.isExpiringSoon).toBe(true);
        // Allow for small timing differences (4-5 days)
        expect(result.daysUntilExpiry).toBeGreaterThanOrEqual(4);
        expect(result.daysUntilExpiry).toBeLessThanOrEqual(5);
        expect(result.warningMessage).toMatch(/\d+ days/);
      });

      it('should not warn for keys expiring in more than 7 days', () => {
        const expiresAt = new Date(now.getTime() + 30 * DAY_MS); // Expires in ~30 days
        const createdAt = new Date(now.getTime() - 10 * DAY_MS);
        const result = checkKeyExpiry(expiresAt, createdAt);

        expect(result.isExpired).toBe(false);
        expect(result.isCritical).toBe(false);
        expect(result.isExpiringSoon).toBe(false);
        // Allow for small timing differences (29-30 days)
        expect(result.daysUntilExpiry).toBeGreaterThanOrEqual(29);
        expect(result.daysUntilExpiry).toBeLessThanOrEqual(30);
        expect(result.warningMessage).toBeUndefined();
      });

      it('should recommend rotation for critical keys', () => {
        const expiresAt = new Date(now.getTime() + 0.5 * DAY_MS);
        const createdAt = new Date(now.getTime() - 30 * DAY_MS);
        const result = checkKeyExpiry(expiresAt, createdAt);

        expect(result.rotationRecommended).toBe(true);
      });
    });

    describe('Edge cases', () => {
      it('should handle key expiring exactly now', () => {
        const expiresAt = now;
        const createdAt = new Date(now.getTime() - 30 * DAY_MS);
        const result = checkKeyExpiry(expiresAt, createdAt);

        // Should be treated as expired
        expect(result.isExpired).toBe(true);
      });

      it('should handle very old keys', () => {
        const expiresAt = null;
        const createdAt = new Date(now.getTime() - 365 * DAY_MS); // 1 year old
        const result = checkKeyExpiry(expiresAt, createdAt);

        expect(result.rotationRecommended).toBe(true);
        expect(result.rotationReason).toContain('365 days old');
      });

      it('should handle very new keys', () => {
        const expiresAt = new Date(now.getTime() + 365 * DAY_MS);
        const createdAt = new Date(now.getTime() - DAY_MS); // 1 day old
        const result = checkKeyExpiry(expiresAt, createdAt);

        expect(result.isExpired).toBe(false);
        expect(result.isExpiringSoon).toBe(false);
        expect(result.rotationRecommended).toBe(false);
      });
    });
  });

  describe('Expiry Warning Thresholds', () => {
    it('should use 7-day warning threshold', () => {
      const EXPIRY_WARNING_DAYS = 7;
      const expiresAt = new Date(now.getTime() + (EXPIRY_WARNING_DAYS - 1) * DAY_MS);
      const createdAt = new Date(now.getTime() - 10 * DAY_MS);
      const result = checkKeyExpiry(expiresAt, createdAt);

      expect(result.isExpiringSoon).toBe(true);
    });

    it('should use 1-day critical threshold', () => {
      const EXPIRY_CRITICAL_DAYS = 1;
      const expiresAt = new Date(now.getTime() + (EXPIRY_CRITICAL_DAYS - 0.5) * DAY_MS);
      const createdAt = new Date(now.getTime() - 10 * DAY_MS);
      const result = checkKeyExpiry(expiresAt, createdAt);

      expect(result.isCritical).toBe(true);
    });

    it('should use 90-day rotation threshold', () => {
      const KEY_AGE_ROTATION_DAYS = 90;
      const expiresAt = null;
      const createdAt = new Date(now.getTime() - KEY_AGE_ROTATION_DAYS * DAY_MS);
      const result = checkKeyExpiry(expiresAt, createdAt);

      expect(result.rotationRecommended).toBe(true);
    });
  });
});
