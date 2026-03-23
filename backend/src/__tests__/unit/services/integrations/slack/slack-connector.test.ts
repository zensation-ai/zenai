import type {
  SlackWorkspace,
  SlackChannel,
  SlackMessage,
  SlackConnectorTokens,
  ProactiveConfig,
  SlackWorkflowTemplate,
  SlackSyncJobData,
} from '../../../../../services/integrations/slack/types';
import type { RuleCondition } from '../../../../../services/proactive-decision-engine';

describe('Slack Types', () => {
  it('SlackConnectorTokens extends OAuthTokens with Slack fields', () => {
    const tokens: SlackConnectorTokens = {
      accessToken: 'xoxb-test',
      tokenType: 'Bearer',
      scopes: ['channels:read'],
      botUserId: 'U123',
      teamId: 'T456',
      teamName: 'Test Workspace',
    };
    expect(tokens.botUserId).toBe('U123');
    expect(tokens.teamId).toBe('T456');
    expect(tokens.accessToken).toBe('xoxb-test');
  });

  it('ProactiveConfig has correct defaults', () => {
    const config: ProactiveConfig = {
      enabled: true,
      confidenceThreshold: 0.8,
      rateLimitMinutes: 30,
      mutedChannels: [],
    };
    expect(config.confidenceThreshold).toBe(0.8);
    expect(config.rateLimitMinutes).toBe(30);
  });

  it('SlackWorkflowTemplate uses RuleCondition from ProactiveEngine', () => {
    const condition: RuleCondition = {
      field: 'payload.text',
      operator: 'contains',
      value: 'TODO',
    };
    const template: SlackWorkflowTemplate = {
      name: 'Task Extraction',
      description: 'Extract tasks from messages',
      eventTypes: ['integration.slack.message_received'],
      conditions: [condition],
      decision: 'take_action',
      actionConfig: { action: 'create_task' },
      riskLevel: 'medium',
      requiresApproval: true,
    };
    expect(template.conditions[0].operator).toBe('contains');
  });

  it('SlackSyncJobData has required fields', () => {
    const job: SlackSyncJobData = {
      userId: 'user-1',
      connectorId: 'slack',
      workspaceId: 'ws-1',
      fullSync: false,
    };
    expect(job.connectorId).toBe('slack');
  });

  it('SlackChannel has target context constraint', () => {
    const channel: SlackChannel = {
      id: 'ch-1',
      workspaceId: 'ws-1',
      channelId: 'C123',
      channelName: 'engineering',
      isMember: true,
      targetContext: 'work',
      lastSyncCursor: null,
      muted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(['personal', 'work', 'learning', 'creative']).toContain(channel.targetContext);
  });
});

import { SlackConnector } from '../../../../../services/integrations/slack/slack-connector';
import type { OAuthTokens } from '../../../../../services/integrations/types';

// Mock dependencies
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

const { queryPublic } = require('../../../../../utils/database-context');

describe('SlackConnector', () => {
  let connector: SlackConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new SlackConnector();
  });

  describe('definition', () => {
    it('has correct connector definition', () => {
      expect(connector.definition.id).toBe('slack');
      expect(connector.definition.provider).toBe('slack');
      expect(connector.definition.category).toBe('messaging');
      expect(connector.definition.webhookSupported).toBe(true);
      expect(connector.definition.syncSupported).toBe(true);
      expect(connector.definition.defaultContext).toBe('work');
      expect(connector.definition.requiredScopes).toContain('channels:history');
      expect(connector.definition.requiredScopes).toContain('chat:write');
    });
  });

  describe('connect', () => {
    const mockTokens: SlackConnectorTokens = {
      accessToken: 'xoxb-test-token',
      tokenType: 'Bearer',
      scopes: ['channels:read', 'chat:write'],
      botUserId: 'U_BOT',
      teamId: 'T_TEAM',
      teamName: 'Test Workspace',
    };

    it('stores workspace metadata in slack_workspaces', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-1' }] });

      await connector.connect('user-1', mockTokens as OAuthTokens);

      expect(queryPublic).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.slack_workspaces'),
        expect.arrayContaining(['user-1', 'T_TEAM', 'Test Workspace', 'U_BOT']),
      );
    });

    it('uses default channel context mapping', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-1' }] });

      await connector.connect('user-1', mockTokens as OAuthTokens);

      const insertCall = queryPublic.mock.calls[0];
      expect(insertCall[0]).toContain('channel_context_mapping');
    });
  });

  describe('disconnect', () => {
    it('deletes workspace and related data', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-1' }] });
      queryPublic.mockResolvedValueOnce({ rows: [] });

      await connector.disconnect('user-1');

      expect(queryPublic).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        expect.any(Array),
      );
    });

    it('handles disconnect when no workspace exists', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [] });

      await expect(connector.disconnect('user-1')).resolves.not.toThrow();
    });
  });

  describe('health', () => {
    it('returns connected status when workspace exists', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'ws-1',
          team_name: 'Test',
          created_at: new Date().toISOString(),
        }],
      });

      const result = await connector.health('user-1');

      expect(result.connected).toBe(true);
      expect(result.tokenValid).toBe(true);
    });

    it('returns disconnected when no workspace found', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const result = await connector.health('user-1');

      expect(result.connected).toBe(false);
      expect(result.tokenValid).toBe(false);
    });
  });

  describe('sync', () => {
    it('returns sync result with item counts', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{ id: 'ws-1', team_id: 'T_TEAM' }],
      });
      queryPublic.mockResolvedValueOnce({
        rows: [{ channel_id: 'C1', channel_name: 'general', target_context: 'personal', last_sync_cursor: null }],
      });
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const result = await connector.sync('user-1', {});

      expect(result).toHaveProperty('itemsSynced');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('handleWebhook', () => {
    it('exists for interface compliance and returns null', async () => {
      const result = await connector.handleWebhook?.({
        headers: {},
        body: Buffer.from('{}'),
      });
      expect(result).toBeNull();
    });
  });
});
