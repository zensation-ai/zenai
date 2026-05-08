/**
 * Unit tests for seed-social-rules
 *
 * Verifies that:
 * - New rules are inserted when they don't exist
 * - Existing rules are skipped (idempotent)
 * - DB errors are handled gracefully
 *
 * @module __tests__/unit/services/social/seed-social-rules
 */

// ===========================================
// Mocks
// ===========================================

const mockQueryContext = jest.fn();

jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ===========================================
// Imports
// ===========================================

import { seedSocialRules } from '../../../../services/social/seed-social-rules';

// ===========================================
// Tests
// ===========================================

describe('seedSocialRules', () => {
  beforeEach(() => {
    mockQueryContext.mockReset();
  });

  it('should insert both rules when none exist', async () => {
    // SELECT returns empty for all rules (not found)
    mockQueryContext
      .mockResolvedValueOnce({ rows: [] })  // check rule 1
      .mockResolvedValueOnce({ rows: [{ id: '1' }] })  // insert rule 1
      .mockResolvedValueOnce({ rows: [] })  // check rule 2
      .mockResolvedValueOnce({ rows: [{ id: '2' }] })  // insert rule 2
      .mockResolvedValueOnce({ rows: [] })  // check rule 3
      .mockResolvedValueOnce({ rows: [{ id: '3' }] });  // insert rule 3

    const count = await seedSocialRules('finance');
    expect(count).toBe(3);
    expect(mockQueryContext).toHaveBeenCalledTimes(6);
  });

  it('should skip rules that already exist', async () => {
    // SELECT returns existing row for all rules
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ id: 'existing-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-3' }] });

    const count = await seedSocialRules('finance');
    expect(count).toBe(0);
    expect(mockQueryContext).toHaveBeenCalledTimes(3); // Only SELECT queries, no INSERT
  });

  it('should insert only missing rules', async () => {
    // Rule 1 exists, Rule 2 does not
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ id: 'existing-1' }] })  // rule 1 exists
      .mockResolvedValueOnce({ rows: [] })  // rule 2 not found
      .mockResolvedValueOnce({ rows: [{ id: 'new-2' }] });  // insert rule 2

    const count = await seedSocialRules('finance');
    expect(count).toBe(1);
  });

  it('should use correct context for queries', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ id: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: '2' }] });

    await seedSocialRules('operations');

    expect(mockQueryContext).toHaveBeenCalledWith(
      'operations',
      expect.stringContaining('SELECT'),
      expect.arrayContaining(['operations']),
    );
  });

  it('should handle DB errors gracefully', async () => {
    mockQueryContext.mockRejectedValue(new Error('Table does not exist'));

    const count = await seedSocialRules('finance');
    expect(count).toBe(0); // No rules created, but no throw
  });

  it('should include correct event types in rules', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [] })  // check rule 1
      .mockResolvedValueOnce({ rows: [{ id: '1' }] })  // insert rule 1
      .mockResolvedValueOnce({ rows: [] })  // check rule 2
      .mockResolvedValueOnce({ rows: [{ id: '2' }] })  // insert rule 2
      .mockResolvedValueOnce({ rows: [] })  // check rule 3
      .mockResolvedValueOnce({ rows: [{ id: '3' }] });  // insert rule 3

    await seedSocialRules('finance');

    // First INSERT call (index 1) — params array contains event_types as nested array
    const insertCall1Params = mockQueryContext.mock.calls[1][2] as unknown[];
    // event_types is the 4th param (index 3): ['blog_published']
    expect(insertCall1Params).toEqual(
      expect.arrayContaining([expect.arrayContaining(['blog_published'])]),
    );

    // Second INSERT call (index 3)
    const insertCall2Params = mockQueryContext.mock.calls[3][2] as unknown[];
    expect(insertCall2Params).toEqual(
      expect.arrayContaining([expect.arrayContaining(['phase_completed'])]),
    );

    // Third INSERT call (index 5)
    const insertCall3Params = mockQueryContext.mock.calls[5][2] as unknown[];
    expect(insertCall3Params).toEqual(
      expect.arrayContaining([expect.arrayContaining(['weekly_summary'])]),
    );
  });
});
