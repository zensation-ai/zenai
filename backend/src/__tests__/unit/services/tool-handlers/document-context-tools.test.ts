jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: any[]) => mockQueryContext(...args),
}));

const mockRetrieve = jest.fn();
jest.mock('../../../../services/memory', () => ({
  longTermMemory: {
    retrieve: (...args: any[]) => mockRetrieve(...args),
  },
}));

import { handlePrepareDocumentContext } from '../../../../services/tool-handlers/document-context-tools';

describe('handlePrepareDocumentContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockResolvedValue({ rows: [] });
    mockRetrieve.mockResolvedValue({ facts: [] });
  });

  it('returns structured context for a basic topic', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ id: '1', title: 'Q1 Report', summary: 'Revenue up 12%' }] })
      .mockResolvedValueOnce({ rows: [{ id: '2', title: 'Expansion Plan', status: 'active' }] });

    const result = await handlePrepareDocumentContext(
      { topic: 'Quartalsversammlung Q1' },
      { aiContext: 'finance' as const, userId: 'test-user' }
    );

    expect(result).toContain('Quartalsversammlung Q1');
    expect(result).toContain('Q1 Report');
    expect(result).toContain('Expansion Plan');
    expect(mockQueryContext).toHaveBeenCalled();
  });

  it('includes business section when topic contains business keywords', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    const result = await handlePrepareDocumentContext(
      { topic: 'Umsatz Quartalsbericht' },
      { aiContext: 'finance' as const, userId: 'test-user' }
    );

    // Business section header should appear even if empty (it tried to search)
    expect(result).toContain('Umsatz Quartalsbericht');
  });

  it('respects explicit include_sources overrides', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    const result = await handlePrepareDocumentContext(
      { topic: 'Test', include_sources: '{"documents":false,"ideas":true,"memory":false}' },
      { aiContext: 'operations' as const, userId: 'test-user' }
    );

    expect(result).toContain('Test');
  });

  it('handles errors gracefully (Promise.allSettled)', async () => {
    mockQueryContext.mockRejectedValue(new Error('DB error'));
    mockRetrieve.mockRejectedValue(new Error('Memory error'));

    const result = await handlePrepareDocumentContext(
      { topic: 'Test' },
      { aiContext: 'operations' as const, userId: 'test-user' }
    );

    expect(result).toContain('Test');
    expect(result).not.toContain('Fehler');
  });

  it('returns error message when topic is missing', async () => {
    const result = await handlePrepareDocumentContext(
      {} as any,
      { aiContext: 'operations' as const, userId: 'test-user' }
    );

    expect(result).toContain('Fehler');
  });

  it('suggests outline based on document type', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    const result = await handlePrepareDocumentContext(
      { topic: 'Quartalsversammlung', type: 'pptx' },
      { aiContext: 'finance' as const, userId: 'test-user' }
    );

    expect(result).toContain('Gliederung');
  });
});
