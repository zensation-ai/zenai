/**
 * Unit tests for social-governance service
 *
 * Verifies that requestSocialApproval() correctly:
 * - Maps platform to risk level (discord=low, twitter/linkedin=medium)
 * - Passes correct fields to requestApproval()
 * - Sets post status to 'approved' when auto-approved (discord / auto_approved)
 * - Sets post status to 'pending_approval' when governance returns 'pending'
 * - Saves governance_id on the post record
 * - Throws on missing post
 *
 * @module __tests__/unit/services/social/social-governance
 */

// ===========================================
// Mocks (must be declared before imports)
// ===========================================

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  AIContext: {},
  isValidContext: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../../services/governance', () => ({
  requestApproval: jest.fn(),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ===========================================
// Imports
// ===========================================

import { requestSocialApproval } from '../../../../services/social/social-governance';
import { queryContext } from '../../../../utils/database-context';
import { requestApproval } from '../../../../services/governance';
import { GovernanceAction } from '../../../../services/governance';
import { AIContext } from '../../../../utils/database-context';

// ===========================================
// Typed mocks
// ===========================================

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockRequestApproval = requestApproval as jest.MockedFunction<typeof requestApproval>;

// ===========================================
// Helpers
// ===========================================

const TEST_CONTEXT: AIContext = 'operations';
const TEST_POST_ID = 'post-abc-123';

function makePostRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: TEST_POST_ID,
    platform: 'twitter',
    content: 'Hello from ZenAI! This is a test tweet about our new GraphRAG pipeline.',
    status: 'draft',
    governance_id: null,
    source_type: 'manual',
    source_id: null,
    media_urls: [],
    scheduled_at: null,
    published_at: null,
    platform_post_id: null,
    engagement_metrics: null,
    created_at: new Date('2026-03-30T10:00:00Z'),
    updated_at: new Date('2026-03-30T10:00:00Z'),
    ...overrides,
  };
}

