/**
 * Query Analyzer - Unit Tests (Phase 127, Task 1)
 * Tests run BEFORE implementation (TDD).
 */

import { analyzeQuery, QueryAnalysis } from '../../../../services/reasoning/query-analyzer';

describe('QueryAnalyzer', () => {
  // ─── Intent Detection ────────────────────────────────────────────────────

  describe('intent: question', () => {
    test('detects German interrogative start (was)', () => {
      const result = analyzeQuery('Was ist die beste Programmiersprache?');
      expect(result.intent).toBe('question');
    });

    test('detects German interrogative start (wie)', () => {
      const result = analyzeQuery('Wie funktioniert das genau?');
      expect(result.intent).toBe('question');
    });

    test('detects German interrogative start (warum)', () => {
      const result = analyzeQuery('Warum schlägt der Build fehl?');
      expect(result.intent).toBe('question');
    });

    test('detects English interrogative start (what)', () => {
      const result = analyzeQuery('What is the best approach here?');
      expect(result.intent).toBe('question');
    });

    test('detects English interrogative start (how)', () => {
      const result = analyzeQuery('How can I fix this error?');
      expect(result.intent).toBe('question');
    });

    test('detects English interrogative start (can)', () => {
      const result = analyzeQuery('Can you explain this concept?');
      expect(result.intent).toBe('question');
    });

    test('detects question mark at end', () => {
      const result = analyzeQuery('Das klappt nicht so richtig?');
      expect(result.intent).toBe('question');
    });

    test('detects "which" interrogative', () => {
      const result = analyzeQuery('Which framework should I use?');
      expect(result.intent).toBe('question');
    });
  });

  describe('intent: task', () => {
    test('detects German task verb (erstelle)', () => {
      const result = analyzeQuery('Erstelle mir eine Zusammenfassung');
      expect(result.intent).toBe('task');
    });

    test('detects German task verb (schreibe)', () => {
      const result = analyzeQuery('Schreibe einen kurzen Bericht über das Projekt');
      expect(result.intent).toBe('task');
    });

    test('detects English task verb (create)', () => {
      const result = analyzeQuery('Create a new React component for the dashboard');
      expect(result.intent).toBe('task');
    });

    test('detects English task verb (build)', () => {
      const result = analyzeQuery('Build me a simple REST API endpoint');
      expect(result.intent).toBe('task');
    });

    test('detects English task verb (generate)', () => {
      const result = analyzeQuery('Generate a list of 10 ideas for the project');
      expect(result.intent).toBe('task');
    });

    test('detects English task verb (send)', () => {
      const result = analyzeQuery('Send an email to the team about the deadline');
      expect(result.intent).toBe('task');
    });
  });

  describe('intent: creative', () => {
    test('detects brainstorm keyword', () => {
      const result = analyzeQuery('Brainstorm ideas for our new product launch');
      expect(result.intent).toBe('creative');
    });

    test('detects German creative keyword (idee)', () => {
      const result = analyzeQuery('Ich brauche eine kreative Idee für das Projekt');
      expect(result.intent).toBe('creative');
    });

    test('detects English creative keyword (story)', () => {
      const result = analyzeQuery('Write me a short story about a developer');
      // task wins here but story should still surface creative; test intent order
      // "write" is a task verb, but story is creative — task takes priority here
      expect(['task', 'creative']).toContain(result.intent);
    });

    test('detects German creative keyword (gedicht)', () => {
      const result = analyzeQuery('Schreib mir ein Gedicht über den Herbst');
      expect(result.intent).toBe('creative');
    });
  });

  describe('intent: recall', () => {
    test('detects German recall keyword (erinnerst)', () => {
      const result = analyzeQuery('Erinnerst du dich an unsere letzte Unterhaltung?');
      expect(result.intent).toBe('recall');
    });

    test('detects German recall keyword (vorhin)', () => {
      const result = analyzeQuery('Was haben wir vorhin besprochen?');
      expect(result.intent).toBe('recall');
    });

    test('detects English recall keyword (remember)', () => {
      const result = analyzeQuery('Do you remember what I said last time?');
      expect(result.intent).toBe('recall');
    });

    test('detects English recall phrase (earlier)', () => {
      const result = analyzeQuery('What was the conclusion from earlier?');
      expect(result.intent).toBe('recall');
    });
  });

  describe('intent: discussion (fallback)', () => {
    test('defaults to discussion for neutral statement', () => {
      const result = analyzeQuery('Das ist ein interessantes Konzept');
      expect(result.intent).toBe('discussion');
    });

    test('defaults to discussion for plain text', () => {
      const result = analyzeQuery('Machine learning is fascinating');
      expect(result.intent).toBe('discussion');
    });
  });

  // ─── Domain Detection ─────────────────────────────────────────────────────

  describe('domain detection', () => {
    test('detects finance domain (DE: budget)', () => {
      const result = analyzeQuery('Wie hoch ist mein Budget für diesen Monat?');
      expect(result.domain).toBe('finance');
    });

    test('detects finance domain (EN: invoice)', () => {
      const result = analyzeQuery('Can you help me with this invoice?');
      expect(result.domain).toBe('finance');
    });

    test('detects code domain (DE: code)', () => {
      const result = analyzeQuery('Ich habe einen Bug in meinem TypeScript Code');
      expect(result.domain).toBe('code');
    });

    test('detects code domain (EN: function)', () => {
      const result = analyzeQuery('Write a function that filters even numbers');
      expect(result.domain).toBe('code');
    });

    test('detects code domain (EN: deploy)', () => {
      const result = analyzeQuery('How do I deploy this React app?');
      expect(result.domain).toBe('code');
    });

    test('detects email domain (EN: email)', () => {
      const result = analyzeQuery('Help me write an email to my client');
      expect(result.domain).toBe('email');
    });

    test('detects email domain (DE: nachricht)', () => {
      const result = analyzeQuery('Schreibe eine Nachricht an das Team');
      expect(result.domain).toBe('email');
    });

    test('detects learning domain (EN: explain)', () => {
      const result = analyzeQuery('Explain how neural networks work');
      expect(result.domain).toBe('learning');
    });

    test('detects learning domain (DE: erkläre)', () => {
      const result = analyzeQuery('Erkläre mir das Konzept von Dependency Injection');
      expect(result.domain).toBe('learning');
    });

    test('detects personal domain (DE: mein)', () => {
      const result = analyzeQuery('Mein Urlaub nächsten Monat steht an');
      expect(result.domain).toBe('personal');
    });

    test('detects personal domain (EN: family)', () => {
      const result = analyzeQuery('I need to plan a birthday party for my family');
      expect(result.domain).toBe('personal');
    });

    test('defaults to general domain', () => {
      const result = analyzeQuery('Tell me something interesting');
      expect(result.domain).toBe('general');
    });
  });

  // ─── Complexity ───────────────────────────────────────────────────────────

  describe('complexity heuristic', () => {
    test('short simple query has low complexity', () => {
      const result = analyzeQuery('Hello');
      expect(result.complexity).toBeLessThan(0.3);
    });

    test('long query (>30 words) increases complexity', () => {
      const longQuery =
        'Kannst du mir eine detaillierte Erklärung geben wie man in TypeScript eine skalierbare ' +
        'API baut die auch mit großen Datenmengen zuverlässig umgehen kann und dabei alle ' +
        'best practices befolgt ohne die Performance zu vernachlässigen?';
      const result = analyzeQuery(longQuery);
      expect(result.complexity).toBeGreaterThan(0.4);
    });

    test('query with conjunction increases complexity', () => {
      const result = analyzeQuery('Erkläre mir das Konzept und gib mir ein Beispiel');
      expect(result.complexity).toBeGreaterThanOrEqual(0.2);
    });

    test('query with numbers increases complexity', () => {
      const result = analyzeQuery('Calculate 42 times 100 plus 15');
      expect(result.complexity).toBeGreaterThan(0);
    });

    test('query with comparison words increases complexity', () => {
      const result = analyzeQuery('Vergleich die beiden Ansätze und erkläre den Unterschied');
      expect(result.complexity).toBeGreaterThanOrEqual(0.2);
    });

    test('complexity never exceeds 1.0', () => {
      const complexQuery =
        'Vergleiche und analysiere 42 verschiedene Machine-Learning-Algorithmen und erkläre ' +
        'aber auch die Unterschiede zwischen supervised und unsupervised Learning weil ich ' +
        'verstehen möchte welcher Ansatz besser ist oder ob es Situationen gibt wo man beide ' +
        'kombinieren sollte und dabei auf die Performance achten muss';
      const result = analyzeQuery(complexQuery);
      expect(result.complexity).toBeLessThanOrEqual(1.0);
    });
  });

  // ─── Temporal References ──────────────────────────────────────────────────

  describe('temporal references', () => {
    test('detects past reference (DE: gestern)', () => {
      const result = analyzeQuery('Gestern hatte ich ein Problem mit dem Server');
      expect(result.temporalReference).toBe('past');
    });

    test('detects past reference (EN: yesterday)', () => {
      const result = analyzeQuery('Yesterday the deployment failed');
      expect(result.temporalReference).toBe('past');
    });

    test('detects past reference (EN: ago)', () => {
      const result = analyzeQuery('I set this up two weeks ago');
      expect(result.temporalReference).toBe('past');
    });

    test('detects future reference (DE: morgen)', () => {
      const result = analyzeQuery('Morgen muss ich einen Bericht abgeben');
      expect(result.temporalReference).toBe('future');
    });

    test('detects future reference (EN: next week)', () => {
      const result = analyzeQuery('Next week we have a product review');
      expect(result.temporalReference).toBe('future');
    });

    test('detects present reference (DE: jetzt)', () => {
      const result = analyzeQuery('Ich arbeite jetzt an dem Feature');
      expect(result.temporalReference).toBe('present');
    });

    test('detects present reference (EN: currently)', () => {
      const result = analyzeQuery('I am currently debugging this issue');
      expect(result.temporalReference).toBe('present');
    });

    test('returns null when no temporal reference', () => {
      const result = analyzeQuery('Was ist die beste Programmiersprache?');
      expect(result.temporalReference).toBeNull();
    });
  });

  // ─── Entity Extraction ────────────────────────────────────────────────────

  describe('entity extraction', () => {
    test('extracts capitalized words not at sentence start', () => {
      const result = analyzeQuery('Ich arbeite bei Google und nutze TypeScript täglich');
      expect(result.entityMentions).toContain('Google');
      expect(result.entityMentions).toContain('TypeScript');
    });

    test('extracts quoted strings', () => {
      const result = analyzeQuery('Ich suche nach "ProjectAlpha" in der Datenbank');
      expect(result.entityMentions).toContain('ProjectAlpha');
    });

    test('does not include common German articles as entities', () => {
      const result = analyzeQuery('Die neue Version von React ist toll');
      // "Die" should be excluded (common word), "React" should be included
      expect(result.entityMentions).not.toContain('Die');
      expect(result.entityMentions).toContain('React');
    });

    test('extracts words after @ symbol', () => {
      const result = analyzeQuery('Schick das an @team und @support');
      expect(result.entityMentions).toContain('@team');
      expect(result.entityMentions).toContain('@support');
    });

    test('extracts words after # symbol', () => {
      const result = analyzeQuery('Erstelle ein Issue mit dem Label #bug');
      expect(result.entityMentions).toContain('#bug');
    });

    test('returns empty array when no entities found', () => {
      const result = analyzeQuery('was ist das?');
      expect(result.entityMentions).toEqual([]);
    });
  });

  // ─── Follow-up Detection ──────────────────────────────────────────────────

  describe('follow-up detection', () => {
    test('detects follow-up starting with "das"', () => {
      const result = analyzeQuery('Das klingt interessant, sag mir mehr');
      expect(result.isFollowUp).toBe(true);
    });

    test('detects follow-up starting with "es"', () => {
      const result = analyzeQuery('Es hat nicht funktioniert');
      expect(result.isFollowUp).toBe(true);
    });

    test('detects follow-up starting with "davon"', () => {
      const result = analyzeQuery('Davon wollte ich noch mehr hören');
      expect(result.isFollowUp).toBe(true);
    });

    test('detects follow-up starting with English "this"', () => {
      const result = analyzeQuery('This is exactly what I needed');
      expect(result.isFollowUp).toBe(true);
    });

    test('detects follow-up starting with conjunction "und"', () => {
      const result = analyzeQuery('Und wie sieht das mit den Kosten aus?');
      expect(result.isFollowUp).toBe(true);
    });

    test('detects follow-up starting with "aber"', () => {
      const result = analyzeQuery('Aber was ist wenn es mehrere Optionen gibt?');
      expect(result.isFollowUp).toBe(true);
    });

    test('detects follow-up starting with English "but"', () => {
      const result = analyzeQuery('But what about the edge cases?');
      expect(result.isFollowUp).toBe(true);
    });

    test('does not mark regular question as follow-up', () => {
      const result = analyzeQuery('Wie installiere ich Node.js?');
      expect(result.isFollowUp).toBe(false);
    });

    test('does not mark task starting with verb as follow-up', () => {
      const result = analyzeQuery('Erstelle eine Liste der wichtigsten Features');
      expect(result.isFollowUp).toBe(false);
    });
  });

  // ─── Expected Output Type ─────────────────────────────────────────────────

  describe('expected output type', () => {
    test('returns code for code domain queries', () => {
      const result = analyzeQuery('Write a TypeScript function to parse JSON');
      expect(result.expectedOutputType).toBe('code');
    });

    test('returns document for document/report queries', () => {
      const result = analyzeQuery('Erstelle einen ausführlichen Bericht über die Performance');
      expect(result.expectedOutputType).toBe('document');
    });

    test('returns list when query mentions liste', () => {
      const result = analyzeQuery('Gib mir eine Liste der wichtigsten Punkte');
      expect(result.expectedOutputType).toBe('list');
    });

    test('returns list when query mentions steps', () => {
      const result = analyzeQuery('Show me the steps to deploy this application');
      expect(result.expectedOutputType).toBe('list');
    });

    test('returns analysis when query mentions analyse', () => {
      const result = analyzeQuery('Analysiere die Vor- und Nachteile dieser Lösung');
      expect(result.expectedOutputType).toBe('analysis');
    });

    test('returns analysis when query mentions compare', () => {
      const result = analyzeQuery('Compare React and Vue for this use case');
      expect(result.expectedOutputType).toBe('analysis');
    });

    test('defaults to text for general queries', () => {
      const result = analyzeQuery('Erkläre mir was Machine Learning ist');
      expect(result.expectedOutputType).toBe('text');
    });
  });

  // ─── Language Detection ───────────────────────────────────────────────────

  describe('language detection', () => {
    test('detects German via umlauts', () => {
      const result = analyzeQuery('Über die Änderungen müssen wir reden');
      expect(result.language).toBe('de');
    });

    test('detects German via common words', () => {
      const result = analyzeQuery('ich und du sind nicht der gleiche typ');
      expect(result.language).toBe('de');
    });

    test('detects English via common words', () => {
      const result = analyzeQuery('The best way to solve this problem is to use recursion');
      expect(result.language).toBe('en');
    });

    test('detects English via "are"', () => {
      const result = analyzeQuery('There are many ways to approach this challenge');
      expect(result.language).toBe('en');
    });

    test('defaults to German for ambiguous/short text', () => {
      const result = analyzeQuery('Hello');
      expect(result.language).toBe('de');
    });

    test('detects German via eszett', () => {
      const result = analyzeQuery('Das Maß der Dinge ist entscheidend');
      expect(result.language).toBe('de');
    });
  });

  // ─── Context-aware behavior ───────────────────────────────────────────────

  describe('recentContext usage', () => {
    test('uses lastDomain as fallback when domain is general', () => {
      const result = analyzeQuery('Zeig mir mehr davon', {
        lastDomain: 'finance',
        lastEntities: [],
      });
      // A follow-up with general domain should inherit lastDomain
      expect(result.domain).toBe('finance');
    });

    test('does not override a detected domain with lastDomain', () => {
      const result = analyzeQuery('Ich habe einen Bug in meinem Code gefunden', {
        lastDomain: 'finance',
        lastEntities: [],
      });
      expect(result.domain).toBe('code');
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    test('handles empty string gracefully', () => {
      const result = analyzeQuery('');
      expect(result).toMatchObject<Partial<QueryAnalysis>>({
        intent: 'discussion',
        domain: 'general',
        complexity: 0,
        temporalReference: null,
        entityMentions: [],
        isFollowUp: false,
        expectedOutputType: 'text',
        language: 'de',
      });
    });

    test('handles single word query', () => {
      const result = analyzeQuery('TypeScript');
      expect(result.intent).toBeDefined();
      expect(result.domain).toBeDefined();
      expect(result.complexity).toBe(0);
    });

    test('handles very long query without crashing', () => {
      const longQuery = 'word '.repeat(200).trim();
      expect(() => analyzeQuery(longQuery)).not.toThrow();
      const result = analyzeQuery(longQuery);
      expect(result.complexity).toBe(1.0);
    });

    test('returns all required fields', () => {
      const result = analyzeQuery('Was ist TypeScript?');
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('complexity');
      expect(result).toHaveProperty('temporalReference');
      expect(result).toHaveProperty('entityMentions');
      expect(result).toHaveProperty('isFollowUp');
      expect(result).toHaveProperty('expectedOutputType');
      expect(result).toHaveProperty('language');
    });

    test('is a pure function — same input gives same output', () => {
      const query = 'How do I deploy a Node.js app to Railway?';
      const result1 = analyzeQuery(query);
      const result2 = analyzeQuery(query);
      expect(result1).toEqual(result2);
    });
  });
});
