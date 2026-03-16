/**
 * Unified Assistant Service Tests (Phase 91)
 *
 * Tests intent classification, action resolution, context-aware suggestions,
 * and edge cases.
 */

import {
  classifyIntent,
  processQuery,
  getSuggestionsForPage,
} from '../../../services/unified-assistant';

// ===========================================
// Intent Classification Tests
// ===========================================

describe('classifyIntent', () => {
  // ─── Navigate Intent ──────────────────────
  describe('navigate intent', () => {
    it('should classify "gehe zu dashboard" as navigate', () => {
      const result = classifyIntent('gehe zu dashboard');
      expect(result.intent).toBe('navigate');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify "oeffne email" as navigate', () => {
      const result = classifyIntent('oeffne email');
      expect(result.intent).toBe('navigate');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify "zeige kalender" as navigate', () => {
      const result = classifyIntent('zeige kalender');
      expect(result.intent).toBe('navigate');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify "go to settings" as navigate', () => {
      const result = classifyIntent('go to settings');
      expect(result.intent).toBe('navigate');
    });

    it('should classify "navigiere zu kontakte" as navigate', () => {
      const result = classifyIntent('navigiere zu kontakte');
      expect(result.intent).toBe('navigate');
    });
  });

  // ─── Create Intent ────────────────────────
  describe('create intent', () => {
    it('should classify "erstelle neue idee" as create', () => {
      const result = classifyIntent('erstelle neue idee');
      expect(result.intent).toBe('create');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify "neue aufgabe anlegen" as create', () => {
      const result = classifyIntent('neue aufgabe anlegen');
      expect(result.intent).toBe('create');
    });

    it('should classify "schreibe neue email" as create', () => {
      const result = classifyIntent('schreibe neue email');
      expect(result.intent).toBe('create');
    });

    it('should classify "create new task" as create', () => {
      const result = classifyIntent('create new task');
      expect(result.intent).toBe('create');
    });

    it('should classify "neuen kontakt hinzufuegen" as create', () => {
      const result = classifyIntent('neuen kontakt hinzufuegen');
      expect(result.intent).toBe('create');
    });
  });

  // ─── Search Intent ────────────────────────
  describe('search intent', () => {
    it('should classify "suche nach projektplan" as search', () => {
      const result = classifyIntent('suche nach projektplan');
      expect(result.intent).toBe('search');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify "finde alle aufgaben" as search', () => {
      const result = classifyIntent('finde alle aufgaben');
      expect(result.intent).toBe('search');
    });

    it('should classify "wo ist mein dokument" as search', () => {
      const result = classifyIntent('wo ist mein dokument');
      expect(result.intent).toBe('search');
    });

    it('should classify "search for contacts" as search', () => {
      const result = classifyIntent('search for contacts');
      expect(result.intent).toBe('search');
    });
  });

  // ─── Action Intent ────────────────────────
  describe('action intent', () => {
    it('should classify "aufgabe aus email erstellen" as action', () => {
      const result = classifyIntent('aufgabe aus email erstellen');
      expect(result.intent).toBe('action');
    });

    it('should classify "idee zu aufgabe" as action', () => {
      const result = classifyIntent('idee zu aufgabe');
      expect(result.intent).toBe('action');
    });

    it('should classify "kontakt aus email erstellen" as action', () => {
      const result = classifyIntent('kontakt aus email erstellen');
      expect(result.intent).toBe('action');
    });

    it('should classify "sende email" as action', () => {
      const result = classifyIntent('sende email');
      expect(result.intent).toBe('action');
    });
  });

  // ─── Question Intent ──────────────────────
  describe('question intent', () => {
    it('should classify "was ist die KI" as question', () => {
      const result = classifyIntent('was ist die KI');
      expect(result.intent).toBe('question');
    });

    it('should classify "wie funktioniert das" as question', () => {
      const result = classifyIntent('wie funktioniert das');
      expect(result.intent).toBe('question');
    });

    it('should classify "erklaere mir den prozess" as question', () => {
      const result = classifyIntent('erklaere mir den prozess');
      expect(result.intent).toBe('question');
    });

    it('should classify "hilfe" as question', () => {
      const result = classifyIntent('hilfe');
      expect(result.intent).toBe('question');
    });
  });
});

// ===========================================
// processQuery Tests
// ===========================================