function makeGovernanceAction(overrides: Partial<GovernanceAction> = {}): GovernanceAction {
  return {
    id: 'gov-action-456',
    context: TEST_CONTEXT,
    action_type: 'social_publish',
    action_source: 'user',
    source_id: TEST_POST_ID,
    description: 'Publish twitter post: "Hello from ZenAI!..."',
    payload: null,
    risk_level: 'medium',
    status: 'pending',
    requires_approval: true,
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    executed_at: null,
    execution_result: null,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ===========================================
// Tests
// ===========================================

describe('requestSocialApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------
  // 1. Discord → auto-approved
  // ------------------------------------

  it('should auto-approve a Discord post (low risk)', async () => {
    const discordPost = makePostRow({ platform: 'discord' });
    const govAction = makeGovernanceAction({ status: 'auto_approved', risk_level: 'low' });
    const updatedPost = { ...discordPost, status: 'approved', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [discordPost], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 }); // UPDATE
    mockRequestApproval.mockResolvedValueOnce(govAction);

    const result = await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(result.autoApproved).toBe(true);
    expect(result.post.status).toBe('approved');
    expect(result.post.governance_id).toBe(govAction.id);
    expect(result.governanceAction).toBe(govAction);
  });

  // ------------------------------------
  // 2. Twitter → pending_approval
  // ------------------------------------

  it('should set Twitter post to pending_approval when governance returns pending', async () => {
    const twitterPost = makePostRow({ platform: 'twitter' });
    const govAction = makeGovernanceAction({ status: 'pending', risk_level: 'medium' });
    const updatedPost = { ...twitterPost, status: 'pending_approval', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [twitterPost], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    const result = await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(result.autoApproved).toBe(false);
    expect(result.post.status).toBe('pending_approval');
    expect(result.post.governance_id).toBe(govAction.id);
  });

  // ------------------------------------
  // 3. LinkedIn → pending_approval
  // ------------------------------------

  it('should set LinkedIn post to pending_approval when governance returns pending', async () => {
    const linkedinPost = makePostRow({ platform: 'linkedin' });
    const govAction = makeGovernanceAction({ status: 'pending', risk_level: 'medium' });
    const updatedPost = { ...linkedinPost, status: 'pending_approval', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [linkedinPost], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    const result = await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(result.autoApproved).toBe(false);
    expect(result.post.status).toBe('pending_approval');
  });

  // ------------------------------------
  // 4. Post not found → throws
  // ------------------------------------

  it('should throw an error when post is not found', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(requestSocialApproval(TEST_CONTEXT, 'nonexistent-id')).rejects.toThrow(
      'Social post not found: nonexistent-id'
    );
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  // ------------------------------------
  // 5. Risk level: discord → 'low'
  // ------------------------------------

  it('should call requestApproval with risk_level "low" for Discord', async () => {
    const discordPost = makePostRow({ platform: 'discord' });
    const govAction = makeGovernanceAction({ status: 'auto_approved', risk_level: 'low' });
    const updatedPost = { ...discordPost, status: 'approved', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [discordPost], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(mockRequestApproval).toHaveBeenCalledWith(
      TEST_CONTEXT,
      expect.objectContaining({ risk_level: 'low' })
    );
  });

  // ------------------------------------
  // 6. Risk level: twitter → 'medium'
  // ------------------------------------

  it('should call requestApproval with risk_level "medium" for Twitter', async () => {
    const twitterPost = makePostRow({ platform: 'twitter' });
    const govAction = makeGovernanceAction({ status: 'pending', risk_level: 'medium' });
    const updatedPost = { ...twitterPost, status: 'pending_approval', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [twitterPost], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(mockRequestApproval).toHaveBeenCalledWith(
      TEST_CONTEXT,
      expect.objectContaining({ risk_level: 'medium' })
    );
  });

  // ------------------------------------
  // 7. Risk level: linkedin → 'medium'
  // ------------------------------------

  it('should call requestApproval with risk_level "medium" for LinkedIn', async () => {
    const linkedinPost = makePostRow({ platform: 'linkedin' });
    const govAction = makeGovernanceAction({ status: 'pending', risk_level: 'medium' });
    const updatedPost = { ...linkedinPost, status: 'pending_approval', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [linkedinPost], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(mockRequestApproval).toHaveBeenCalledWith(
      TEST_CONTEXT,
      expect.objectContaining({ risk_level: 'medium' })
    );
  });

  // ------------------------------------
  // 8. source_id is the postId
  // ------------------------------------

  it('should pass the postId as source_id to requestApproval', async () => {
    const post = makePostRow({ platform: 'twitter' });
    const govAction = makeGovernanceAction({ status: 'pending' });
    const updatedPost = { ...post, status: 'pending_approval', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [post], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(mockRequestApproval).toHaveBeenCalledWith(
      TEST_CONTEXT,
      expect.objectContaining({ source_id: TEST_POST_ID })
    );
  });

  // ------------------------------------
  // 9. action_type is 'social_publish'
  // ------------------------------------

  it('should call requestApproval with action_type "social_publish"', async () => {
    const post = makePostRow({ platform: 'twitter' });
    const govAction = makeGovernanceAction({ status: 'pending' });
    const updatedPost = { ...post, status: 'pending_approval', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [post], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(mockRequestApproval).toHaveBeenCalledWith(
      TEST_CONTEXT,
      expect.objectContaining({ action_type: 'social_publish' })
    );
  });

  // ------------------------------------
  // 10. Returns correct post from DB
  // ------------------------------------

  it('should return the updated post from the DB UPDATE result', async () => {
    const post = makePostRow({ platform: 'twitter' });
    const govAction = makeGovernanceAction({ id: 'gov-789', status: 'pending' });
    const updatedPost = {
      ...post,
      status: 'pending_approval',
      governance_id: 'gov-789',
    };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [post], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    const result = await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(result.post.id).toBe(TEST_POST_ID);
    expect(result.post.governance_id).toBe('gov-789');
  });

  // ------------------------------------
  // 11. Returns the governance action from requestApproval
  // ------------------------------------

  it('should return the governance action returned by requestApproval', async () => {
    const post = makePostRow({ platform: 'discord' });
    const govAction = makeGovernanceAction({ id: 'gov-special', status: 'auto_approved', risk_level: 'low' });
    const updatedPost = { ...post, status: 'approved', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [post], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    const result = await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    expect(result.governanceAction.id).toBe('gov-special');
    expect(result.governanceAction.status).toBe('auto_approved');
  });

  // ------------------------------------
  // 12. DB UPDATE called with correct args
  // ------------------------------------

  it('should UPDATE the post with new status and governance_id', async () => {
    const post = makePostRow({ platform: 'twitter' });
    const govAction = makeGovernanceAction({ id: 'gov-update-test', status: 'pending' });
    const updatedPost = { ...post, status: 'pending_approval', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [post], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    // Second call to queryContext should be the UPDATE
    const updateCall = mockQueryContext.mock.calls[1];
    expect(updateCall[0]).toBe(TEST_CONTEXT);
    expect(updateCall[1]).toContain('UPDATE social_posts');
    expect(updateCall[2]).toEqual(['pending_approval', 'gov-update-test', TEST_POST_ID]);
  });

  // ------------------------------------
  // Bonus: Discord low-risk is auto-approved even if governance returns 'pending'
  // ------------------------------------

  it('should mark Discord post as approved even when governance returns pending (low risk override)', async () => {
    // Edge case: governance policy returns 'pending' for discord (unusual but possible)
    const discordPost = makePostRow({ platform: 'discord' });
    // Governance returns 'pending' — but since risk_level is 'low', we override to 'approved'
    const govAction = makeGovernanceAction({ status: 'pending', risk_level: 'low' });
    const updatedPost = { ...discordPost, status: 'approved', governance_id: govAction.id };

    mockQueryContext
      .mockResolvedValueOnce({ rows: [discordPost], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [updatedPost], rowCount: 1 });
    mockRequestApproval.mockResolvedValueOnce(govAction);

    const result = await requestSocialApproval(TEST_CONTEXT, TEST_POST_ID);

    // Low risk always auto-approves regardless of governance action status
    expect(result.autoApproved).toBe(true);
    // The UPDATE call should pass 'approved'
    const updateCall = mockQueryContext.mock.calls[1];
    expect(updateCall[2]?.[0]).toBe('approved');
  });
});
