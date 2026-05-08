/**
 * Social Media Governance Integration
 *
 * Bridges social posts with the governance approval system.
 * Discord posts are low-risk and auto-approved; Twitter and LinkedIn
 * are medium-risk and require user approval.
 *
 * @module services/social/social-governance
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { requestApproval, GovernanceAction, RiskLevel } from '../governance';
import { SocialPost, SocialPlatform } from './platform-types';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface SocialApprovalResult {
  post: SocialPost;
  governanceAction: GovernanceAction;
  autoApproved: boolean;
}

// ===========================================
// Risk level mapping
// ===========================================

function getRiskLevel(platform: SocialPlatform): RiskLevel {
  if (platform === 'discord') {
    return 'low';
  }
  // twitter and linkedin are public-facing — medium risk
  return 'medium';
}

// ===========================================
// Main function
// ===========================================

/**
 * Request governance approval for a social post.
 *
 * - Fetches the post from DB
 * - Determines risk level based on platform
 * - Calls requestApproval() from governance service
 * - Updates the post status based on the governance outcome:
 *   - auto_approved or low risk → 'approved'
 *   - pending → 'pending_approval'
 * - Saves governance_id on the post
 *
 * @throws {Error} if the post is not found
 */
export async function requestSocialApproval(
  context: AIContext,
  postId: string
): Promise<SocialApprovalResult> {
  // 1. Fetch post
  const fetchResult = await queryContext(
    context,
    `SELECT id, platform, content, status, governance_id,
            source_type, source_id, media_urls, scheduled_at,
            published_at, platform_post_id, engagement_metrics,
            created_at, updated_at
     FROM social_posts
     WHERE id = $1`,
    [postId]
  );

  if (!fetchResult.rows.length) {
    logger.warn('[SocialGovernance] Post not found for approval', { operation: 'request-social-approval', postId, context });
    throw new Error(`Social post not found: ${postId}`);
  }

  const row = fetchResult.rows[0] as Record<string, unknown>;
  const platform = row.platform as SocialPlatform;
  const content = row.content as string;

  // 2. Determine risk level
  const riskLevel = getRiskLevel(platform);

  // 3. Request governance approval
  const governanceAction = await requestApproval(context, {
    action_type: 'social_publish',
    action_source: 'user',
    source_id: postId,
    description: `Publish ${platform} post: "${content.slice(0, 50)}..."`,
    payload: {
      postId,
      platform,
      contentPreview: content.slice(0, 100),
    },
    risk_level: riskLevel,
  });

  // 4. Determine new post status based on governance outcome
  const autoApproved =
    governanceAction.status === 'auto_approved' || riskLevel === 'low';
  const newStatus = autoApproved ? 'approved' : 'pending_approval';

  // Warn on unexpected governance status (expected: 'auto_approved' | 'pending')
  if (
    governanceAction.status !== 'auto_approved' &&
    governanceAction.status !== 'pending'
  ) {
    logger.warn('[SocialGovernance] Unexpected governance status, treating as pending_approval', {
      operation: 'request-social-approval',
      postId,
      governanceStatus: governanceAction.status,
      context,
    });
  }

  logger.info('[SocialGovernance] Approval requested', {
    operation: 'request-social-approval',
    postId,
    platform,
    riskLevel,
    autoApproved,
    governanceId: governanceAction.id,
    governanceStatus: governanceAction.status,
    context,
  });

  // 5. Update the post in DB
  const updateResult = await queryContext(
    context,
    `UPDATE social_posts
     SET status = $1, governance_id = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, platform, content, status, governance_id,
               source_type, source_id, media_urls, scheduled_at,
               published_at, platform_post_id, engagement_metrics,
               created_at, updated_at`,
    [newStatus, governanceAction.id, postId]
  );

  const updatedPost = updateResult.rows[0] as SocialPost;

  return {
    post: updatedPost,
    governanceAction,
    autoApproved,
  };
}
