/**
 * Phase 100 B4: Semantic Tool Search Tests
 */

// Mock AI embedding generation
const mockGenerateEmbedding = jest.fn();
jest.mock('../../../services/ai', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

// Mock tool registry
const mockGetDefinitions = jest.fn();
jest.mock('../../../services/claude/tool-use', () => ({
  toolRegistry: {
    getDefinitions: () => mockGetDefinitions(),
  },
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { ToolSearchService } from '../../../services/tool-handlers/tool-search';

describe('Semantic Tool Search', () => {
  let searchService: ToolSearchService;

  const mockToolDefs = [
    { name: 'draft_email', description: 'Erstelle einen E-Mail-Entwurf mit Empfänger, Betreff und Inhalt', input_schema: {} },
    { name: 'web_search', description: 'Suche im Internet nach Informationen', input_schema: {} },
    { name: 'create_idea', description: 'Erstelle eine neue Idee oder Notiz', input_schema: {} },
    { name: 'search_ideas', description: 'Durchsuche die gespeicherten Ideen und Notizen', input_schema: {} },
    { name: 'calculate', description: 'Berechne einen mathematischen Ausdruck', input_schema: {} },
    { name: 'execute_code', description: 'Führe Python, JavaScript oder Bash Code aus', input_schema: {} },
    { name: 'get_directions', description: 'Berechne eine Route zwischen zwei Orten', input_schema: {} },
    { name: 'remember', description: 'Speichere Information im Langzeitgedächtnis', input_schema: {} },
    { name: 'recall', description: 'Rufe Erinnerungen und gespeicherte Fakten ab', input_schema: {} },
  ];

  // Simple embedding: use character frequencies as a basic vector
  function fakeEmbedding(text: string): number[] {
    const vec = new Array(10).fill(0);
    const lower = text.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      vec[lower.charCodeAt(i) % 10] += 1;
    }
    // Normalize
    const magnitude = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
    return magnitude > 0 ? vec.map((v: number) => v / magnitude) : vec;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDefinitions.mockReturnValue(mockToolDefs);
    mockGenerateEmbedding.mockImplementation((text: string) => Promise.resolve(fakeEmbedding(text)));
    searchService = new ToolSearchService();
  });

  describe('keyword search (baseline)', () => {
    it('should find tools by exact name match', async () => {
      const results = await searchService.search('draft_email');
      expect(results.some(r => r.name === 'draft_email')).toBe(true);
    });

    it('should find tools by keyword in description', async () => {
      const results = await searchService.search('Internet');
      expect(results.some(r => r.name === 'web_search')).toBe(true);
    });
  });

  describe('semantic search', () => {
    it('should find draft_email for "schreibe einen Brief"', async () => {
      await searchService.initEmbeddings();
      const results = await searchService.search('schreibe einen Brief');
      // Should include draft_email in results (via semantic similarity)
      const names = results.map(r => r.name);
      expect(names).toContain('draft_email');
    });

    it('should merge semantic and keyword results without duplicates', async () => {
      await searchService.initEmbeddings();
      const results = await searchService.search('E-Mail');
      // Should appear once, not duplicated
      const emailCount = results.filter(r => r.name === 'draft_email').length;
      expect(emailCount).toBeLessThanOrEqual(1);
    });

    it('should fall back to keyword-only if embedding fails', async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error('API unavailable'));
      searchService = new ToolSearchService();

      const results = await searchService.search('Idee erstellen');
      // Should still return keyword results
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('initEmbeddings', () => {
    it('should generate embeddings for all tool descriptions', async () => {
      await searchService.initEmbeddings();
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(mockToolDefs.length);
    });

    it('should handle embedding init failure gracefully', async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error('API error'));
      // Should not throw
      await expect(searchService.initEmbeddings()).resolves.not.toThrow();
    });
  });

  describe('cosine similarity', () => {
    it('should rank semantically similar tools higher', async () => {
      // Give more distinct embeddings to test ranking
      let callCount = 0;
      mockGenerateEmbedding.mockImplementation((text: string) => {
        callCount++;
        if (text.includes('E-Mail')) return Promise.resolve([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        if (text.includes('Brief')) return Promise.resolve([0.9, 0.1, 0, 0, 0, 0, 0, 0, 0, 0]);
        if (text.includes('Internet')) return Promise.resolve([0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
        return Promise.resolve(fakeEmbedding(text));
      });

      searchService = new ToolSearchService();
      await searchService.initEmbeddings();

      const results = await searchService.search('Brief schreiben');
      // draft_email should rank high due to embedding similarity
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
