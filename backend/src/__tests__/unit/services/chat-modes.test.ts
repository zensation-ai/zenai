/**
 * Unit Tests for Chat Mode Detection Service
 *
 * Tests intelligent mode detection for chat messages including:
 * - Tool-assisted mode detection
 * - Agent mode detection
 * - RAG-enhanced mode detection
 * - Simple conversation detection
 *
 * @module tests/services/chat-modes
 */

import {
  detectChatMode,
  shouldEnhanceWithRAG,
  getDefaultToolsForMode,
  isSimpleConversation,
  ChatMode,
  ModeDetectionResult,
  RAGDecision,
} from '../../../services/chat-modes';

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Chat Mode Detection Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // Mode Detection - Tool Assisted
  // ===========================================

  describe('detectChatMode - Tool Assisted', () => {
    describe('Search patterns', () => {
      it('should detect search_ideas for "suche nach meinen"', () => {
        const result = detectChatMode('Suche nach meinen Ideen zum Thema Marketing');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('search_ideas');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should detect search for "finde alle"', () => {
        const result = detectChatMode('Finde alle Notizen vom letzten Monat');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('search_ideas');
      });

      it('should detect search for "zeig mir meine"', () => {
        const result = detectChatMode('Zeig mir meine Ideen');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('search_ideas');
      });

      it('should detect search for "wie viele ideen"', () => {
        const result = detectChatMode('Wie viele Ideen habe ich zum Thema KI?');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('search_ideas');
      });
    });

    describe('Create patterns', () => {
      it('should detect create_idea for "erstelle eine neue idee"', () => {
        const result = detectChatMode('Erstelle eine neue Idee: App für Fitness-Tracking');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('create_idea');
      });

      it('should detect create for "speichere das"', () => {
        const result = detectChatMode('Speichere das als neue Idee');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('create_idea');
      });

      it('should detect create for "notiere dir"', () => {
        const result = detectChatMode('Notiere dir: Meeting am Freitag um 10 Uhr');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('create_idea');
      });

      it('should detect create for "leg eine neue idee an"', () => {
        const result = detectChatMode('Leg eine neue Idee an zum Thema Automatisierung');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('create_idea');
      });
    });

    describe('Remember/Recall patterns', () => {
      it('should detect remember for "merk dir"', () => {
        const result = detectChatMode('Merk dir, dass ich morgen einen Termin habe');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('remember');
      });

      it('should detect recall for "erinnerst du dich"', () => {
        const result = detectChatMode('Erinnerst du dich an unser Gespräch über das Projekt?');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('recall');
      });

      it('should detect remember for "vergiss nicht"', () => {
        const result = detectChatMode('Vergiss nicht: API Key erneuern');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('remember');
      });

      it('should detect recall for "was hatte ich dir gesagt"', () => {
        const result = detectChatMode('Was hatte ich dir gesagt über den Kunden?');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('recall');
      });
    });

    describe('Calculate patterns', () => {
      it('should detect calculate for "berechne"', () => {
        const result = detectChatMode('Berechne mir die Kosten für das Projekt');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('calculate');
      });

      it('should detect calculate for "rechne zusammen"', () => {
        const result = detectChatMode('Rechne alle Ausgaben zusammen');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('calculate');
      });

      it('should detect calculate for math expressions', () => {
        const result = detectChatMode('Was ist 15 + 27 * 3?');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('calculate');
      });

      it('should detect calculate for "wie viel ist"', () => {
        const result = detectChatMode('Wie viel ist 20% von 500?');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('calculate');
      });
    });

    describe('Related ideas patterns', () => {
      it('should detect get_related_ideas for "verwandte ideen"', () => {
        const result = detectChatMode('Zeig mir verwandte Ideen zum Thema Machine Learning');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('get_related_ideas');
      });

      it('should detect related for "ähnliche notizen"', () => {
        const result = detectChatMode('Gibt es ähnliche Notizen?');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('get_related_ideas');
      });

      it('should detect related for "was hängt zusammen"', () => {
        const result = detectChatMode('Was hängt damit zusammen?');

        expect(result.mode).toBe('tool_assisted');
        expect(result.suggestedTools).toContain('get_related_ideas');
      });
    });
  });

  // ===========================================
  // Mode Detection - Agent Mode
  // ===========================================

  describe('detectChatMode - Agent Mode', () => {
    it('should detect agent mode for complex multi-step tasks', () => {
      const result = detectChatMode(
        'Analysiere alle meine Projektnotizen und erstelle dann einen Bericht'
      );

      expect(result.mode).toBe('agent');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should detect agent mode for comparison requests', () => {
      const result = detectChatMode(
        'Vergleiche meine Q1 Ergebnisse mit Q2 und identifiziere Trends'
      );

      expect(result.mode).toBe('agent');
    });

    it('should detect agent mode for overview requests', () => {
      const result = detectChatMode(
        'Gib mir einen Überblick über alle meine Projekte'
      );

      expect(result.mode).toBe('agent');
    });

    it('should detect agent mode for synthesis requests', () => {
      const result = detectChatMode(
        'Fasse alle meine Notizen zum Thema KI zusammen und identifiziere Muster'
      );

      expect(result.mode).toBe('agent');
    });

    it('should detect agent mode for strategy development', () => {
      const result = detectChatMode(
        'Entwickle eine Strategie basierend auf meinen bisherigen Erkenntnissen'
      );

      expect(result.mode).toBe('agent');
    });

    it('should detect agent mode for report creation', () => {
      const result = detectChatMode(
        'Erstelle einen Bericht über die Kundenentwicklung'
      );

      expect(result.mode).toBe('agent');
    });
  });

  // ===========================================
  // Mode Detection - RAG Enhanced
  // ===========================================

  describe('detectChatMode - RAG Enhanced', () => {
    it('should detect RAG for explicit knowledge references', () => {
      const result = detectChatMode(
        'Was habe ich zu dem Thema Machine Learning notiert?'
      );

      expect(result.mode).toBe('rag_enhanced');
    });

    it('should detect RAG for "laut meinen notizen"', () => {
      const result = detectChatMode(
        'Laut meinen Notizen, was waren die Hauptpunkte?'
      );

      expect(result.mode).toBe('rag_enhanced');
    });

    it('should detect RAG for "basierend auf meinen"', () => {
      const result = detectChatMode(
        'Basierend auf meinen Ideen, was empfiehlst du?'
      );

      expect(result.mode).toBe('rag_enhanced');
    });

    it('should detect RAG for memory recall references', () => {
      const result = detectChatMode(
        'Weißt du noch, was wir über das Budget besprochen haben?'
      );

      expect(result.mode).toBe('rag_enhanced');
    });
  });

  // ===========================================
  // Mode Detection - Conversation
  // ===========================================

  describe('detectChatMode - Conversation', () => {
    it('should detect conversation for general questions', () => {
      const result = detectChatMode('Was ist der Unterschied zwischen React und Vue?');

      expect(result.mode).toBe('conversation');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect conversation for explanations', () => {
      const result = detectChatMode('Erkläre mir bitte Dependency Injection');

      expect(result.mode).toBe('conversation');
    });

    it('should detect conversation for opinion questions', () => {
      const result = detectChatMode('Was denkst du über TypeScript?');

      expect(result.mode).toBe('conversation');
    });

    it('should detect conversation for help requests', () => {
      const result = detectChatMode('Kannst du mir bei meinem Code helfen?');

      expect(result.mode).toBe('conversation');
    });
  });

  // ===========================================
  // shouldEnhanceWithRAG Tests
  // ===========================================

  describe('shouldEnhanceWithRAG', () => {
    it('should return true for rag_enhanced mode', () => {
      const result = shouldEnhanceWithRAG('any message', 'rag_enhanced');

      expect(result.shouldUse).toBe(true);
      expect(result.urgency).toBe('required');
    });

    it('should return true for personal knowledge questions', () => {
      const result = shouldEnhanceWithRAG(
        'Was weiß ich über Projektmanagement?',
        'conversation'
      );

      expect(result.shouldUse).toBe(true);
    });

    it('should return true for "mein/ich/wir" + question pattern', () => {
      const result = shouldEnhanceWithRAG(
        'Wie habe ich das Problem letztes Mal gelöst?',
        'conversation'
      );

      expect(result.shouldUse).toBe(true);
    });

    it('should return false for general questions', () => {
      const result = shouldEnhanceWithRAG(
        'Was ist die Hauptstadt von Frankreich?',
        'conversation'
      );

      expect(result.shouldUse).toBe(false);
    });

    it('should return urgency based on pattern', () => {
      const requiredResult = shouldEnhanceWithRAG(
        'Was habe ich zu dem Thema notiert?',
        'conversation'
      );
      expect(requiredResult.urgency).toBe('required');

      const recommendedResult = shouldEnhanceWithRAG(
        'Wie bei meiner letzten Analyse?',
        'conversation'
      );
      expect(recommendedResult.urgency).toBe('recommended');
    });
  });

  // ===========================================
  // getDefaultToolsForMode Tests
  // ===========================================

  describe('getDefaultToolsForMode', () => {
    it('should return tools for tool_assisted mode', () => {
      const tools = getDefaultToolsForMode('tool_assisted');

      expect(tools).toContain('search_ideas');
      expect(tools).toContain('create_idea');
      expect(tools).toContain('calculate');
      expect(tools).toContain('remember');
      expect(tools).toContain('recall');
    });

    it('should return extended tools for agent mode', () => {
      const tools = getDefaultToolsForMode('agent');

      expect(tools).toContain('search_ideas');
      expect(tools).toContain('create_idea');
      expect(tools).toContain('get_related_ideas');
      expect(tools).toContain('calculate');
      expect(tools).toContain('remember');
      expect(tools).toContain('recall');
    });

    it('should return limited tools for rag_enhanced mode', () => {
      const tools = getDefaultToolsForMode('rag_enhanced');

      expect(tools).toContain('search_ideas');
      expect(tools).toContain('recall');
      expect(tools.length).toBeLessThan(getDefaultToolsForMode('agent').length);
    });

    it('should return empty array for conversation mode', () => {
      const tools = getDefaultToolsForMode('conversation');

      expect(tools).toEqual([]);
    });
  });

  // ===========================================
  // isSimpleConversation Tests
  // ===========================================

  describe('isSimpleConversation', () => {
    describe('Greetings', () => {
      it('should detect "hallo" as simple conversation', () => {
        expect(isSimpleConversation('Hallo')).toBe(true);
        expect(isSimpleConversation('hallo!')).toBe(true);
      });

      it('should detect "hi" variations', () => {
        expect(isSimpleConversation('Hi')).toBe(true);
        expect(isSimpleConversation('hey')).toBe(true);
      });

      it('should detect time-based greetings', () => {
        expect(isSimpleConversation('Guten Morgen')).toBe(true);
        expect(isSimpleConversation('Guten Tag')).toBe(true);
        expect(isSimpleConversation('Guten Abend')).toBe(true);
      });

      it('should detect regional greetings', () => {
        expect(isSimpleConversation('Servus')).toBe(true);
        expect(isSimpleConversation('Moin')).toBe(true);
      });
    });

    describe('Thanks', () => {
      it('should detect "danke" as simple conversation', () => {
        expect(isSimpleConversation('Danke')).toBe(true);
        expect(isSimpleConversation('Vielen Dank')).toBe(true);
      });

      it('should detect English thanks', () => {
        expect(isSimpleConversation('thx')).toBe(true);
        expect(isSimpleConversation('thanks')).toBe(true);
      });
    });

    describe('Acknowledgments', () => {
      it('should detect simple acknowledgments', () => {
        expect(isSimpleConversation('Ja')).toBe(true);
        expect(isSimpleConversation('Nein')).toBe(true);
        expect(isSimpleConversation('Ok')).toBe(true);
        expect(isSimpleConversation('Okay')).toBe(true);
        expect(isSimpleConversation('Alles klar')).toBe(true);
        expect(isSimpleConversation('Verstanden')).toBe(true);
      });
    });

    describe('Farewells', () => {
      it('should detect goodbyes', () => {
        expect(isSimpleConversation('Tschüss')).toBe(true);
        expect(isSimpleConversation('Bye')).toBe(true);
        expect(isSimpleConversation('Auf Wiedersehen')).toBe(true);
        expect(isSimpleConversation('Bis bald')).toBe(true);
        expect(isSimpleConversation('Bis später')).toBe(true);
        expect(isSimpleConversation('Bis dann')).toBe(true);
      });
    });

    describe('Small talk', () => {
      it('should detect "wie gehts"', () => {
        expect(isSimpleConversation('Wie geht es dir?')).toBe(true);
        expect(isSimpleConversation("Wie geht's?")).toBe(true);
      });
    });

    describe('Non-simple messages', () => {
      it('should not detect complex messages as simple', () => {
        expect(isSimpleConversation('Hallo, kannst du mir helfen?')).toBe(false);
        expect(isSimpleConversation('Suche nach meinen Ideen')).toBe(false);
        expect(isSimpleConversation('Was ist TypeScript?')).toBe(false);
      });
    });
  });

  // ===========================================
  // Confidence and Reasoning Tests
  // ===========================================

  describe('Detection Result Quality', () => {
    it('should always return confidence between 0 and 1', () => {
      const testMessages = [
        'Hallo',
        'Suche nach meinen Ideen',
        'Analysiere und fasse zusammen',
        'Was habe ich notiert?',
        'Was ist TypeScript?',
      ];

      testMessages.forEach(msg => {
        const result = detectChatMode(msg);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should always provide reasoning', () => {
      const testMessages = [
        'Hallo',
        'Suche nach meinen Ideen',
        'Analysiere und fasse zusammen',
      ];

      testMessages.forEach(msg => {
        const result = detectChatMode(msg);
        expect(result.reasoning).toBeDefined();
        expect(result.reasoning.length).toBeGreaterThan(0);
      });
    });

    it('should track matched patterns for tool mode', () => {
      const result = detectChatMode('Suche nach meinen Ideen zum Thema KI');

      expect(result.matchedPatterns).toBeDefined();
      expect(result.matchedPatterns!.length).toBeGreaterThan(0);
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = detectChatMode('');

      expect(result.mode).toBe('conversation');
    });

    it('should handle very long messages', () => {
      const longMessage = 'Suche nach meinen ' + 'Ideen '.repeat(100);
      const result = detectChatMode(longMessage);

      expect(result).toBeDefined();
      expect(result.mode).toBe('tool_assisted');
    });

    it('should handle special characters', () => {
      const result = detectChatMode('Suche nach $$$ & === !!!');

      expect(result).toBeDefined();
    });

    it('should be case-insensitive', () => {
      const lower = detectChatMode('suche nach meinen ideen');
      const upper = detectChatMode('SUCHE NACH MEINEN IDEEN');
      const mixed = detectChatMode('SuChE NaCh MeInEn IdEeN');

      expect(lower.mode).toBe(upper.mode);
      expect(upper.mode).toBe(mixed.mode);
    });

    it('should handle punctuation variations', () => {
      const withPunct = detectChatMode('Suche nach meinen Ideen!');
      const withoutPunct = detectChatMode('Suche nach meinen Ideen');

      expect(withPunct.mode).toBe(withoutPunct.mode);
    });
  });
});
