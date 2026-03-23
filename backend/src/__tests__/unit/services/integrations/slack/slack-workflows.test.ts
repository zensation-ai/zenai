import { getWorkflowTemplates, installWorkflowTemplates, removeWorkflowTemplates } from '../../../../../services/integrations/slack/slack-workflows';

jest.mock('../../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));
jest.mock('../../../../../services/proactive-decision-engine', () => ({
  createProactiveRule: jest.fn().mockResolvedValue({ id: 'rule-1' }),
  listProactiveRules: jest.fn().mockResolvedValue([]),
  deleteProactiveRule: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { createProactiveRule, listProactiveRules, deleteProactiveRule } = require('../../../../../services/proactive-decision-engine');

describe('SlackWorkflows', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getWorkflowTemplates', () => {
    it('returns 6 pre-built templates', () => {
      const templates = getWorkflowTemplates();
      expect(templates).toHaveLength(6);
    });

    it('includes Channel Digest template', () => {
      const templates = getWorkflowTemplates();
      const digest = templates.find((t) => t.name === 'Channel Digest');
      expect(digest).toBeDefined();
      expect(digest!.riskLevel).toBe('low');
      expect(digest!.requiresApproval).toBe(false);
    });

    it('includes Task Extraction with medium risk', () => {
      const templates = getWorkflowTemplates();
      const taskExtract = templates.find((t) => t.name === 'Task Extraction');
      expect(taskExtract).toBeDefined();
      expect(taskExtract!.riskLevel).toBe('medium');
      expect(taskExtract!.requiresApproval).toBe(true);
      expect(taskExtract!.eventTypes).toContain('integration.slack.message_received');
    });

    it('includes Agent Delegation with high risk', () => {
      const templates = getWorkflowTemplates();
      const agentDelegation = templates.find((t) => t.name === 'Agent Delegation');
      expect(agentDelegation).toBeDefined();
      expect(agentDelegation!.riskLevel).toBe('high');
      expect(agentDelegation!.requiresApproval).toBe(true);
      expect(agentDelegation!.eventTypes).toContain('integration.slack.dm_received');
    });
  });

  describe('installWorkflowTemplates', () => {
    it('creates ProactiveEngine rules for each template', async () => {
      await installWorkflowTemplates('work');

      expect(createProactiveRule).toHaveBeenCalledTimes(6);
    });

    it('passes correct context to createProactiveRule', async () => {
      await installWorkflowTemplates('personal');

      expect(createProactiveRule).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({ name: expect.any(String) }),
      );
    });
  });

  describe('removeWorkflowTemplates', () => {
    it('deletes all Slack workflow rules', async () => {
      listProactiveRules.mockResolvedValueOnce([
        { id: 'rule-1', name: 'Channel Digest', description: '[Slack]' },
        { id: 'rule-2', name: 'Task Extraction', description: '[Slack]' },
      ]);

      await removeWorkflowTemplates('work');

      expect(deleteProactiveRule).toHaveBeenCalledTimes(2);
    });

    it('handles no existing rules gracefully', async () => {
      listProactiveRules.mockResolvedValueOnce([]);

      await expect(removeWorkflowTemplates('work')).resolves.not.toThrow();
      expect(deleteProactiveRule).not.toHaveBeenCalled();
    });
  });
});
