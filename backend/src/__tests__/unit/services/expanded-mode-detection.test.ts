/**
 * Phase 100 B5: Expanded Mode Detection Tests
 */

import { detectChatMode } from '../../../services/chat-modes';

describe('Expanded Mode Detection', () => {
  describe('German tool triggers', () => {
    it('should detect "schreibe eine E-Mail" as tool_assisted', () => {
      const result = detectChatMode('schreibe eine E-Mail an meinen Chef');
      expect(result.mode).toBe('tool_assisted');
    });

    it('should detect "erstelle einen Termin" as tool_assisted', () => {
      const result = detectChatMode('erstelle einen Termin für morgen');
      expect(result.mode).toBe('tool_assisted');
    });

    it('should detect "berechne die Summe" as tool_assisted', () => {
      const result = detectChatMode('berechne die Summe von 42 und 58');
      expect(result.mode).toBe('tool_assisted');
    });

    it('should detect "suche im Internet" as tool_assisted', () => {
      const result = detectChatMode('suche im Internet nach React Hooks');
      expect(result.mode).toBe('tool_assisted');
    });

    it('should detect "übersetze diesen Text" as tool_assisted', () => {
      const result = detectChatMode('übersetze diesen Text ins Englische');
      expect(result.mode).toBe('tool_assisted');
    });

    it('should detect "generiere einen Code" as tool_assisted', () => {
      const result = detectChatMode('generiere einen Python Code für Fibonacci');
      expect(result.mode).toBe('tool_assisted');
    });

    it('should detect "konvertiere das Format" as tool_assisted', () => {
      const result = detectChatMode('konvertiere das CSV in JSON');
      expect(result.mode).toBe('tool_assisted');
    });

    it('should detect "formatiere den Text" as tool_assisted', () => {
      const result = detectChatMode('formatiere den Text als Markdown');
      expect(result.mode).toBe('tool_assisted');
    });
  });

  describe('German agent triggers', () => {
    it('should detect "recherchiere ausführlich" as agent mode', () => {
      const result = detectChatMode('recherchiere ausführlich über künstliche Intelligenz und erstelle einen Bericht');
      expect(result.mode).toBe('agent');
    });

    it('should detect "analysiere im Detail" as agent mode', () => {
      const result = detectChatMode('analysiere im Detail die Performance der letzten Monate und gib Empfehlungen');
      expect(result.mode).toBe('agent');
    });

    it('should detect "vergleiche ... und bewerte" as agent mode', () => {
      const result = detectChatMode('vergleiche React und Vue und bewerte die Vor- und Nachteile');
      expect(result.mode).toBe('agent');
    });

    it('should detect "erstelle einen Bericht" as agent mode', () => {
      const result = detectChatMode('erstelle einen umfassenden Bericht über den aktuellen Stand der KI-Forschung');
      expect(result.mode).toBe('agent');
    });
  });

  describe('German RAG triggers', () => {
    it('should detect "was weißt du über" as RAG', () => {
      const result = detectChatMode('was weißt du über meine Projekte?');
      expect(result.mode).toBe('rag_enhanced');
    });

    it('should detect "erinnere dich an" as tool or RAG (recall tool)', () => {
      const result = detectChatMode('erinnere dich an unser letztes Gespräch über Python');
      // "erinnere dich" matches both recall tool and RAG pattern
      // tool_assisted is valid since it maps to the recall tool
      expect(['tool_assisted', 'rag_enhanced']).toContain(result.mode);
    });

    it('should detect "laut meinen Notizen" as RAG', () => {
      const result = detectChatMode('was steht laut meinen Notizen zum Thema Architektur?');
      expect(result.mode).toBe('rag_enhanced');
    });

    it('should detect "in meinen Notizen" as RAG', () => {
      const result = detectChatMode('was habe ich in meinen Notizen zum Thema vermerkt?');
      expect(result.mode).toBe('rag_enhanced');
    });

    it('should detect "habe ich erwähnt" as RAG', () => {
      const result = detectChatMode('habe ich schon mal erwähnt dass ich Python lerne?');
      expect(result.mode).toBe('rag_enhanced');
    });
  });

  describe('conversation mode (no false positives)', () => {
    it('should keep simple greetings as conversation', () => {
      const result = detectChatMode('Hallo, wie geht es dir?');
      expect(result.mode).toBe('conversation');
    });

    it('should keep opinions as conversation', () => {
      const result = detectChatMode('Was denkst du über das Wetter?');
      expect(result.mode).toBe('conversation');
    });
  });
});
