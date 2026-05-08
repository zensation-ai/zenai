/**
 * Discord Client
 *
 * Handles sending messages and embeds to Discord via webhook or bot token.
 * Webhook is preferred for simplicity; bot token enables channel targeting.
 */

import { checkedAxiosPost } from '../utils/checked-http';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  timestamp?: string;
}

export interface SendMessageOptions {
  channelId?: string;
  username?: string;
  avatarUrl?: string;
}

export interface DiscordMessageResult {
  success: boolean;
  message_id?: string;
}

// ===========================================
// Availability Check
// ===========================================

export function isDiscordAvailable(): boolean {
  return !!(process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_BOT_TOKEN);
}

// ===========================================
// API Methods
// ===========================================

/**
 * Send a plain text message to Discord
 *
 * Uses webhook URL if available (no channel ID required).
 * Falls back to bot token + channel ID for targeted channel posting.
 */
export async function sendMessage(content: string, options: SendMessageOptions = {}): Promise<DiscordMessageResult> {
  if (!content || content.trim().length === 0) {
    throw new Error('Message content cannot be empty');
  }

  if (!isDiscordAvailable()) {
    throw new Error('Discord is not configured');
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  const payload: Record<string, unknown> = {
    content,
    username: options.username,
    avatar_url: options.avatarUrl,
  };

  // Remove undefined keys
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  if (webhookUrl && !options.channelId) {
    logger.debug('Sending Discord message via webhook');
    const response = await checkedAxiosPost<{ id?: string }>(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      params: { wait: true },
    });
    return { success: true, message_id: response.data?.id };
  }

  if (botToken) {
    const channelId = options.channelId;
    if (!channelId) {
      throw new Error('Channel ID is required when using bot token without a webhook URL');
    }
    logger.debug('Sending Discord message via bot token', { channelId });
    const response = await checkedAxiosPost<{ id?: string }>(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      payload,
      { headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' } }
    );
    return { success: true, message_id: response.data?.id };
  }

  throw new Error('Discord is not configured');
}

/**
 * Send an embed to Discord
 */
export async function sendEmbed(embed: DiscordEmbed, options: SendMessageOptions = {}): Promise<DiscordMessageResult> {
  if (!embed.title && !embed.description) {
    throw new Error('Embed must have at least a title or description');
  }

  if (!isDiscordAvailable()) {
    throw new Error('Discord is not configured');
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  const payload: Record<string, unknown> = {
    embeds: [embed],
    username: options.username,
    avatar_url: options.avatarUrl,
  };

  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  if (webhookUrl && !options.channelId) {
    logger.debug('Sending Discord embed via webhook');
    const response = await checkedAxiosPost<{ id?: string }>(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      params: { wait: true },
    });
    return { success: true, message_id: response.data?.id };
  }

  if (botToken) {
    const channelId = options.channelId;
    if (!channelId) {
      throw new Error('Channel ID is required when using bot token without a webhook URL');
    }
    const response = await checkedAxiosPost<{ id?: string }>(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      payload,
      { headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' } }
    );
    return { success: true, message_id: response.data?.id };
  }

  throw new Error('Discord is not configured');
}
