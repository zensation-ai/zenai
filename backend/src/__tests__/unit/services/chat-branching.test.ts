/**
 * Chat Branching Tests
 *
 * Tests for message editing, regeneration, and version history endpoints.
 */

import express from 'express';
import request from 'supertest';

// Mock dependencies before importing the router
jest.mock('../../../utils/database', () => ({
  query: jest.fn(),
}));
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn(() => true),
}));
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../../../utils/schemas', () => ({
  validateBody: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  CreateChatSessionSchema: {},
  ChatMessageSchema: {},
}));
jest.mock('../../../middleware/input-screening', () => ({
  inputScreeningMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../../../services/security/rate-limit-advanced', () => ({
  advancedRateLimiter: { ai: (_req: unknown, _res: unknown, next: () => void) => next() },
}));
jest.mock('../../../utils/user-context', () => ({
  getUserId: () => '00000000-0000-0000-0000-000000000001',
}));
jest.mock('../../../services/general-chat', () => ({
  createSession: jest.fn(),
  getSession: jest.fn(),
  getSessions: jest.fn(),
  deleteSession: jest.fn(),
  sendMessage: jest.fn(),
  sendMessageWithVision: jest.fn(),
  addMessage: jest.fn(),
  updateSessionTitle: jest.fn(),
  GENERAL_CHAT_SYSTEM_PROMPT: 'test prompt',
}));
jest.mock('../../../services/assistant-knowledge', () => ({
  getAssistantSystemPrompt: () => 'assistant prompt',
}));
jest.mock('../../../services/activity-tracker', () => ({
  trackActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/claude/streaming', () => ({
  setupSSEHeaders: jest.fn(),
  thinkingStream: jest.fn(),
  streamToSSE: jest.fn(),
}));
jest.mock('../../../services/claude/tool-use', () => ({
  toolRegistry: { getDefinitions: () => [], execute: jest.fn() },
  ToolExecutionContext: {},
}));
jest.mock('../../../services/chat-modes', () => ({
  detectChatModeAsync: jest.fn().mockResolvedValue({ mode: 'conversation' }),
}));
jest.mock('../../../services/thinking-partner', () => ({
  isValidThinkingMode: jest.fn(() => true),
  getAvailableModes: jest.fn(() => []),
  applyThinkingMode: jest.fn((p: string) => p),
  ThinkingMode: {},
}));
jest.mock('../../../services/claude/context-compaction', () => ({
  buildCompactionConfig: jest.fn(),
  shouldEnableCompaction: jest.fn(() => false),
  estimateConversationTokens: jest.fn(() => 1000),
  getCompactionState: jest.fn(() => ({ compactionCount: 0 })),
}));
jest.mock('../../../services/claude/thinking-budget', () => ({
  classifyTaskType: jest.fn(() => 'general'),
  calculateDynamicBudget: jest.fn().mockResolvedValue({ recommendedBudget: 10000, complexity: { score: 0.5 }, reasoning: 'test' }),
}));
jest.mock('../../../services/query-intent-classifier', () => ({
  classifyIntent: jest.fn(() => ({ intent: 'retrieval' })),
}));
jest.mock('../../../services/memory', () => ({
  memoryCoordinator: {
    addInteraction: jest.fn().mockResolvedValue(undefined),
    prepareEnhancedContext: jest.fn().mockResolvedValue({ systemEnhancement: '', stats: {}, episodicMemory: {} }),
  },
  episodicMemory: { store: jest.fn().mockResolvedValue(undefined) },
  workingMemory: { generateContextString: jest.fn(() => '') },
}));
jest.mock('../../../services/business-context', () => ({
  getUnifiedContext: jest.fn().mockResolvedValue({ contextDepthScore: 0 }),
}));
jest.mock('../../../services/personal-facts-bridge', () => ({
  getPersonalFactsPromptSection: jest.fn().mockResolvedValue(''),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../config/constants', () => ({
  CHAT: {
    MAX_MESSAGE_LENGTH: 10000,
    MAX_HISTORY_MESSAGES: 50,
    MAX_MEMORY_CONTEXT_TOKENS: 2000,
    DEFAULT_TEMPERATURE: 0.7,
    DEFAULT_MAX_TOKENS: 4096,
  },
  CLAUDE: {
    MAX_RETRIES: 3,
    INITIAL_RETRY_DELAY_MS: 1000,
    MAX_RETRY_DELAY_MS: 10000,
    TIMEOUT_MS: 30000,
  },
}));
jest.mock('../../../utils/validation', () => ({
  isValidUUID: jest.fn(() => true),
  toIntBounded: jest.fn((_v: string, d: number) => d),
}));

