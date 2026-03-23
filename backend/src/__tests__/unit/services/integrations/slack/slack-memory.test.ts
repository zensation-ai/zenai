import { getChannelContext, buildExtractionPrompt, EXTRACTION_BATCH_SIZE } from '../../../../../services/integrations/slack/slack-memory';

jest.mock('../../../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
  queryContext: jest.fn(),
}));
jest.mock('../../../../../services/event-system', () => ({
  emitSystemEvent: jest.fn(),
}));
jest.mock('../../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { queryPublic } = require('../../../../../utils/database-context');

describe('SlackMemory', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getChannelContext', () => {
    it('returns mapped context from workspace config', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{
          channel_context_mapping: { C123: 'learning' },
        }],
      });

      const ctx = await getChannelContext('ws-1', 'C123', 'general');
      expect(ctx).toBe('learning');
    });

    it('falls back to channel DB record', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ channel_context_mapping: {} }] });
      queryPublic.mockResolvedValueOnce({ rows: [{ target_context: 'creative' }] });

      const ctx = await getChannelContext('ws-1', 'C456', 'brainstorm');
      expect(ctx).toBe('creative');
    });

    it('falls back to name-based heuristic', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ channel_context_mapping: {} }] });
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const ctx = await getChannelContext('ws-1', 'C789', 'engineering');
      expect(ctx).toBe('work');
    });

    it('defaults to work for unknown channels', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ channel_context_mapping: {} }] });
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const ctx = await getChannelContext('ws-1', 'C000', 'some-unknown-name');
      expect(ctx).toBe('work');
    });
  });

  describe('buildExtractionPrompt', () => {
    it('includes channel name and message texts', () => {
      const messages = [
        { userName: 'Alice', text: 'We decided to use PostgreSQL' },
        { userName: 'Bob', text: 'Good idea, the deadline is Friday' },
      ];
      const prompt = buildExtractionPrompt('#engineering', messages);
      expect(prompt).toContain('#engineering');
      expect(prompt).toContain('Alice');
      expect(prompt).toContain('PostgreSQL');
      expect(prompt).toContain('Friday');
    });

    it('instructs Claude to return JSON', () => {
      const prompt = buildExtractionPrompt('#test', [{ userName: 'X', text: 'test message here' }]);
      expect(prompt).toContain('JSON');
    });
  });

  describe('EXTRACTION_BATCH_SIZE', () => {
    it('is a reasonable batch size', () => {
      expect(EXTRACTION_BATCH_SIZE).toBeGreaterThanOrEqual(10);
      expect(EXTRACTION_BATCH_SIZE).toBeLessThanOrEqual(100);
    });
  });
});
