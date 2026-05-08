jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  AIContext: {},
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../services/agents/base-agent', () => ({
  BaseAgent: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) { this.config = config; }
    protected buildSystemPrompt() { return ''; }
    async execute() {
      return {
        success: true,
        content: JSON.stringify({
          content: 'Weekly summary post',
          hashtags: ['#ZenAI'],
          estimatedEngagement: 'medium',
        }),
      };
    }
  },
}));

jest.mock('../../../../services/social/social-publisher', () => ({
  createPostDraft: jest.fn().mockResolvedValue({ id: 'draft-1', platform: 'twitter' }),
}));

jest.mock('../../../../services/governance', () => ({
  requestApproval: jest.fn().mockResolvedValue({ id: 'gov-1' }),
}));

import { queryContext } from '../../../../utils/database-context';
import type { AIContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.Mock;

import { ContentAgent } from '../../../../services/social/content-agent';

describe('ContentAgent.draftWeeklySummary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates 3 drafts (twitter, linkedin, discord) from weekly activity', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // published posts
      .mockResolvedValueOnce({ rows: [{ count: '12' }] }) // new ideas
      .mockResolvedValueOnce({ rows: [{ count: '8' }] }); // done tasks

    const agent = new ContentAgent();
    const results = await agent.draftWeeklySummary('finance' as AIContext);

    expect(results).toHaveLength(3);
    expect(results.map((r: { platform: string }) => r.platform).sort()).toEqual(['discord', 'linkedin', 'twitter']);
  });

  it('handles empty week gracefully (zero activity)', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const agent = new ContentAgent();
    const results = await agent.draftWeeklySummary('finance' as AIContext);
    expect(results).toHaveLength(3);
  });
});
