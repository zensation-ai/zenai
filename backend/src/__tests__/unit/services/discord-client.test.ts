/**
 * Unit Tests for Discord Client
 *
 * Tests the Discord webhook client: availability, message sending,
 * embed posting, and error handling.
 */

jest.mock('axios');
jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import axios from 'axios';
import {
  isDiscordAvailable,
  sendMessage,
  sendEmbed,
} from '../../../services/discord-client';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Discord Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/test/token';
    process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isDiscordAvailable', () => {
    it('should return true when webhook URL is set', () => {
      expect(isDiscordAvailable()).toBe(true);
    });

    it('should return true when bot token is set', () => {
      delete process.env.DISCORD_WEBHOOK_URL;
      expect(isDiscordAvailable()).toBe(true);
    });

    it('should return false when nothing is configured', () => {
      delete process.env.DISCORD_WEBHOOK_URL;
      delete process.env.DISCORD_BOT_TOKEN;
      expect(isDiscordAvailable()).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('should send a message via webhook and return result', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: { id: 'msg-123', content: 'Hello Discord!' },
      });

      const result = await sendMessage('Hello Discord!');

      expect(result.success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        process.env.DISCORD_WEBHOOK_URL,
        expect.objectContaining({ content: 'Hello Discord!' }),
        expect.any(Object)
      );
    });

    it('should send a message to a specific channel via bot token', async () => {
      delete process.env.DISCORD_WEBHOOK_URL;
      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: { id: 'msg-456', content: 'Channel message' },
      });

      const result = await sendMessage('Channel message', { channelId: 'ch-123' });

      expect(result.success).toBe(true);
    });

    it('should throw when content is empty', async () => {
      await expect(sendMessage('')).rejects.toThrow('Message content cannot be empty');
    });

    it('should throw when Discord is not configured', async () => {
      delete process.env.DISCORD_WEBHOOK_URL;
      delete process.env.DISCORD_BOT_TOKEN;
      await expect(sendMessage('Hello!')).rejects.toThrow('Discord is not configured');
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.post = jest.fn().mockRejectedValueOnce(new Error('Webhook not found'));
      await expect(sendMessage('Hello!')).rejects.toThrow();
    });
  });

  describe('sendEmbed', () => {
    it('should send an embed message', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: { id: 'msg-789' },
      });

      const embed = {
        title: 'ZenBrain Launch',
        description: 'We just launched!',
        color: 0x00ff88,
        url: 'https://github.com/zensation-ai/zenbrain',
      };

      const result = await sendEmbed(embed);

      expect(result.success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({ title: 'ZenBrain Launch' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should throw when embed has no title or description', async () => {
      await expect(sendEmbed({})).rejects.toThrow('Embed must have at least a title or description');
    });

    it('should throw when Discord is not configured', async () => {
      delete process.env.DISCORD_WEBHOOK_URL;
      delete process.env.DISCORD_BOT_TOKEN;
      await expect(sendEmbed({ title: 'Test' })).rejects.toThrow('Discord is not configured');
    });
  });
});
