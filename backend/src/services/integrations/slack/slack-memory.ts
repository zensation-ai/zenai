import type { AIContext } from './types';
import { inferChannelContext } from './types';
import { queryPublic, queryContext } from '../../../utils/database-context';
import { logger } from '../../../utils/logger';

export const EXTRACTION_BATCH_SIZE = 20;

/**
 * Determine the target AI context for a Slack channel.
 * Priority: workspace mapping > DB record > name heuristic > 'work'
 */
export async function getChannelContext(
  workspaceId: string,
  channelId: string,
  channelName: string,
): Promise<AIContext> {
  try {
    // 1. Check workspace-level mapping
    const wsResult = await queryPublic(
      'SELECT channel_context_mapping FROM public.slack_workspaces WHERE id = $1',
      [workspaceId],
    );

    if (wsResult.rows.length > 0) {
      const mapping = wsResult.rows[0].channel_context_mapping || {};
      if (mapping[channelId]) {
        return mapping[channelId] as AIContext;
      }
    }

    // 2. Check channel DB record
    const chResult = await queryPublic(
      'SELECT target_context FROM public.slack_channels WHERE workspace_id = $1 AND channel_id = $2',
      [workspaceId, channelId],
    );

    if (chResult.rows.length > 0 && chResult.rows[0].target_context) {
      return chResult.rows[0].target_context as AIContext;
    }

    // 3. Name-based heuristic
    return inferChannelContext(channelName);
  } catch (err) {
    logger.error('Failed to determine channel context', err instanceof Error ? err : undefined, { workspaceId, channelId });
    return 'work';
  }
}

/**
 * Build a Claude prompt for extracting facts from Slack messages.
 */
export function buildExtractionPrompt(
  channelName: string,
  messages: Array<{ userName: string; text: string }>,
): string {
  const messageBlock = messages
    .map((m) => `[${m.userName}]: ${m.text}`)
    .join('\n');

  return `Extract key facts, decisions, and action items from these Slack messages in ${channelName}.

Messages:
${messageBlock}

Return a JSON array of extracted facts. Each fact should have:
- "text": The fact or decision in a clear, standalone sentence
- "type": One of "decision", "action_item", "key_info", "question"
- "confidence": A number between 0 and 1

Only include substantive facts. Skip greetings, acknowledgments, and small talk.
If no facts are worth extracting, return an empty array: []

Respond with ONLY the JSON array, no other text.`;
}

/**
 * Store a Slack message in the per-context slack_messages table.
 */
export async function storeSlackMessage(
  context: AIContext,
  userId: string,
  channelId: string,
  messageTs: string,
  threadTs: string | null,
  slackUserId: string,
  userName: string,
  text: string,
  importanceScore: number,
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO slack_messages (user_id, channel_id, message_ts, thread_ts, slack_user_id, user_name, text, importance_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (channel_id, message_ts) DO NOTHING`,
      [userId, channelId, messageTs, threadTs, slackUserId, userName, text, importanceScore],
    );
  } catch (err) {
    logger.error('Failed to store Slack message', err instanceof Error ? err : undefined, { context, channelId, messageTs });
  }
}

/**
 * Build source attribution for extracted facts.
 */
export function buildSourceRef(channelName: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `#${channelName}, ${date}`;
}
