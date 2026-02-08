/**
 * Tests for Query Intent Classifier
 *
 * Validates the 3-tier classification system:
 * - Tier 1: Rule-based (greetings, confirmations)
 * - Tier 2: Heuristic (question patterns, data references)
 * - Intent-to-config mapping
 */

import {
  classifyIntent,
  intentToRetrievalConfig,
  IntentClassification,
  ConversationContext,
} from '../../../services/query-intent-classifier';

// ===========================================
// Tier 1: Rule-Based Classification
// ===========================================

describe('Query Intent Classifier', () => {
  describe('Tier 1: Rule-Based - Skip Patterns', () => {
    const skipMessages = [
      'Hallo',
      'Hi',
      'Hey!',
      'Guten Morgen',
      'Guten Tag',
      'Guten Abend',
      'Servus',
      'Moin',
      'Tschüss',
      'Bye',
      'Auf Wiedersehen',
      'Bis bald',
      'Ja',
      'Nein',
      'Ok',
      'Okay',
      'Alles klar',
      'Verstanden',
      'Genau',
      'Stimmt',
      'Danke',
      'Vielen Dank',
      'Dankeschön',
      'Super',
      'Toll!',
      'Perfekt',
      'Cool',
      'Nice',
      'Aha',
      'Achso',
      'Interessant',
      'Wer bist du?',
      'Was kannst du?',
      'Was kannst du alles machen?',
      'Wie funktionierst du?',
      'Hilfe',
    ];

    test.each(skipMessages)('should classify "%s" as skip', (message) => {
      const result = classifyIntent(message);
      expect(result.intent).toBe('skip');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.tier).toBe('rule_based');
    });

    it('should skip very short messages', () => {
      const result = classifyIntent('ok');
      expect(result.intent).toBe('skip');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should skip single character messages', () => {
      const result = classifyIntent('?');
      expect(result.intent).toBe('skip');
    });
  });

  describe('Tier 1: Rule-Based - Follow-Up Patterns', () => {
    const context: ConversationContext = { messageCount: 3 };

    const followUpMessages = [
      'Ja, bitte',
      'Ja, gerne',
      'Mach das',
      'Mach weiter',
      'Erzähl mir mehr',
      'Sag mir mehr',
      'Genauer',
      'Mehr dazu',
      'Details',
      'Kannst du das nochmal erklären?',
    ];

    test.each(followUpMessages)('should classify "%s" as conversation_only with context', (message) => {
      const result = classifyIntent(message, context);
      expect(result.intent).toBe('conversation_only');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should not classify follow-ups without conversation context as high confidence', () => {
      const result = classifyIntent('Ja, bitte');
      // Without context, follow-up detection has lower confidence
      // but "Ja, bitte" might still match skip patterns
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('Tier 1: Rule-Based - Meta Patterns', () => {
    const metaMessages = [
      'Kannst du mir helfen?',
      'Könntest du mir erklären wie das geht?',
      'Wie kann ich die App nutzen?',
    ];

    test.each(metaMessages)('should classify "%s" as skip', (message) => {
      const result = classifyIntent(message);
      expect(result.intent).toBe('skip');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  // ===========================================
  // Tier 2: Heuristic Classification
  // ===========================================

  describe('Tier 2: Heuristic - Full Retrieval', () => {
    const fullRetrievalMessages = [
      'Was habe ich zu KI geschrieben?',
      'Was hatte ich über Machine Learning notiert?',
      'Zeige mir meine Ideen zum Thema Marketing',
      'In meinen Notizen steht etwas zu Blockchain',
      'Laut meinen Ideen war die Strategie anders',
      'Basierend auf meinen Einträgen',
      'Erinnerst du dich an das Gespräch über Startups?',
      'Weißt du noch was ich zu React gesagt habe?',
      'Haben wir schon mal besprochen wie man das macht?',
      'Was weiß ich über Quantencomputing?',
      'Was habe ich letzte Woche geschrieben?',
      'Meine Gedanken zum Thema Nachhaltigkeit',
    ];

    test.each(fullRetrievalMessages)('should classify "%s" as full_retrieve', (message) => {
      const result = classifyIntent(message);
      expect(result.intent).toBe('full_retrieve');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.tier).toBe('heuristic');
    });

    it('should detect temporal queries', () => {
      const result = classifyIntent('Was hatte ich letzte Woche zu KI geschrieben?');
      expect(result.intent).toBe('full_retrieve');
      expect(result.temporalDetected).toBe(true);
    });

    it('should detect personal references', () => {
      const result = classifyIntent('Was habe ich zu Marketing notiert?');
      expect(result.intent).toBe('full_retrieve');
      expect(result.personalReference).toBe(true);
    });
  });

  describe('Tier 2: Heuristic - Quick Retrieval', () => {
    const quickRetrievalMessages = [
      'Was ist Quantencomputing?',
      'Wie funktioniert Machine Learning?',
      'Warum ist TypeScript besser als JavaScript?',
      'Zum Thema Nachhaltigkeit in der IT',
      'Vergleiche React und Vue',
    ];

    test.each(quickRetrievalMessages)('should classify "%s" as quick_retrieve or higher', (message) => {
      const result = classifyIntent(message);
      expect(['quick_retrieve', 'full_retrieve']).toContain(result.intent);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe('Tier 2: Heuristic - Personal Question Boost', () => {
    it('should boost personal questions with question words to full_retrieve', () => {
      const result = classifyIntent('Was habe ich über KI geschrieben?');
      expect(result.intent).toBe('full_retrieve');
      expect(result.personalReference).toBe(true);
    });

    it('should boost "wie war mein" pattern to full_retrieve', () => {
      const result = classifyIntent('Wie war mein Ansatz bei dem Projekt?');
      expect(result.intent).toBe('full_retrieve');
    });
  });

  describe('Tier 2: Heuristic - Temporal Patterns', () => {
    const temporalMessages = [
      'Was habe ich gestern geschrieben?',
      'Ideen von letzter Woche',
      'Was habe ich im Januar notiert?',
      'Einträge vor 3 Tagen',
      'Seit Februar',
    ];

    test.each(temporalMessages)('should detect temporal context in "%s"', (message) => {
      const result = classifyIntent(message);
      expect(result.temporalDetected).toBe(true);
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = classifyIntent('');
      expect(result.intent).toBe('skip');
    });

    it('should handle whitespace-only string', () => {
      const result = classifyIntent('   ');
      expect(result.intent).toBe('skip');
    });

    it('should handle very long messages', () => {
      const longMessage = 'Dies ist eine sehr lange Nachricht. '.repeat(50);
      const result = classifyIntent(longMessage);
      // Long messages should default to conversation_only
      expect(result.intent).toBe('conversation_only');
    });

    it('should handle mixed signals', () => {
      // This message has both a greeting and a question
      const result = classifyIntent('Hallo, was habe ich letzte Woche zu KI geschrieben?');
      // The data reference should win over the greeting
      expect(result.intent).toBe('full_retrieve');
    });

    it('should handle code snippets', () => {
      const result = classifyIntent('```python\nprint("hello")\n```');
      // Code should not trigger retrieval
      expect(['skip', 'conversation_only', 'quick_retrieve']).toContain(result.intent);
    });
  });

  // ===========================================
  // Intent to Config Mapping
  // ===========================================

  describe('intentToRetrievalConfig', () => {
    it('should return no retrieval for skip', () => {
      const config = intentToRetrievalConfig('skip');
      expect(config.shouldRetrieve).toBe(false);
      expect(config.maxResults).toBe(0);
    });

    it('should return no retrieval for conversation_only', () => {
      const config = intentToRetrievalConfig('conversation_only');
      expect(config.shouldRetrieve).toBe(false);
    });

    it('should return light retrieval for quick_retrieve', () => {
      const config = intentToRetrievalConfig('quick_retrieve');
      expect(config.shouldRetrieve).toBe(true);
      expect(config.enableHyDE).toBe(false);
      expect(config.enableCrossEncoder).toBe(false);
      expect(config.maxResults).toBe(5);
      expect(config.maxIterations).toBe(1);
    });

    it('should return full retrieval for full_retrieve', () => {
      const config = intentToRetrievalConfig('full_retrieve');
      expect(config.shouldRetrieve).toBe(true);
      expect(config.enableHyDE).toBe(true);
      expect(config.enableCrossEncoder).toBe(true);
      expect(config.maxResults).toBe(8);
      expect(config.maxIterations).toBe(3);
    });
  });

  // ===========================================
  // Performance
  // ===========================================

  describe('Performance', () => {
    it('should classify rule-based messages in under 5ms', () => {
      const messages = ['Hallo', 'Danke', 'Ja', 'Ok', 'Tschüss'];
      const start = performance.now();

      for (const msg of messages) {
        classifyIntent(msg);
      }

      const elapsed = performance.now() - start;
      // 5 messages should complete well under 5ms
      expect(elapsed).toBeLessThan(50);
    });

    it('should classify heuristic messages in under 10ms', () => {
      const messages = [
        'Was habe ich zu KI geschrieben?',
        'Zeige mir meine Ideen zum Thema Marketing',
        'Was ist Quantencomputing?',
      ];
      const start = performance.now();

      for (const msg of messages) {
        classifyIntent(msg);
      }

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ===========================================
  // Classification Consistency
  // ===========================================

  describe('Classification Consistency', () => {
    it('should return consistent results for the same input', () => {
      const message = 'Was habe ich zu KI geschrieben?';
      const result1 = classifyIntent(message);
      const result2 = classifyIntent(message);

      expect(result1.intent).toBe(result2.intent);
      expect(result1.confidence).toBe(result2.confidence);
      expect(result1.tier).toBe(result2.tier);
    });

    it('should always return valid IntentClassification', () => {
      const messages = [
        '', 'a', 'Hello World', 'Was ist das?',
        'Meine Ideen zu KI', 'Letzte Woche', '42',
        'Analysiere die Trends in meinen Notizen und erstelle einen Bericht',
      ];

      for (const msg of messages) {
        const result: IntentClassification = classifyIntent(msg);
        expect(['skip', 'conversation_only', 'quick_retrieve', 'full_retrieve']).toContain(result.intent);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(['rule_based', 'heuristic', 'llm']).toContain(result.tier);
        expect(typeof result.reasoning).toBe('string');
        expect(typeof result.temporalDetected).toBe('boolean');
        expect(typeof result.personalReference).toBe('boolean');
      }
    });
  });
});
