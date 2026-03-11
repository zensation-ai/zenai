/**
 * Cross-Idea Synthesis Engine - Unit Tests
 */

import {
  synthesizeKnowledge,
  isSynthesisQuery,
} from '../../../services/synthesis-engine';

// Mock enhanced-rag
var mockRetrieve = jest.fn();
jest.mock('../../../services/enhanced-rag', () => ({
  enhancedRAG: {
    retrieve: (...args: unknown[]) => mockRetrieve(...args),
  },
}));

// Mock graph-memory-bridge
var mockExpandViaGraph = jest.fn();
jest.mock('../../../services/memory/graph-memory-bridge', () => ({
  expandViaGraph: (...args: unknown[]) => mockExpandViaGraph(...args),
}));

// Mock Claude client
var mockCreate = jest.fn();
jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: () => ({ messages: { create: mockCreate } }),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  executeWithProtection: (fn: () => unknown) => fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Synthesis Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRetrieve.mockReset();
    mockExpandViaGraph.mockReset();
    mockCreate.mockReset();
  });

  // ========================================
  // isSynthesisQuery
  // ========================================
  describe('isSynthesisQuery', () => {
    it('should detect German synthesis patterns', () => {
      expect(isSynthesisQuery('Fasse zusammen was ich über KI weiß')).toBe(true);
      expect(isSynthesisQuery('Was weiß ich alles über Marketing?')).toBe(true);
      expect(isSynthesisQuery('Überblick über alle meine Ideen zu ML')).toBe(true);
      expect(isSynthesisQuery('Synthese zu Produktivität')).toBe(true);
      expect(isSynthesisQuery('Verbinde alle meine Ideen zu Design')).toBe(true);
      expect(isSynthesisQuery('Gesamtbild über Machine Learning')).toBe(true);
    });

    it('should detect English synthesis patterns', () => {
      expect(isSynthesisQuery('Summarize all my ideas about AI')).toBe(true);
      expect(isSynthesisQuery('What do I know about marketing?')).toBe(true);
    });

    it('should not detect non-synthesis queries', () => {
      expect(isSynthesisQuery('Erstelle eine neue Idee')).toBe(false);
      expect(isSynthesisQuery('Hallo, wie geht es dir?')).toBe(false);
      expect(isSynthesisQuery('Suche nach KI Ideen')).toBe(false);
      expect(isSynthesisQuery('Berechne 2+2')).toBe(false);
    });
  });

  // ========================================
  // synthesizeKnowledge
  // ========================================
  describe('synthesizeKnowledge', () => {
    const mockRAGResult = (id: string, title: string, score: number) => ({
      id,
      title,
      summary: `Summary of ${title}`,
      content: `Content of ${title}`,
      score,
      scores: { agentic: score },
      sources: ['agentic' as const],
    });

    it('should synthesize knowledge from multiple ideas', async () => {
      // Mock query expansion (first Claude call)
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'KI Gesundheitswesen\nAI Healthcare\nMedizin-KI\nDigitale Diagnostik' }],
      });

      // Mock RAG retrieval for each query variant (original + 4 variants = 5 calls)
      const ideas = [
        mockRAGResult('id-1', 'KI in der Medizin', 0.9),
        mockRAGResult('id-2', 'AI Diagnostik', 0.85),
        mockRAGResult('id-3', 'Digitale Gesundheit', 0.7),
      ];
      mockRetrieve.mockResolvedValue({ results: ideas, confidence: 0.8, methodsUsed: ['agentic'], timing: { total: 100 } });

      // Mock graph expansion
      mockExpandViaGraph.mockResolvedValueOnce({
        contextParts: [{ content: 'KI in der Medizin baut auf Digitale Gesundheit auf', relevance: 0.8 }],
        serendipityHints: [],
        expansionCount: 1,
      });

      // Mock synthesis generation (second Claude call)
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: `## Synthese
Dein Wissen zu KI im Gesundheitswesen umfasst drei Kernbereiche [Idee: "KI in der Medizin"].

## Entwicklung
Die Ideen zeigen eine Entwicklung von allgemeiner Digitalisierung zu spezifischer KI-Anwendung.

## Widersprüche
Keine wesentlichen Widersprüche gefunden.

## Wissenslücken
- Ethische Aspekte der KI in der Medizin fehlen
- Regulatorische Rahmenbedingungen nicht abgedeckt` }],
      });

      const result = await synthesizeKnowledge('KI im Gesundheitswesen', 'personal');

      expect(result.synthesis).toContain('Synthese');
      expect(result.synthesis).toContain('KI in der Medizin');
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.queryVariants.length).toBeGreaterThanOrEqual(1);
      expect(result.timing.total).toBeGreaterThanOrEqual(0);
    });

    it('should return empty result when no ideas found', async () => {
      // Mock query expansion
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Variant 1\nVariant 2' }],
      });

      // Mock RAG returning empty
      mockRetrieve.mockResolvedValue({ results: [], confidence: 0, methodsUsed: [], timing: { total: 50 } });

      const result = await synthesizeKnowledge('Quantenphysik', 'personal');

      expect(result.sources).toHaveLength(0);
      expect(result.synthesis).toContain('keine relevanten Ideen');
      expect(result.gaps).toContain('Quantenphysik');
    });

    it('should handle query expansion failure gracefully', async () => {
      // Mock query expansion failing
      mockCreate.mockRejectedValueOnce(new Error('API error'));

      // Mock RAG with some results for original query
      mockRetrieve.mockResolvedValue({
        results: [mockRAGResult('id-1', 'Test Idea', 0.9)],
        confidence: 0.8,
        methodsUsed: ['agentic'],
        timing: { total: 100 },
      });

      // Mock graph expansion
      mockExpandViaGraph.mockResolvedValueOnce({
        contextParts: [],
        serendipityHints: [],
        expansionCount: 0,
      });

      // Mock synthesis generation
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '## Synthese\nTest synthesis output.\n\n## Wissenslücken\n- More data needed' }],
      });

      const result = await synthesizeKnowledge('Test topic', 'personal');

      // Should still work with just original query
      expect(result.queryVariants).toContain('Test topic');
      expect(result.sources.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle graph expansion failure gracefully', async () => {
      // Mock query expansion
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Variant' }],
      });

      mockRetrieve.mockResolvedValue({
        results: [mockRAGResult('id-1', 'Idea', 0.9)],
        confidence: 0.8,
        methodsUsed: ['agentic'],
        timing: { total: 100 },
      });

      // Graph expansion fails
      mockExpandViaGraph.mockRejectedValueOnce(new Error('Graph error'));

      // Synthesis still works
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '## Synthese\nResult without graph.\n\n## Wissenslücken\nNone' }],
      });

      const result = await synthesizeKnowledge('Topic', 'personal');

      expect(result.synthesis).toContain('Result without graph');
    });

    it('should deduplicate ideas across query variants', async () => {
      // Mock query expansion
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Variant 1' }],
      });

      // Both queries return the same idea
      const sameIdea = mockRAGResult('same-id', 'Same Idea', 0.9);
      mockRetrieve.mockResolvedValue({
        results: [sameIdea],
        confidence: 0.8,
        methodsUsed: ['agentic'],
        timing: { total: 100 },
      });

      mockExpandViaGraph.mockResolvedValueOnce({
        contextParts: [],
        serendipityHints: [],
        expansionCount: 0,
      });

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '## Synthese\nDeduplicated.\n\n## Wissenslücken\nNone' }],
      });

      const result = await synthesizeKnowledge('Topic', 'personal');

      // RRF should merge duplicate IDs, so only 1 unique source
      expect(result.sources.length).toBe(1);
    });

    it('should respect language option', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Variant' }],
      });

      mockRetrieve.mockResolvedValue({ results: [], confidence: 0, methodsUsed: [], timing: { total: 50 } });

      const result = await synthesizeKnowledge('AI topic', 'personal', { language: 'en' });

      expect(result.synthesis).toContain('No relevant ideas found');
    });
  });
});
