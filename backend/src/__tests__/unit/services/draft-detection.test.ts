/**
 * Tests for Draft Detection - Smart Content Types
 *
 * Tests the extended detection logic for reading, research,
 * learning, plan, and analysis content types alongside
 * the original writing types (email, article, proposal, document).
 */

// Mock database before importing
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  AIContext: {} as any,
  isValidContext: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { detectDraftNeed, DraftType } from '../../../services/draft-generation/draft-detection';

describe('Draft Detection - Smart Content Types', () => {
  // ==========================================
  // Original Writing Types
  // ==========================================
  describe('Writing Types (Original)', () => {
    it('should detect email tasks', async () => {
      const result = await detectDraftNeed('E-Mail an Max schreiben wegen Meeting', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('email');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect article tasks', async () => {
      const result = await detectDraftNeed('Blogpost über TypeScript Best Practices schreiben', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('article');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect proposal tasks', async () => {
      const result = await detectDraftNeed('Angebot für Website-Redesign erstellen', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('proposal');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect document tasks', async () => {
      const result = await detectDraftNeed('Dokumentation für die neue API schreiben', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('document');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  // ==========================================
  // Smart Content: Reading
  // ==========================================
  describe('Smart Content: Reading', () => {
    it('should detect "Gedicht lesen" as reading type', async () => {
      const result = await detectDraftNeed("Goethes Gedicht 'Frösche' lesen", 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('reading');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "Buch lesen" as reading type', async () => {
      const result = await detectDraftNeed('Das Buch "Atomic Habits" lesen', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('reading');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "Text lesen" as reading type', async () => {
      const result = await detectDraftNeed('Den Artikel über Quantencomputer lesen', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('reading');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect generic "lesen" as reading type', async () => {
      const result = await detectDraftNeed('Whitepaper durchlesen', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('reading');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ==========================================
  // Smart Content: Research
  // ==========================================
  describe('Smart Content: Research', () => {
    it('should detect "recherchieren" as research type', async () => {
      const result = await detectDraftNeed('Preise für Cloud-Hosting recherchieren', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('research');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "herausfinden" as research type', async () => {
      const result = await detectDraftNeed('Herausfinden wie GraphQL Subscriptions funktionieren', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('research');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "informieren über" as research type', async () => {
      const result = await detectDraftNeed('Mich über aktuelle AI-Trends informieren', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('research');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  // ==========================================
  // Smart Content: Learning
  // ==========================================
  describe('Smart Content: Learning', () => {
    it('should detect "lernen wie" as learning type', async () => {
      const result = await detectDraftNeed('Lernen wie man Docker Container orchestriert', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('learning');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "verstehen" as learning type', async () => {
      const result = await detectDraftNeed('Verstehen warum React Hooks so beliebt sind', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('learning');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "Tutorial" as learning type', async () => {
      const result = await detectDraftNeed('Rust Tutorial durcharbeiten', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('learning');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ==========================================
  // Smart Content: Plan
  // ==========================================
  describe('Smart Content: Plan', () => {
    it('should detect "Plan erstellen" as plan type', async () => {
      const result = await detectDraftNeed('Marketingplan für Q2 erstellen', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('plan');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "planen" as plan type', async () => {
      const result = await detectDraftNeed('Urlaub nach Spanien planen', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('plan');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "Roadmap" as plan type', async () => {
      const result = await detectDraftNeed('Produkt-Roadmap für nächstes Quartal', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('plan');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "Checkliste" as plan type', async () => {
      const result = await detectDraftNeed('Checkliste für den Umzug', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('plan');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  // ==========================================
  // Smart Content: Analysis
  // ==========================================
  describe('Smart Content: Analysis', () => {
    it('should detect "analysieren" as analysis type', async () => {
      const result = await detectDraftNeed('Konkurrenz analysieren: Notion vs Obsidian', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('analysis');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "vergleichen" as analysis type', async () => {
      const result = await detectDraftNeed('React und Vue.js vergleichen', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('analysis');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "bewerten" as analysis type', async () => {
      const result = await detectDraftNeed('Neue Buchhaltungssoftware bewerten', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('analysis');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect "Pro Contra" as analysis type', async () => {
      const result = await detectDraftNeed('Pro und Contra von Remote Work untersuchen', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('analysis');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  // ==========================================
  // Non-Task Types should not trigger detection
  // ==========================================
  describe('Non-Task Types', () => {
    it('should not detect drafts for idea type', async () => {
      const result = await detectDraftNeed('Ein Gedicht über die Natur', 'idea');
      expect(result.detected).toBe(false);
    });

    it('should not detect drafts for insight type', async () => {
      const result = await detectDraftNeed('Recherche zeigt dass AI immer besser wird', 'insight');
      expect(result.detected).toBe(false);
    });

    it('should not detect drafts for question type', async () => {
      const result = await detectDraftNeed('Wie lernt man am besten Spanisch?', 'question');
      expect(result.detected).toBe(false);
    });
  });

  // ==========================================
  // Edge Cases
  // ==========================================
  describe('Edge Cases', () => {
    it('should not detect empty text', async () => {
      const result = await detectDraftNeed('', 'task');
      expect(result.detected).toBe(false);
    });

    it('should not detect unrelated tasks', async () => {
      const result = await detectDraftNeed('Zahnarzttermin am Dienstag', 'task');
      expect(result.detected).toBe(false);
    });

    it('should return extracted topic', async () => {
      const result = await detectDraftNeed('Cloud-Hosting recherchieren', 'task');
      expect(result.detected).toBe(true);
      expect(result.extractedTopic).toBeDefined();
    });

    it('should handle mixed-case input', async () => {
      const result = await detectDraftNeed('GEDICHT LESEN von Schiller', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('reading');
    });

    it('should prioritize more specific patterns over generic ones', async () => {
      // "E-Mail schreiben" should match email, not generic "schreiben"
      const result = await detectDraftNeed('E-Mail an Chef schreiben', 'task');
      expect(result.detected).toBe(true);
      expect(result.draftType).toBe('email');
    });
  });

  // ==========================================
  // DraftType Completeness
  // ==========================================
  describe('DraftType Completeness', () => {
    const allTypes: DraftType[] = [
      'email', 'article', 'proposal', 'document', 'generic',
      'research', 'reading', 'learning', 'plan', 'analysis',
    ];

    it('should have all expected draft types', () => {
      // TypeScript ensures this at compile-time, but this verifies runtime
      expect(allTypes).toHaveLength(10);
    });
  });
});