describe('processQuery', () => {
  // ─── Navigate Actions ─────────────────────
  describe('navigate actions', () => {
    it('should return dashboard navigation for "gehe zu dashboard"', () => {
      const result = processQuery('gehe zu dashboard');
      expect(result.intent).toBe('navigate');
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.actions[0].page).toBe('dashboard');
      expect(result.actions[0].type).toBe('navigate');
    });

    it('should return email navigation for "oeffne email"', () => {
      const result = processQuery('oeffne email');
      expect(result.actions.some(a => a.page === 'email')).toBe(true);
    });

    it('should return calendar navigation for "zeige kalender"', () => {
      const result = processQuery('zeige kalender');
      expect(result.actions.some(a => a.page === 'calendar')).toBe(true);
    });
  });

  // ─── Create Actions ───────────────────────
  describe('create actions', () => {
    it('should return idea creation for "erstelle neue idee"', () => {
      const result = processQuery('erstelle neue idee');
      expect(result.intent).toBe('create');
      expect(result.actions.some(a => a.target === 'idea')).toBe(true);
    });

    it('should return task creation for "neue aufgabe"', () => {
      const result = processQuery('neue aufgabe');
      expect(result.actions.some(a => a.target === 'task')).toBe(true);
    });

    it('should return email creation for "schreibe email"', () => {
      const result = processQuery('schreibe email');
      expect(result.actions.some(a => a.target === 'email')).toBe(true);
    });
  });

  // ─── Search Actions ───────────────────────
  describe('search actions', () => {
    it('should return global search for "suche nach projektplan"', () => {
      const result = processQuery('suche nach projektplan');
      expect(result.intent).toBe('search');
      expect(result.actions.some(a => a.target === 'global')).toBe(true);
    });

    it('should extract search term correctly', () => {
      const result = processQuery('suche nach meetings');
      const globalSearch = result.actions.find(a => a.target === 'global');
      expect(globalSearch?.params?.query).toBeDefined();
    });
  });

  // ─── Cross-Feature Actions ────────────────
  describe('cross-feature actions', () => {
    it('should detect email-to-task action', () => {
      const result = processQuery('aufgabe aus email erstellen');
      expect(result.actions.some(a => a.target === 'email_to_task')).toBe(true);
    });

    it('should detect idea-to-task action', () => {
      const result = processQuery('idee zu aufgabe');
      expect(result.actions.some(a => a.target === 'idea_to_task')).toBe(true);
    });
  });

  // ─── Fallback ─────────────────────────────
  describe('fallback behavior', () => {
    it('should fallback to chat for unknown queries', () => {
      const result = processQuery('xyz abc 123');
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.actions[0].page).toBe('chat');
    });

    it('should limit actions to 5', () => {
      const result = processQuery('suche alle ideen aufgaben email kontakte dokumente kalender');
      expect(result.actions.length).toBeLessThanOrEqual(5);
    });
  });

  // ─── Result Structure ─────────────────────
  describe('result structure', () => {
    it('should always return intent and confidence', () => {
      const result = processQuery('test');
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('actions');
      expect(typeof result.confidence).toBe('number');
    });

    it('should have valid action structure', () => {
      const result = processQuery('oeffne dashboard');
      for (const action of result.actions) {
        expect(action).toHaveProperty('type');
        expect(action).toHaveProperty('label');
        expect(typeof action.label).toBe('string');
      }
    });
  });
});

// ===========================================
// getSuggestionsForPage Tests
// ===========================================

describe('getSuggestionsForPage', () => {
  it('should return suggestions for dashboard', () => {
    const suggestions = getSuggestionsForPage('dashboard');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toHaveProperty('label');
    expect(suggestions[0]).toHaveProperty('query');
    expect(suggestions[0]).toHaveProperty('icon');
  });

  it('should return suggestions for ideas page', () => {
    const suggestions = getSuggestionsForPage('ideas');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.query.includes('idee'))).toBe(true);
  });

  it('should return suggestions for email page', () => {
    const suggestions = getSuggestionsForPage('email');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.query.includes('email'))).toBe(true);
  });

  it('should return suggestions for calendar page', () => {
    const suggestions = getSuggestionsForPage('calendar');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should return suggestions for contacts page', () => {
    const suggestions = getSuggestionsForPage('contacts');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should return default suggestions for unknown pages', () => {
    const suggestions = getSuggestionsForPage('unknown-page-xyz');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should have valid suggestion structure', () => {
    const suggestions = getSuggestionsForPage('dashboard');
    for (const suggestion of suggestions) {
      expect(suggestion).toHaveProperty('label');
      expect(suggestion).toHaveProperty('query');
      expect(suggestion).toHaveProperty('icon');
      expect(suggestion).toHaveProperty('category');
    }
  });
});

// ===========================================
// Edge Cases
// ===========================================

describe('edge cases', () => {
  it('should handle empty query', () => {
    const result = classifyIntent('');
    expect(result.intent).toBe('question');
    expect(result.confidence).toBeLessThan(0.3);
  });

  it('should handle single character query', () => {
    const result = classifyIntent('a');
    expect(result).toHaveProperty('intent');
    expect(result.confidence).toBeLessThan(0.3);
  });

  it('should handle very long query', () => {
    const longQuery = 'suche nach '.repeat(100);
    const result = processQuery(longQuery);
    expect(result).toHaveProperty('intent');
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('should handle special characters', () => {
    const result = processQuery('was ist @#$%^&*?');
    expect(result).toHaveProperty('intent');
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('should handle umlauts', () => {
    const result = processQuery('oeffne Uebersicht');
    expect(result).toHaveProperty('intent');
  });

  it('should be case-insensitive', () => {
    const lower = classifyIntent('suche ideen');
    const upper = classifyIntent('SUCHE IDEEN');
    expect(lower.intent).toBe(upper.intent);
  });

  it('should handle processQuery with empty string', () => {
    const result = processQuery('');
    expect(result.actions.length).toBeGreaterThan(0);
    // Fallback to chat
    expect(result.actions[0].page).toBe('chat');
  });

  it('should handle mixed language (DE/EN)', () => {
    const result = processQuery('open my email inbox');
    expect(result).toHaveProperty('intent');
  });
});
