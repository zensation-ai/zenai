/**
 * Discord Webhook Client
 *
 * Publishes messages to Discord channels via webhooks.
 * Simplest platform client — no OAuth needed, just a webhook URL.
 *
 * @module services/social/discord-client
 */

import { logger } from '../../utils/logger';
import { checkedFetch } from '../../utils/checked-http';
import {
  PlatformClient,
  PlatformPublishResult,
  PLATFORM_LIMITS,
} from './platform-types';

export class DiscordClient implements PlatformClient {
  readonly platform = 'discord' as const;
  private webhookUrl: string | undefined;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  }

  isConfigured(): boolean {
    return !!this.webhookUrl;
  }

  async publish(content: string, _mediaUrls?: string[]): Promise<PlatformPublishResult> {
    if (!this.webhookUrl) {
      return { success: false, error: 'Discord webhook URL not configured' };
    }

    const maxChars = PLATFORM_LIMITS.discord.maxChars;
    if (content.length > maxChars) {
      content = content.substring(0, maxChars - 3) + '...';
    }

    try {
      const res = await checkedFetch(this.webhookUrl + '?wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error(`[Discord] Publish failed: ${res.status} ${errorText}`);
        return { success: false, error: `Discord API error: ${res.status}` };
      }

      const data = await res.json() as { id: string };
      logger.info('[Discord] Published successfully', { messageId: data.id });

      return {
        success: true,
        platformPostId: data.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Discord] Publish error: ${message}`);
      return { success: false, error: message };
    }
  }
}

export function createDiscordClient(webhookUrl?: string): DiscordClient {
  return new DiscordClient(webhookUrl);
}
