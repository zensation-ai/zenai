/**
 * Personal Facts Bridge Tests
 *
 * Tests for query-relevant fact selection (Phase 42 enhancement).
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn().mockReturnValue(true),
}));

import { getPersonalFacts, getPersonalFactsPromptSection, invalidatePersonalFactsCache } from '../../../services/personal-facts-bridge';
const { queryContext } = require('../../../utils/database-context');

describe('Personal Facts Bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidatePersonalFactsCache();
  });

  describe('getPersonalFacts', () => {
    it('should return null when no facts exist', async () => {
      queryContext.mockResolvedValue({ rows: [] });
      const result = await getPersonalFacts();
      expect(result).toBeNull();
    });

    it('should format facts grouped by category', async () => {
      queryContext.mockResolvedValue({
        rows: [
          { category: 'basic_info', fact_key: 'name', fact_value: 'Alexander', confidence: '0.95' },
          { category: 'basic_info', fact_key: 'beruf', fact_value: 'Unternehmer', confidence: '0.9' },
          { category: 'communication_style', fact_key: 'anrede', fact_value: 'Du', confidence: '0.85' },
        ],
      });

      const result = await getPersonalFacts();
      expect(result).toContain('Grundlegendes');
      expect(result).toContain('name: Alexander');
      expect(result).toContain('beruf: Unternehmer');
      expect(result).toContain('Kommunikationsstil');
      expect(result).toContain('anrede: Du');
    });

    it('should cache results for 60 seconds', async () => {
      queryContext.mockResolvedValue({
        rows: [{ category: 'basic_info', fact_key: 'name', fact_value: 'Test', confidence: '0.9' }],
      });

      await getPersonalFacts();
      await getPersonalFacts();

      // Should only call DB once (second call is cached)
      expect(queryContext).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPersonalFactsPromptSection', () => {
    it('should return empty string when no facts', async () => {
      queryContext.mockResolvedValue({ rows: [] });
      const result = await getPersonalFactsPromptSection();
      expect(result).toBe('');
    });

    it('should include section header and footer', async () => {
      queryContext.mockResolvedValue({
        rows: [{ category: 'basic_info', fact_key: 'name', fact_value: 'Test', confidence: '0.9' }],
      });

      const result = await getPersonalFactsPromptSection();
      expect(result).toContain('[PERSÖNLICHES PROFIL]');
      expect(result).toContain('personalisierte, empathische Antworten');
    });

    it('should include all facts when no query provided', async () => {
      queryContext.mockResolvedValue({
        rows: [
          { category: 'basic_info', fact_key: 'name', fact_value: 'Alexander', confidence: '0.95' },
          { category: 'work_life', fact_key: 'beruf', fact_value: 'Entwickler', confidence: '0.8' },
          { category: 'interests_hobbies', fact_key: 'hobby', fact_value: 'Kochen', confidence: '0.7' },
        ],
      });

      const result = await getPersonalFactsPromptSection();
      expect(result).toContain('Alexander');
      expect(result).toContain('Entwickler');
      expect(result).toContain('Kochen');
    });

    it('should prioritize core categories when query is provided', async () => {
      // Simulate many facts so query-relevant selection kicks in
      const manyFacts = [];
      // Core facts (always included)
      manyFacts.push({ category: 'basic_info', fact_key: 'name', fact_value: 'Alexander', confidence: '0.95' });
      manyFacts.push({ category: 'communication_style', fact_key: 'anrede', fact_value: 'Du', confidence: '0.9' });
      manyFacts.push({ category: 'personality', fact_key: 'stil', fact_value: 'direkt', confidence: '0.85' });

      // Non-core facts (26+ to exceed MAX_CORE + MAX_RELEVANT)
      for (let i = 0; i < 30; i++) {
        manyFacts.push({
          category: i % 2 === 0 ? 'work_life' : 'interests_hobbies',
          fact_key: `fact_${i}`,
          fact_value: i === 0 ? 'Python Programmierung' : `value_${i}`,
          confidence: `${0.9 - i * 0.02}`,
        });
      }

      queryContext.mockResolvedValue({ rows: manyFacts });
      invalidatePersonalFactsCache();

      const result = await getPersonalFactsPromptSection('Was weißt du über meine Python Programmierung?');

      // Core facts should always be included
      expect(result).toContain('Alexander');
      expect(result).toContain('anrede: Du');

      // Query-relevant fact should be included
      expect(result).toContain('Python Programmierung');
    });
  });

  describe('invalidatePersonalFactsCache', () => {
    it('should force reload on next call', async () => {
      queryContext.mockResolvedValue({
        rows: [{ category: 'basic_info', fact_key: 'name', fact_value: 'V1', confidence: '0.9' }],
      });

      await getPersonalFacts();
      expect(queryContext).toHaveBeenCalledTimes(1);

      // Invalidate and query again
      invalidatePersonalFactsCache();

      queryContext.mockResolvedValue({
        rows: [{ category: 'basic_info', fact_key: 'name', fact_value: 'V2', confidence: '0.9' }],
      });

      const result = await getPersonalFacts();
      expect(queryContext).toHaveBeenCalledTimes(2);
      expect(result).toContain('V2');
    });
  });
});
