/**
 * Sprint 1.2 — Consent Service Tests
 */

jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

import { queryPublic } from '../../../utils/database-context';
import {
  getConsentState,
  hasConsent,
  setConsent,
  revokeConsent,
  isConsentKind,
  CONSENT_DEFAULTS,
  CONSENT_KINDS,
} from '../../../services/auth/consent-service';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('consent-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  describe('isConsentKind', () => {
    it('accepts all known kinds', () => {
      for (const kind of CONSENT_KINDS) {
        expect(isConsentKind(kind)).toBe(true);
      }
    });

    it('rejects unknown kind', () => {
      expect(isConsentKind('tracking_pixels')).toBe(false);
      expect(isConsentKind(123)).toBe(false);
      expect(isConsentKind(null)).toBe(false);
    });
  });

  describe('getConsentState', () => {
    it('returns defaults when no entries exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as never);

      const state = await getConsentState('user-1');

      expect(state.ai_training_opt_out.granted).toBe(CONSENT_DEFAULTS.ai_training_opt_out);
      expect(state.ai_training_opt_out.is_default).toBe(true);
      expect(state.cookies_functional.granted).toBe(true); // essential
    });

    it('overlays latest entries on defaults', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            kind: 'analytics_tracking',
            granted: true,
            granted_at: '2026-04-16T10:00:00Z',
            revoked_at: null,
          },
        ],
      } as never);

      const state = await getConsentState('user-1');

      expect(state.analytics_tracking.granted).toBe(true);
      expect(state.analytics_tracking.is_default).toBe(false);
    });

    it('treats revoked entries as not granted', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            kind: 'cookies_analytics',
            granted: true,
            granted_at: '2026-04-16T10:00:00Z',
            revoked_at: '2026-04-16T11:00:00Z',
          },
        ],
      } as never);

      const state = await getConsentState('user-1');
      expect(state.cookies_analytics.granted).toBe(false);
    });
  });

  describe('hasConsent', () => {
    it('falls back to default when no entry exists', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as never);

      const granted = await hasConsent('user-1', 'analytics_tracking');
      expect(granted).toBe(CONSENT_DEFAULTS.analytics_tracking); // false
    });

    it('honors revoked_at', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ granted: true, revoked_at: '2026-04-16T12:00:00Z' }],
      } as never);

      expect(await hasConsent('user-1', 'analytics_tracking')).toBe(false);
    });
  });

  describe('setConsent', () => {
    it('inserts new entry when state changes', async () => {
      // hasConsent: returns default (false)
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as never);
      // insert returns the new row
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'entry-1', user_id: 'user-1', kind: 'analytics_tracking', granted: true }],
      } as never);

      const result = await setConsent({
        userId: 'user-1',
        kind: 'analytics_tracking',
        granted: true,
      });

      expect(result.granted).toBe(true);
      expect(mockQueryPublic).toHaveBeenCalledTimes(2);
    });
  });

  describe('revokeConsent', () => {
    it('marks existing row as revoked and inserts explicit granted=false', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as never); // UPDATE revoked_at
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ granted: true, revoked_at: null }] } as never); // hasConsent in setConsent
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'entry-new', kind: 'analytics_tracking', granted: false }],
      } as never);

      const result = await revokeConsent({
        userId: 'user-1',
        kind: 'analytics_tracking',
      });

      expect(result.granted).toBe(false);
    });
  });
});
