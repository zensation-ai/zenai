/**
 * Unit Tests for Intent Detector - Phase 35
 *
 * Tests regex pre-filter and LLM classification fallback.
 */

// Mock ollama
const mockQueryOllamaJSON = jest.fn();
jest.mock('../../../utils/ollama', () => ({
  queryOllamaJSON: mockQueryOllamaJSON,
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { detectIntents } from '../../../services/intent-detector';

describe('Intent Detector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryOllamaJSON.mockReset();
  });

  describe('default behavior', () => {
    it('should return idea intent for short text', async () => {
      const result = await detectIntents('Hi');

      expect(result.primary_intent).toBe('idea');
      expect(result.confidence).toBe(1.0);
      expect(result.also_create_idea).toBe(true);
      expect(result.intents).toHaveLength(0);
    });

    it('should return idea intent for empty text', async () => {
      const result = await detectIntents('');

      expect(result.primary_intent).toBe('idea');
    });

    it('should return idea intent when no triggers match', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Das ist ein interessanter Gedanke ueber Architektur');

      expect(result.primary_intent).toBe('idea');
      expect(result.intents).toHaveLength(0);
    });
  });

  describe('calendar intent pre-filter', () => {
    it('should detect "Termin" keyword', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Termin mit Max am Freitag um 14 Uhr');

      expect(result.primary_intent).toBe('calendar_event');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect "Meeting" keyword', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Meeting mit dem Team morgen um 10');

      expect(result.primary_intent).toBe('calendar_event');
    });

    it('should detect "Erinnerung" keyword', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Erinnere mich an den Zahnarzt morgen');

      expect(result.primary_intent).toBe('calendar_event');
    });

    it('should detect time pattern "um X Uhr"', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Ich muss um 15 Uhr irgendwo sein');

      expect(result.primary_intent).toBe('calendar_event');
    });

    it('should detect "Deadline" keyword', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Die Deadline fuer das Projekt ist naechste Woche');

      expect(result.primary_intent).toBe('calendar_event');
    });
  });

  describe('email intent pre-filter', () => {
    it('should detect "Schreibe eine E-Mail"', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Schreibe eine E-Mail an den Chef wegen der Budgetplanung');

      expect(result.primary_intent).toBe('email_draft');
    });

    it('should detect "Mail an"', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Mail an Thomas bezueglich des Meetings');

      expect(result.primary_intent).toBe('email_draft');
    });

    it('should detect "Nachricht an"', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Nachricht an das Team: Wir verschieben den Termin');

      expect(result.primary_intent).toBe('email_draft');
    });

    it('should detect "Antwort auf die Mail"', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Antwort auf die Mail von gestern');

      expect(result.primary_intent).toBe('email_draft');
    });
  });

  describe('travel intent pre-filter', () => {
    it('should detect "Fahrt nach"', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Fahrt nach Muenchen von Berlin');

      expect(result.primary_intent).toBe('travel_query');
    });

    it('should detect "Wie lange brauche ich nach"', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Wie lange brauche ich nach Hamburg?');

      expect(result.primary_intent).toBe('travel_query');
    });

    it('should detect "Fahrzeit"', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Fahrzeit von Stuttgart nach Karlsruhe');

      expect(result.primary_intent).toBe('travel_query');
    });

    it('should detect "Entfernung zwischen"', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Entfernung zwischen Frankfurt und Koeln');

      expect(result.primary_intent).toBe('travel_query');
    });
  });

  describe('LLM classification', () => {
    it('should use LLM result when available', async () => {
      mockQueryOllamaJSON.mockResolvedValue({
        intents: [
          {
            type: 'calendar_event',
            confidence: 0.95,
            extracted: {
              title: 'Meeting mit Max',
              date: '2026-02-15',
              time: '14:00',
            },
          },
        ],
        also_create_idea: true,
      });

      const result = await detectIntents('Termin mit Max am 15. Februar um 14 Uhr');

      expect(result.primary_intent).toBe('calendar_event');
      expect(result.confidence).toBe(0.95);
      expect(result.intents[0].extracted_data).toHaveProperty('title', 'Meeting mit Max');
      expect(result.also_create_idea).toBe(true);
    });

    it('should fall back to pre-filter when LLM fails', async () => {
      mockQueryOllamaJSON.mockRejectedValue(new Error('LLM timeout'));

      const result = await detectIntents('Termin morgen um 10 Uhr');

      expect(result.primary_intent).toBe('calendar_event');
      expect(result.intents.length).toBeGreaterThan(0);
      // Should have trigger_phrases from pre-filter
      expect(result.intents[0].trigger_phrases.length).toBeGreaterThan(0);
    });

    it('should handle LLM returning null', async () => {
      mockQueryOllamaJSON.mockResolvedValue(null);

      const result = await detectIntents('Meeting mit dem Designer um 16 Uhr');

      expect(result.primary_intent).toBe('calendar_event');
      expect(result.intents.length).toBeGreaterThan(0);
    });

    it('should handle also_create_idea=false', async () => {
      mockQueryOllamaJSON.mockResolvedValue({
        intents: [
          { type: 'calendar_event', confidence: 0.9, extracted: {} },
        ],
        also_create_idea: false,
      });

      const result = await detectIntents('Erinnere mich um 15 Uhr an den Anruf');

      expect(result.also_create_idea).toBe(false);
    });
  });

  describe('multiple intents', () => {
    it('should detect both calendar and travel in same text', async () => {
      mockQueryOllamaJSON.mockResolvedValue({
        intents: [
          { type: 'calendar_event', confidence: 0.9, extracted: { title: 'Meeting in Muenchen' } },
          { type: 'travel_query', confidence: 0.7, extracted: { destination: 'Muenchen' } },
        ],
        also_create_idea: true,
      });

      const result = await detectIntents('Termin morgen in Muenchen, Fahrt von Berlin dorthin');

      expect(result.intents.length).toBeGreaterThanOrEqual(1);
      expect(result.primary_intent).toBe('calendar_event'); // Highest confidence
    });
  });
});
