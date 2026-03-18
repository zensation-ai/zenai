/**
 * Auto Session Title Tests
 *
 * Tests the AI-powered session title generation that fires after
 * the first complete assistant response in a session.
 */

jest.mock('../../../utils/database', () => ({
  query: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { query } from '../../../utils/database';
import { generateSessionTitle } from '../../../services/general-chat/auto-title';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Auto Session Title', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSessionTitle', () => {
    it('should skip when session already has a title', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ title: 'Existing Title' }],
        command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      });

      await generateSessionTitle('session-1', 'User message', 'AI response');

      // Should only have called the SELECT, not an UPDATE
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should generate title when session has no title', async () => {
      // First call: check session title
      mockQuery.mockResolvedValueOnce({
        rows: [{ title: null }],
        command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      });

      // Second call: UPDATE with generated title
      mockQuery.mockResolvedValueOnce({
        rows: [], command: 'UPDATE', rowCount: 1, oid: 0, fields: [],
      });

      await generateSessionTitle('session-1', 'Wie funktioniert React?', 'React ist eine JavaScript-Bibliothek...');

      expect(mockQuery).toHaveBeenCalledTimes(2);
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE general_chat_sessions');
      expect(updateCall[0]).toContain('SET title');
      // Title should be set
      expect(updateCall[1]![1]).toBeTruthy();
      expect(typeof updateCall[1]![1]).toBe('string');
    });

    it('should generate title based on user message content', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ title: null }],
        command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [], command: 'UPDATE', rowCount: 1, oid: 0, fields: [],
      });

      await generateSessionTitle('session-1', 'Erklaere mir Machine Learning', 'Machine Learning ist...');

      const updateCall = mockQuery.mock.calls[1];
      const title = updateCall[1]![1] as string;
      // Title should be reasonable length (3-6 words ~ 10-60 chars)
      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(60);
    });

    it('should not throw on errors (fire-and-forget)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      // Should not throw
      await expect(
        generateSessionTitle('session-1', 'Test', 'Response')
      ).resolves.toBeUndefined();
    });

    it('should skip when session not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT', rowCount: 0, oid: 0, fields: [],
      });

      await generateSessionTitle('nonexistent', 'Test', 'Response');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should handle empty session title (empty string)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ title: '' }],
        command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [], command: 'UPDATE', rowCount: 1, oid: 0, fields: [],
      });

      await generateSessionTitle('session-1', 'Hilf mir beim Kochen', 'Gerne, was moechtest du kochen?');

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should truncate very long generated titles', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ title: null }],
        command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [], command: 'UPDATE', rowCount: 1, oid: 0, fields: [],
      });

      // Very long message that could generate a long title
      const longMsg = 'A'.repeat(5000);
      await generateSessionTitle('session-1', longMsg, 'Response');

      const updateCall = mockQuery.mock.calls[1];
      const title = updateCall[1]![1] as string;
      expect(title.length).toBeLessThanOrEqual(60);
    });
  });
});
