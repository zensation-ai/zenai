/**
 * Sprint 1.2 — Content Moderation Tests
 *
 * Focus: Tier 1 (regex/LDNOOBW) runs deterministically without network.
 * Tier 2/3 paths are mocked.
 */

jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: jest.fn(),
  isClaudeAvailable: jest.fn().mockReturnValue(false),
  MODEL_CONFIG: { haiku: 'claude-haiku-test' },
}));

import { queryPublic } from '../../../utils/database-context';
import { moderateContent, submitAppeal } from '../../../services/content-moderation';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('content-moderation', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
    // Unset OPENAI_API_KEY so Tier 2 skips during pure-Tier-1 tests.
    process.env = { ...OLD_ENV };
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('Tier 1 (regex + LDNOOBW)', () => {
    it('blocks on credit-card-like structural pattern', async () => {
      // Tier 1 matches → one INSERT for moderation_decisions
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'decision-1' }] } as never);

      const result = await moderateContent({
        content: 'My card is 4242 4242 4242 4242',
        surface: 'chat',
        userId: 'user-1',
      });

      expect(result.decision).toBe('block');
      expect(result.tier).toBe('regex');
      expect(result.categories).toContain('credit_card_like');
      expect(result.appealToken).toBeTruthy();
    });

    it('blocks on leaked API key pattern', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'decision-2' }] } as never);

      const result = await moderateContent({
        content: 'Here is the key: sk-ant-api03-abcdefg12345678901234567890',
        surface: 'email',
        userId: 'user-1',
      });

      expect(result.decision).toBe('block');
      expect(result.categories).toContain('leaked_api_key');
    });

    it('allows clean content when Tier 2 unavailable', async () => {
      const result = await moderateContent({
        content: 'Hello world, everything is fine here.',
        surface: 'chat',
        userId: 'user-1',
      });

      expect(result.decision).toBe('allow');
      expect(result.categories).toEqual([]);
      // No INSERT should have been called (no decision persisted for clean Tier-1-pass when T2 unavailable)
      expect(mockQueryPublic).not.toHaveBeenCalled();
    });

    it('does not persist when skipPersist is true', async () => {
      const result = await moderateContent({
        content: 'My card is 4242 4242 4242 4242',
        surface: 'chat',
        userId: 'user-1',
        skipPersist: true,
      });

      expect(result.decision).toBe('block');
      expect(result.decisionId).toBe('');
      expect(mockQueryPublic).not.toHaveBeenCalled();
    });

    it('returns allow for empty content', async () => {
      const result = await moderateContent({
        content: '   ',
        surface: 'chat',
        userId: 'user-1',
      });

      expect(result.decision).toBe('allow');
      expect(result.reason).toBe('empty content');
    });
  });

  describe('submitAppeal', () => {
    it('throws 404 when token is unknown', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as never);

      await expect(
        submitAppeal({ appealToken: 'nonexistent-token', userId: null, reason: 'I think this was wrong' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects already-resolved cases', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'decision-1', appeal_status: 'upheld' }],
      } as never);

      await expect(
        submitAppeal({ appealToken: 'token-1', userId: null, reason: 'Please review' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('creates appeal when token is valid', async () => {
      // 1: fetch decision, 2: update appeal_status=pending, 3: insert appeal
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ id: 'decision-1', appeal_status: 'none' }] } as never)
        .mockResolvedValueOnce({ rows: [] } as never)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'appeal-1',
              decision_id: 'decision-1',
              user_id: 'user-1',
              user_reason: 'Please review',
              status: 'submitted',
              sla_deadline: '2026-04-18T00:00:00Z',
              submitted_at: '2026-04-16T00:00:00Z',
              resolved_at: null,
              reviewer_id: null,
              reviewer_notes: null,
            },
          ],
        } as never);

      const appeal = await submitAppeal({
        appealToken: 'valid-token',
        userId: 'user-1',
        reason: 'Please review my case',
      });

      expect(appeal.id).toBe('appeal-1');
      expect(appeal.status).toBe('submitted');
    });
  });
});
