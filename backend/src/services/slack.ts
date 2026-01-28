/**
 * Phase 4: Slack Integration Service
 * Handles Slack bot, events, and slash commands
 */

import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { pool } from '../utils/database';
import { triggerWebhook } from './webhooks';
import { generateEmbedding, structureWithOllama } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';
import { logger } from '../utils/logger';

// Slack API endpoints
const SLACK_API_BASE = 'https://slack.com/api';
const SLACK_OAUTH_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

// Required bot scopes
const BOT_SCOPES = [
  'channels:history',
  'channels:read',
  'chat:write',
  'commands',
  'reactions:read',
  'users:read'
];

interface SlackTokens {
  accessToken: string;
  botUserId: string;
  teamId: string;
  teamName: string;
  scopes: string[];
}

interface _SlackMessage {
  id: string;
  externalId: string;
  channelId: string;
  channelName: string | null;
  userId: string | null;
  userName: string | null;
  text: string;
  threadTs: string | null;
  messageTs: Date;
}

interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

/**
 * Generate OAuth authorization URL for Slack
 */
export function getAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: BOT_SCOPES.join(','),
    redirect_uri: redirectUri,
    state
  });

  return `${SLACK_OAUTH_URL}?${params.toString()}`;
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<SlackTokens> {
  const response = await axios.post(SLACK_TOKEN_URL, new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (!response.data.ok) {
    throw new Error(`Slack OAuth error: ${response.data.error}`);
  }

  return {
    accessToken: response.data.access_token,
    botUserId: response.data.bot_user_id,
    teamId: response.data.team.id,
    teamName: response.data.team.name,
    scopes: response.data.scope.split(',')
  };
}

/**
 * Store Slack tokens in database
 */
export async function storeTokens(tokens: SlackTokens, userId: string): Promise<void> {
  const id = uuidv4();

  // Remove old tokens
  await pool.query(
    `DELETE FROM oauth_tokens WHERE provider = 'slack' AND user_id = $1`,
    [userId]
  );

  await pool.query(
    `INSERT INTO oauth_tokens (id, provider, access_token, scopes, user_id, metadata)
     VALUES ($1, 'slack', $2, $3, $4, $5)`,
    [
      id,
      tokens.accessToken,
      JSON.stringify(tokens.scopes),
      userId,
      JSON.stringify({
        botUserId: tokens.botUserId,
        teamId: tokens.teamId,
        teamName: tokens.teamName
      })
    ]
  );
}

/**
 * Get Slack access token
 */
async function getAccessToken(userId: string = 'default'): Promise<string | null> {
  const result = await pool.query(
    `SELECT access_token FROM oauth_tokens WHERE provider = 'slack' AND user_id = $1`,
    [userId]
  );

  return result.rows.length > 0 ? result.rows[0].access_token : null;
}

/**
 * Make Slack API request
 */
async function slackApi(
  method: string,
  endpoint: string,
  data?: any,
  token?: string
): Promise<any> {
  const accessToken = token || await getAccessToken();

  if (!accessToken) {
    throw new Error('Slack not connected');
  }

  const url = `${SLACK_API_BASE}/${endpoint}`;

  const response = method === 'GET'
    ? await axios.get(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        params: data
      })
    : await axios.post(url, data, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

  if (!response.data.ok) {
    throw new Error(`Slack API error: ${response.data.error}`);
  }

  return response.data;
}

/**
 * Get list of channels
 */
export async function getChannels(): Promise<SlackChannel[]> {
  const data = await slackApi('GET', 'conversations.list', {
    types: 'public_channel,private_channel',
    exclude_archived: true
  });

  return data.channels.map((ch: any) => ({
    id: ch.id,
    name: ch.name,
    isPrivate: ch.is_private,
    isMember: ch.is_member
  }));
}

/**
 * Get user info
 */
async function getUserInfo(userId: string): Promise<{ name: string; realName: string }> {
  const data = await slackApi('GET', 'users.info', { user: userId });

  return {
    name: data.user.name,
    realName: data.user.real_name
  };
}

/**
 * Send message to channel
 */
export async function sendMessage(
  channelId: string,
  text: string,
  options: { threadTs?: string; blocks?: any[] } = {}
): Promise<string> {
  const data = await slackApi('POST', 'chat.postMessage', {
    channel: channelId,
    text,
    thread_ts: options.threadTs,
    blocks: options.blocks
  });

  return data.ts;
}

/**
 * Handle Slack event
 */
export async function handleSlackEvent(event: any): Promise<void> {
  logger.info('Slack event received', { eventType: event.type });

  switch (event.type) {
    case 'message':
      // Ignore bot messages and message edits
      if (event.subtype || event.bot_id) {return;}

      await processSlackMessage(event);
      break;

    case 'reaction_added':
      // Could trigger actions based on specific reactions
      if (event.reaction === 'brain' || event.reaction === 'bulb') {
        // Convert message to idea when brain/bulb emoji is added
        await convertReactionToIdea(event);
      }
      break;
  }
}

/**
 * Process a Slack message
 */
async function processSlackMessage(event: any): Promise<void> {
  const { channel, user, text, ts, thread_ts } = event;

  // Store message
  const id = uuidv4();
  let userName = null;

  try {
    const userInfo = await getUserInfo(user);
    userName = userInfo.realName || userInfo.name;
  } catch {
    // User lookup failed, continue without name
  }

  await pool.query(
    `INSERT INTO slack_messages (id, external_id, channel_id, user_id, user_name, text, thread_ts, message_ts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8))
     ON CONFLICT (external_id) DO NOTHING`,
    [id, ts, channel, user, userName, text, thread_ts, parseFloat(ts)]
  );

  // Check for keywords that should create ideas
  const shouldProcess = text.toLowerCase().includes('@idea') ||
                        text.toLowerCase().includes('#idea') ||
                        text.includes(':brain:') ||
                        text.includes(':bulb:');

  if (shouldProcess) {
    await convertMessageToIdea(id, text, userName, channel);
  }
}

/**
 * Convert a Slack message to an idea
 */
async function convertMessageToIdea(
  messageId: string,
  text: string,
  userName: string | null,
  channelId: string
): Promise<string> {
  // Clean up the text
  const cleanText = text
    .replace(/@idea/gi, '')
    .replace(/#idea/gi, '')
    .replace(/:brain:/g, '')
    .replace(/:bulb:/g, '')
    .trim();

  // Structure with Ollama
  const structured = await structureWithOllama(cleanText);

  // Generate embedding
  const embedding = await generateEmbedding(cleanText);

  // Create idea
  const ideaId = uuidv4();
  await pool.query(
    `INSERT INTO ideas (id, title, type, category, priority, summary, next_steps, context_needed, keywords, raw_transcript, embedding, context, is_archived)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false)`,
    [
      ideaId,
      structured.title,
      structured.type,
      structured.category,
      structured.priority,
      structured.summary,
      JSON.stringify(structured.next_steps || []),
      JSON.stringify(structured.context_needed || []),
      JSON.stringify([...(structured.keywords || []), 'slack', userName].filter(Boolean)),
      cleanText,
      embedding.length > 0 ? formatForPgVector(embedding) : null,
      'personal'
    ]
  );

  // Link message to idea
  await pool.query(
    `UPDATE slack_messages SET is_processed = true, linked_idea_id = $1 WHERE id = $2`,
    [ideaId, messageId]
  );

  // Send confirmation
  await sendMessage(channelId, `✅ Idea erstellt: "${structured.title}"`);

  // Trigger webhook
  await triggerWebhook('slack.message_processed', {
    messageId,
    ideaId,
    title: structured.title
  });

  return ideaId;
}

/**
 * Convert reaction to idea
 */
async function convertReactionToIdea(event: any): Promise<void> {
  const { item, user: _user } = event;

  if (item.type !== 'message') {return;}

  // Get message content
  const data = await slackApi('GET', 'conversations.history', {
    channel: item.channel,
    latest: item.ts,
    inclusive: true,
    limit: 1
  });

  if (!data.messages || data.messages.length === 0) {return;}

  const message = data.messages[0];

  // Check if already processed
  const existing = await pool.query(
    `SELECT id FROM slack_messages WHERE external_id = $1 AND is_processed = true`,
    [item.ts]
  );

  if (existing.rows.length > 0) {return;}

  // Store and process
  const id = uuidv4();
  await pool.query(
    `INSERT INTO slack_messages (id, external_id, channel_id, user_id, text, message_ts)
     VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
     ON CONFLICT (external_id) DO UPDATE SET is_processed = false`,
    [id, item.ts, item.channel, message.user, message.text, parseFloat(item.ts)]
  );

  await convertMessageToIdea(id, message.text, null, item.channel);
}

/**
 * Handle slash command
 */
export async function handleSlashCommand(
  command: string,
  text: string,
  userId: string,
  channelId: string,
  _responseUrl: string
): Promise<any> {
  switch (command) {
    case '/idea':
      return await createIdeaFromCommand(text, userId, channelId);

    case '/search':
      return await searchIdeasFromCommand(text);

    case '/recent':
      return await getRecentIdeas();

    default:
      return {
        response_type: 'ephemeral',
        text: `Unknown command: ${command}`
      };
  }
}

/**
 * Create idea from slash command
 */
async function createIdeaFromCommand(
  text: string,
  userId: string,
  channelId: string
): Promise<any> {
  if (!text.trim()) {
    return {
      response_type: 'ephemeral',
      text: 'Usage: /idea [your idea description]'
    };
  }

  try {
    let userName = null;
    try {
      const userInfo = await getUserInfo(userId);
      userName = userInfo.realName || userInfo.name;
    } catch {}

    const messageId = uuidv4();
    await pool.query(
      `INSERT INTO slack_messages (id, external_id, channel_id, user_id, user_name, text, message_ts)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [messageId, `cmd_${messageId}`, channelId, userId, userName, text]
    );

    const ideaId = await convertMessageToIdea(messageId, text, userName, channelId);

    // Get the created idea
    const result = await pool.query(
      `SELECT title, type, category, priority, summary FROM ideas WHERE id = $1`,
      [ideaId]
    );

    const idea = result.rows[0];

    return {
      response_type: 'in_channel',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🧠 Neue Idea erstellt*\n*${idea.title}*`
          }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Type:* ${idea.type}` },
            { type: 'mrkdwn', text: `*Category:* ${idea.category}` },
            { type: 'mrkdwn', text: `*Priority:* ${idea.priority}` }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `_${idea.summary}_`
          }
        }
      ]
    };
  } catch (error) {
    logger.error('Create idea from command error', error instanceof Error ? error : undefined);
    return {
      response_type: 'ephemeral',
      text: 'Failed to create idea. Please try again.'
    };
  }
}

/**
 * Search ideas from slash command
 */
async function searchIdeasFromCommand(query: string): Promise<any> {
  if (!query.trim()) {
    return {
      response_type: 'ephemeral',
      text: 'Usage: /search [your search query]'
    };
  }

  try {
    const embedding = await generateEmbedding(query);

    const result = await pool.query(
      `SELECT id, title, type, category, summary,
              1 - (embedding <=> $1::vector) as similarity
       FROM ideas
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 5`,
      [JSON.stringify(embedding)]
    );

    if (result.rows.length === 0) {
      return {
        response_type: 'ephemeral',
        text: 'No matching ideas found.'
      };
    }

    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🔍 Search results for "${query}"*`
        }
      },
      { type: 'divider' }
    ];

    result.rows.forEach((idea, index) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${index + 1}. ${idea.title}*\n_${idea.type} • ${idea.category}_\n${idea.summary?.substring(0, 100)}...`
        }
      });
    });

    return {
      response_type: 'ephemeral',
      blocks
    };
  } catch (error) {
    logger.error('Search ideas error', error instanceof Error ? error : undefined);
    return {
      response_type: 'ephemeral',
      text: 'Search failed. Please try again.'
    };
  }
}

/**
 * Get recent ideas
 */
async function getRecentIdeas(): Promise<any> {
  const result = await pool.query(
    `SELECT id, title, type, category, priority, created_at
     FROM ideas
     ORDER BY created_at DESC
     LIMIT 5`
  );

  if (result.rows.length === 0) {
    return {
      response_type: 'ephemeral',
      text: 'No ideas found.'
    };
  }

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📋 Recent Ideas*'
      }
    },
    { type: 'divider' }
  ];

  result.rows.forEach((idea, index) => {
    const date = new Date(idea.created_at).toLocaleDateString('de-DE');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${index + 1}. ${idea.title}*\n_${idea.type} • ${idea.category} • ${idea.priority}_ • ${date}`
      }
    });
  });

  return {
    response_type: 'ephemeral',
    blocks
  };
}

/**
 * Disconnect Slack
 */
export async function disconnectSlack(userId: string = 'default'): Promise<void> {
  await pool.query(
    `DELETE FROM oauth_tokens WHERE provider = 'slack' AND user_id = $1`,
    [userId]
  );

  await pool.query(
    `UPDATE integrations SET is_enabled = false, sync_status = 'idle' WHERE provider = 'slack'`
  );
}

/**
 * Check if Slack is connected
 */
export async function isSlackConnected(userId: string = 'default'): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM oauth_tokens WHERE provider = 'slack' AND user_id = $1`,
    [userId]
  );
  return result.rows.length > 0;
}
