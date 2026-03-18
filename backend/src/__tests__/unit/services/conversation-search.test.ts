/**
 * Phase 101 B2: Conversation Search Tool Tests
 */

import {
  handleConversationSearch,
  handleConversationSearchDate,
  TOOL_CONVERSATION_SEARCH,
  TOOL_CONVERSATION_SEARCH_DATE,
} from '../../../services/tool-handlers/conversation-search';

// Mock database
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { queryContext } from '../../../utils/database-context';
const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

const execContext = {
  aiContext: 'personal' as const,
  sessionId: 'session-123',
};

describe('handleConversationSearch', () => {
  beforeEach(() => {
    mockQueryContext.mockReset();
  });

  it('returns formatted search results when messages found', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        {
          message_id: 'msg-1',
          session_id: 'sess-1',
          role: 'user',
          content: 'Hello, what is machine learning?',
          created_at: new Date('2026-01-01'),
          rank: 0.9,
        },
      ],
    } as never);

    const result = await handleConversationSearch({ query: 'machine learning' }, execContext);
    expect(result).toContain('machine learning');
    expect(result).not.toContain('Fehler');
  });

  it('returns not found message when no results', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

    const result = await handleConversationSearch({ query: 'quantum physics' }, execContext);
    expect(result).toContain('quantum physics');
    expect(result).toMatch(/keine|not found/i);
  });

  it('returns error when query is missing', async () => {
    const result = await handleConversationSearch({}, execContext);
    expect(result).toContain('Fehler');
  });

  it('handles DB error gracefully', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
    const result = await handleConversationSearch({ query: 'test' }, execContext);
    expect(result).toContain('Fehler');
  });
});

describe('handleConversationSearchDate', () => {
  beforeEach(() => {
    mockQueryContext.mockReset();
  });

  it('returns results filtered by date range', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        {
          message_id: 'msg-2',
          session_id: 'sess-2',
          role: 'assistant',
          content: 'Machine learning is a subset of AI',
          created_at: new Date('2026-01-15'),
          rank: 0.8,
        },
      ],
    } as never);

    const result = await handleConversationSearchDate(
      { query: 'machine learning', from_date: '2026-01-01', to_date: '2026-01-31' },
      execContext
    );
    expect(result).toContain('Machine learning');
    expect(result).not.toContain('Fehler');
  });

  it('returns error when query is missing', async () => {
    const result = await handleConversationSearchDate(
      { from_date: '2026-01-01', to_date: '2026-01-31' },
      execContext
    );
    expect(result).toContain('Fehler');
  });

  it('returns error for invalid date format', async () => {
    const result = await handleConversationSearchDate(
      { query: 'test', from_date: 'not-a-date', to_date: '2026-01-31' },
      execContext
    );
    expect(result).toContain('Fehler');
  });

  it('returns not found message when no results in date range', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);
    const result = await handleConversationSearchDate(
      { query: 'ancient history', from_date: '2025-01-01', to_date: '2025-01-31' },
      execContext
    );
    expect(result).toMatch(/keine|not found/i);
  });
});

describe('Tool definitions', () => {
  it('TOOL_CONVERSATION_SEARCH has correct name and description', () => {
    expect(TOOL_CONVERSATION_SEARCH.name).toBe('conversation_search');
    expect(TOOL_CONVERSATION_SEARCH.description).toContain('Konversationssuche');
    expect(TOOL_CONVERSATION_SEARCH.input_schema.required).toContain('query');
  });

  it('TOOL_CONVERSATION_SEARCH_DATE has correct name and description', () => {
    expect(TOOL_CONVERSATION_SEARCH_DATE.name).toBe('conversation_search_date');
    expect(TOOL_CONVERSATION_SEARCH_DATE.description).toContain('Zeitbasierte Konversationssuche');
    expect(TOOL_CONVERSATION_SEARCH_DATE.input_schema.required).toContain('query');
    expect(TOOL_CONVERSATION_SEARCH_DATE.input_schema.required).toContain('from_date');
    expect(TOOL_CONVERSATION_SEARCH_DATE.input_schema.required).toContain('to_date');
  });
});