import { query } from '../../../utils/database';
import { errorHandler } from '../../../middleware/errorHandler';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Chat Branching API', () => {
  let app: express.Express;

  beforeAll(async () => {
    // Import after mocks
    const { generalChatRouter } = await import('../../../routes/general-chat');
    app = express();
    app.use(express.json());
    app.use('/api/chat', generalChatRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================
  // GET /sessions/:sessionId/messages/:messageId/versions
  // =============================================
  describe('GET /sessions/:sessionId/messages/:messageId/versions', () => {
    it('should return all versions of a message', async () => {
      const parentId = 'parent-msg-1';
      const versions = [
        { id: 'v1', session_id: 's1', role: 'user', content: 'Original', version: 1, is_active: false, parent_message_id: parentId, created_at: '2026-01-01T00:00:00Z' },
        { id: 'v2', session_id: 's1', role: 'user', content: 'Edited', version: 2, is_active: true, parent_message_id: parentId, created_at: '2026-01-01T00:01:00Z' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: versions, command: 'SELECT', rowCount: 2, oid: 0, fields: [] });

      const res = await request(app)
        .get('/api/chat/sessions/s1/messages/msg1/versions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.versions).toHaveLength(2);
      expect(res.body.versions[0].content).toBe('Original');
      expect(res.body.versions[1].content).toBe('Edited');
    });

    it('should return empty array when no versions found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] });

      const res = await request(app)
        .get('/api/chat/sessions/s1/messages/msg1/versions');

      expect(res.status).toBe(200);
      expect(res.body.versions).toHaveLength(0);
    });
  });

  // =============================================
  // PUT /sessions/:sessionId/messages/:messageId/edit
  // =============================================
  describe('PUT /sessions/:sessionId/messages/:messageId/edit', () => {
    it('should mark old messages inactive and create edited message', async () => {
      // Mock: find original message
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'msg1',
          session_id: 's1',
          role: 'user',
          content: 'Original',
          parent_message_id: 'parent1',
          version: 1,
          user_id: '00000000-0000-0000-0000-000000000001',
        }],
        command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      });

      // Mock: deactivate subsequent messages
      mockQuery.mockResolvedValueOnce({ rows: [], command: 'UPDATE', rowCount: 3, oid: 0, fields: [] });

      // Mock: insert new edited message
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'msg-new',
          session_id: 's1',
          role: 'user',
          content: 'Edited content',
          version: 2,
          parent_message_id: 'parent1',
          is_active: true,
          created_at: '2026-01-01T00:01:00Z',
        }],
        command: 'INSERT', rowCount: 1, oid: 0, fields: [],
      });

      const res = await request(app)
        .put('/api/chat/sessions/s1/messages/msg1/edit')
        .send({ content: 'Edited content' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message.content).toBe('Edited content');
      expect(res.body.message.version).toBe(2);
    });

    it('should return 400 when content is missing', async () => {
      const res = await request(app)
        .put('/api/chat/sessions/s1/messages/msg1/edit')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 when message not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] });

      const res = await request(app)
        .put('/api/chat/sessions/s1/messages/msg1/edit')
        .send({ content: 'Edited' });

      expect(res.status).toBe(404);
    });
  });

  // =============================================
  // POST /sessions/:sessionId/messages/:messageId/regenerate
  // =============================================
  describe('POST /sessions/:sessionId/messages/:messageId/regenerate', () => {
    it('should mark old assistant message inactive and create placeholder', async () => {
      // Mock: find original assistant message
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'msg-assist1',
          session_id: 's1',
          role: 'assistant',
          content: 'Old response',
          parent_message_id: 'user-msg-1',
          version: 1,
          user_id: '00000000-0000-0000-0000-000000000001',
        }],
        command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      });

      // Mock: deactivate old message
      mockQuery.mockResolvedValueOnce({ rows: [], command: 'UPDATE', rowCount: 1, oid: 0, fields: [] });

      // Mock: insert regenerated placeholder
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'msg-new-assist',
          session_id: 's1',
          role: 'assistant',
          content: '',
          version: 2,
          parent_message_id: 'user-msg-1',
          is_active: true,
          created_at: '2026-01-01T00:02:00Z',
        }],
        command: 'INSERT', rowCount: 1, oid: 0, fields: [],
      });

      const res = await request(app)
        .post('/api/chat/sessions/s1/messages/msg-assist1/regenerate');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message.version).toBe(2);
    });

    it('should return 404 when assistant message not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] });

      const res = await request(app)
        .post('/api/chat/sessions/s1/messages/not-found/regenerate');

      expect(res.status).toBe(404);
    });

    it('should return 400 when trying to regenerate a user message', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'msg-user',
          session_id: 's1',
          role: 'user',
          content: 'user msg',
          parent_message_id: null,
          version: 1,
          user_id: '00000000-0000-0000-0000-000000000001',
        }],
        command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      });

      const res = await request(app)
        .post('/api/chat/sessions/s1/messages/msg-user/regenerate');

      expect(res.status).toBe(400);
    });
  });
});
