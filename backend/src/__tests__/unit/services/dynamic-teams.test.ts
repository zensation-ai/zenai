/**
 * Phase 100 B3: Dynamic Team Composition Tests
 */

// Mock the agent-identity service
const mockListIdentities = jest.fn();
const mockBuildPersonaPrompt = jest.fn();
jest.mock('../../../services/agents/agent-identity', () => ({
  getAgentIdentityService: () => ({
    listIdentities: mockListIdentities,
    buildPersonaPrompt: mockBuildPersonaPrompt,
  }),
  resetAgentIdentityService: jest.fn(),
}));

// Mock database
jest.mock('../../../utils/database-context', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  isValidContext: jest.fn().mockReturnValue(true),
  AIContext: {},
}));

// Mock Claude client
jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: () => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '[{"agent":"researcher","task":"test"}]' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn',
      }),
    },
  }),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
}));

// Mock tool-use
jest.mock('../../../services/claude/tool-use', () => ({
  toolRegistry: {
    getDefinitionsFor: jest.fn().mockReturnValue([]),
    execute: jest.fn().mockResolvedValue('tool result'),
    has: jest.fn().mockReturnValue(true),
  },
}));

// Mock memory
jest.mock('../../../services/memory/shared-memory', () => ({
  sharedMemory: {
    initialize: jest.fn(),
    write: jest.fn().mockReturnValue({ id: 'test' }),
    read: jest.fn().mockReturnValue([]),
    getContext: jest.fn().mockReturnValue(''),
    getStats: jest.fn().mockReturnValue({ totalEntries: 0, byAgent: {}, byType: {} }),
    clear: jest.fn(),
  },
  AgentRole: {},
}));

// Mock cache
jest.mock('../../../utils/cache', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  },
  getRedisClient: jest.fn().mockReturnValue(null),
}));

// Mock event-system
jest.mock('../../../services/event-system', () => ({
  emitSystemEvent: jest.fn().mockResolvedValue(undefined),
}));

describe('Dynamic Team Composition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListIdentities.mockReset();
    mockBuildPersonaPrompt.mockReset();
  });

  describe('createAgentWithIdentity', () => {
    it('should use DB identity when found for role', async () => {
      const mockIdentity = {
        id: 'id-1',
        name: 'Deep Researcher',
        role: 'researcher',
        persona: {
          tone: 'analytical',
          expertise: ['data science', 'ML'],
          style: 'detailed',
          language: 'de',
          customInstructions: 'Always cite sources',
        },
        model: 'claude-sonnet-4-20250514',
        permissions: [],
        maxTokenBudget: 10000,
        maxExecutionTimeMs: 120000,
        trustLevel: 'high' as const,
        governancePolicyId: null,
        memoryScope: null,
        createdBy: null,
        enabled: true,
        executionCount: 5,
        successRate: 0.9,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockListIdentities.mockResolvedValue([mockIdentity]);
      mockBuildPersonaPrompt.mockReturnValue('You are Deep Researcher, a researcher agent.\nCommunication tone: analytical');

      const { createAgentWithIdentity } = require('../../../services/agent-orchestrator');
      const agent = await createAgentWithIdentity('researcher', 'test context');

      expect(agent).toBeDefined();
      expect(agent.role).toBe('researcher');
      expect(mockListIdentities).toHaveBeenCalledWith({ role: 'researcher', enabled: true });
      expect(mockBuildPersonaPrompt).toHaveBeenCalledWith(mockIdentity);
    });

    it('should fall back to hardcoded factory when no identity found', async () => {
      mockListIdentities.mockResolvedValue([]);

      const { createAgentWithIdentity } = require('../../../services/agent-orchestrator');
      const agent = await createAgentWithIdentity('researcher', 'test');

      expect(agent).toBeDefined();
      expect(agent.role).toBe('researcher');
      // Should not have called buildPersonaPrompt since no identity was found
      expect(mockBuildPersonaPrompt).not.toHaveBeenCalled();
    });

    it('should fall back when identity service errors', async () => {
      mockListIdentities.mockRejectedValue(new Error('DB connection failed'));

      const { createAgentWithIdentity } = require('../../../services/agent-orchestrator');
      const agent = await createAgentWithIdentity('writer', 'test');

      expect(agent).toBeDefined();
      expect(agent.role).toBe('writer');
    });

    it('should work for all standard roles', async () => {
      mockListIdentities.mockResolvedValue([]);

      const { createAgentWithIdentity } = require('../../../services/agent-orchestrator');

      for (const role of ['researcher', 'writer', 'reviewer', 'coder']) {
        const agent = await createAgentWithIdentity(role, 'test');
        expect(agent.role).toBe(role);
      }
    });
  });

  describe('BaseAgent personaPrompt', () => {
    it('should accept optional personaPrompt in constructor', () => {
      const { BaseAgent } = require('../../../services/agents/base-agent');

      class TestAgent extends BaseAgent {
        constructor() {
          super({
            role: 'researcher' as const,
            modelId: 'test-model',
            systemPrompt: 'Default prompt',
            tools: [],
            temperature: 0.7,
            maxTokens: 4096,
            maxIterations: 5,
            personaPrompt: 'Custom persona instructions',
          });
        }
      }

      const agent = new TestAgent();
      expect(agent.role).toBe('researcher');
      // The config should have personaPrompt
      expect((agent as any).config.personaPrompt).toBe('Custom persona instructions');
    });
  });
});
