import { isImportantMessage, detectLanguage } from '../../../../../services/integrations/slack/slack-bot';

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

const { emitSystemEvent } = require('../../../../../services/event-system');

describe('SlackBot', () => {
  describe('isImportantMessage', () => {
    it('skips bot messages', () => {
      expect(isImportantMessage({ text: 'hello world test', bot_id: 'B123' })).toBe(false);
    });

    it('skips messages shorter than 5 words', () => {
      expect(isImportantMessage({ text: 'ok danke' })).toBe(false);
    });

    it('skips emoji-only messages', () => {
      expect(isImportantMessage({ text: ':thumbsup: :tada:' })).toBe(false);
    });

    it('skips noise patterns', () => {
      expect(isImportantMessage({ text: 'ok' })).toBe(false);
      expect(isImportantMessage({ text: 'danke' })).toBe(false);
      expect(isImportantMessage({ text: 'lol' })).toBe(false);
      expect(isImportantMessage({ text: '+1' })).toBe(false);
    });

    it('passes messages with substantive content', () => {
      expect(isImportantMessage({ text: 'We decided to use PostgreSQL for the new service' })).toBe(true);
    });

    it('passes messages with action words', () => {
      expect(isImportantMessage({ text: 'TODO: prepare the proposal by Friday deadline' })).toBe(true);
    });
  });

  describe('detectLanguage', () => {
    it('detects German text', () => {
      expect(detectLanguage('Wir haben heute besprochen dass wir PostgreSQL nutzen')).toBe('de');
    });

    it('detects English text', () => {
      expect(detectLanguage('We decided to use PostgreSQL for the new service')).toBe('en');
    });

    it('defaults to English for ambiguous text', () => {
      expect(detectLanguage('PostgreSQL')).toBe('en');
    });
  });

  describe('parseSlashCommand', () => {
    it('parses /zenai summarize', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('summarize');
      expect(result.command).toBe('summarize');
      expect(result.args).toBe('');
    });

    it('parses /zenai task with description', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('task Prepare the proposal');
      expect(result.command).toBe('task');
      expect(result.args).toBe('Prepare the proposal');
    });

    it('parses /zenai remember with text', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('remember API rate limit is 1000/min');
      expect(result.command).toBe('remember');
      expect(result.args).toBe('API rate limit is 1000/min');
    });

    it('parses /zenai context with channel and context', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('context #engineering work');
      expect(result.command).toBe('context');
      expect(result.args).toBe('#engineering work');
    });

    it('returns help for empty input', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('');
      expect(result.command).toBe('help');
    });

    it('returns help for unknown commands', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('unknown command here');
      expect(result.command).toBe('help');
    });
  });

  describe('normalizeSlackEvent', () => {
    it('maps channel message to integration.slack.message_received', () => {
      const { normalizeSlackEvent } = require('../../../../../services/integrations/slack/slack-bot');
      const event = {
        type: 'message',
        channel_type: 'channel',
        text: 'Hello world this is a test message',
        user: 'U123',
        channel: 'C456',
        ts: '1234567890.123456',
      };
      const result = normalizeSlackEvent(event, 'user-1', 'work');
      expect(result.type).toBe('integration.slack.message_received');
      expect(result.connectorId).toBe('slack');
      expect(result.targetContext).toBe('work');
    });

    it('maps DM to integration.slack.dm_received', () => {
      const { normalizeSlackEvent } = require('../../../../../services/integrations/slack/slack-bot');
      const event = {
        type: 'message',
        channel_type: 'im',
        text: 'Help me with this task',
        user: 'U123',
        channel: 'D456',
        ts: '1234567890.123456',
      };
      const result = normalizeSlackEvent(event, 'user-1', 'work');
      expect(result.type).toBe('integration.slack.dm_received');
    });

    it('maps app_mention to integration.slack.mention', () => {
      const { normalizeSlackEvent } = require('../../../../../services/integrations/slack/slack-bot');
      const event = {
        type: 'app_mention',
        text: '<@U_BOT> summarize this channel',
        user: 'U123',
        channel: 'C456',
        ts: '1234567890.123456',
      };
      const result = normalizeSlackEvent(event, 'user-1', 'work');
      expect(result.type).toBe('integration.slack.mention');
    });

    it('maps reaction_added to integration.slack.reaction', () => {
      const { normalizeSlackEvent } = require('../../../../../services/integrations/slack/slack-bot');
      const event = {
        type: 'reaction_added',
        reaction: 'thumbsup',
        user: 'U123',
        item: { channel: 'C456', ts: '1234567890.123456' },
      };
      const result = normalizeSlackEvent(event, 'user-1', 'work');
      expect(result.type).toBe('integration.slack.reaction');
    });
  });
});
