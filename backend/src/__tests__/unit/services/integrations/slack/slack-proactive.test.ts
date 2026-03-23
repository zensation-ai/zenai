import {
  shouldRespondProactively,
  MutedThreadStore,
  cosineSimilarity,
} from '../../../../../services/integrations/slack/slack-proactive';
import type { ProactiveConfig } from '../../../../../services/integrations/slack/types';

jest.mock('../../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('SlackProactive', () => {
  describe('MutedThreadStore', () => {
    let store: MutedThreadStore;

    beforeEach(() => {
      store = new MutedThreadStore();
    });

    it('mutes a thread', () => {
      store.mute('ws-1', '1234.5678');
      expect(store.isMuted('ws-1', '1234.5678')).toBe(true);
    });

    it('returns false for unmuted threads', () => {
      expect(store.isMuted('ws-1', '1234.5678')).toBe(false);
    });

    it('isolates mutes per workspace', () => {
      store.mute('ws-1', '1234.5678');
      expect(store.isMuted('ws-2', '1234.5678')).toBe(false);
    });

    it('clears mutes for a workspace', () => {
      store.mute('ws-1', '1234.5678');
      store.clearWorkspace('ws-1');
      expect(store.isMuted('ws-1', '1234.5678')).toBe(false);
    });
  });

  describe('shouldRespondProactively', () => {
    const defaultConfig: ProactiveConfig = {
      enabled: true,
      confidenceThreshold: 0.8,
      rateLimitMinutes: 30,
      mutedChannels: [],
    };

    it('returns false when proactive is disabled', () => {
      const config = { ...defaultConfig, enabled: false };
      expect(shouldRespondProactively(config, 'C123', null, 0.9, new Map())).toBe(false);
    });

    it('returns false for muted channels', () => {
      const config = { ...defaultConfig, mutedChannels: ['C123'] };
      expect(shouldRespondProactively(config, 'C123', null, 0.9, new Map())).toBe(false);
    });

    it('returns false when similarity below threshold', () => {
      expect(shouldRespondProactively(defaultConfig, 'C123', null, 0.5, new Map())).toBe(false);
    });

    it('returns true when all conditions met', () => {
      expect(shouldRespondProactively(defaultConfig, 'C123', null, 0.9, new Map())).toBe(true);
    });

    it('returns false when rate limited (recent response in channel)', () => {
      const lastResponses = new Map<string, number>();
      lastResponses.set('C123', Date.now() - 10 * 60 * 1000); // 10 min ago (< 30 min limit)
      expect(shouldRespondProactively(defaultConfig, 'C123', null, 0.9, lastResponses)).toBe(false);
    });

    it('returns true when rate limit expired', () => {
      const lastResponses = new Map<string, number>();
      lastResponses.set('C123', Date.now() - 35 * 60 * 1000); // 35 min ago (> 30 min limit)
      expect(shouldRespondProactively(defaultConfig, 'C123', null, 0.9, lastResponses)).toBe(true);
    });

    it('returns false for muted threads', () => {
      const mutedStore = new MutedThreadStore();
      mutedStore.mute('ws-1', '1234.5678');
      expect(shouldRespondProactively(defaultConfig, 'C123', '1234.5678', 0.9, new Map(), mutedStore, 'ws-1')).toBe(false);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
    });

    it('returns 0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('returns 0 for mismatched lengths', () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it('computes similarity for non-trivial vectors', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      const result = cosineSimilarity(a, b);
      expect(result).toBeGreaterThan(0.9);
      expect(result).toBeLessThanOrEqual(1.0);
    });
  });
});
