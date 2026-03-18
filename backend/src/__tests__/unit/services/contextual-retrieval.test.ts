/**
 * Phase 99: Contextual Retrieval Tests
 */

import {
  generateContextPrefix,
  enrichChunk,
  enrichChunkFull,
  getEnrichedEmbeddingColumn,
} from '../../../services/contextual-retrieval';

describe('Contextual Retrieval', () => {
  describe('generateContextPrefix', () => {
    it('generates prefix with title and section', () => {
      const prefix = generateContextPrefix({
        documentTitle: 'Q3 Earnings Report',
        sectionHeader: 'Revenue Growth',
        chunkContent: 'Revenue grew 3% year-over-year.',
      });
      expect(prefix).toBe("This chunk from 'Q3 Earnings Report' discusses Revenue Growth. ");
    });

    it('generates prefix with title only', () => {
      const prefix = generateContextPrefix({
        documentTitle: 'Meeting Notes',
        chunkContent: 'We agreed on the timeline.',
      });
      expect(prefix).toBe("This chunk from 'Meeting Notes'. ");
    });

    it('generates prefix with section only', () => {
      const prefix = generateContextPrefix({
        sectionHeader: 'Implementation Details',
        chunkContent: 'The algorithm uses dynamic programming.',
      });
      expect(prefix).toBe('This chunk discusses Implementation Details. ');
    });

    it('returns empty string when no metadata', () => {
      const prefix = generateContextPrefix({
        chunkContent: 'Some content without context.',
      });
      expect(prefix).toBe('');
    });
  });

  describe('enrichChunk', () => {
    it('prepends context prefix to content', () => {
      const result = enrichChunk(
        'Revenue grew 3%.',
        "This chunk from 'Q3 Report' discusses Finance. "
      );
      expect(result).toBe("This chunk from 'Q3 Report' discusses Finance. Revenue grew 3%.");
    });

    it('returns original content when prefix is empty', () => {
      const result = enrichChunk('Original content.', '');
      expect(result).toBe('Original content.');
    });
  });

  describe('enrichChunkFull', () => {
    it('returns complete enriched chunk', () => {
      const result = enrichChunkFull({
        documentTitle: 'Budget Plan',
        sectionHeader: 'Q4 Projections',
        chunkContent: 'We expect 10% growth.',
      });

      expect(result.content).toBe('We expect 10% growth.');
      expect(result.contextPrefix).toBe("This chunk from 'Budget Plan' discusses Q4 Projections. ");
      expect(result.enrichedContent).toBe(
        "This chunk from 'Budget Plan' discusses Q4 Projections. We expect 10% growth."
      );
    });

    it('handles missing metadata gracefully', () => {
      const result = enrichChunkFull({
        chunkContent: 'Plain chunk.',
      });

      expect(result.content).toBe('Plain chunk.');
      expect(result.contextPrefix).toBe('');
      expect(result.enrichedContent).toBe('Plain chunk.');
    });
  });

  describe('getEnrichedEmbeddingColumn', () => {
    it('returns COALESCE expression preferring enriched_embedding', () => {
      expect(getEnrichedEmbeddingColumn()).toBe('COALESCE(enriched_embedding, embedding)');
    });
  });
});
