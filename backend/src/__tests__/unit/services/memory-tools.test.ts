/**
 * Memory Self-Editing Tools Tests
 *
 * Tests for the Letta-pattern memory_update, memory_delete, and memory_update_profile tools.
 */

import { handleMemoryUpdate, handleMemoryDelete, handleMemoryUpdateProfile } from '../../../services/tool-handlers/memory-tools';
import { ToolExecutionContext } from '../../../services/claude/tool-use';

// Mock dependencies
jest.mock('../../../services/memory', () => ({
  longTermMemory: {
    getFacts: jest.fn(),
    addFact: jest.fn(),
    removeFact: jest.fn().mockReturnValue(true),
  },
  PersonalizationFact: {},
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  isValidContext: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../services/personal-facts-bridge', () => ({
  invalidatePersonalFactsCache: jest.fn(),
  CATEGORY_LABELS: {
    basic_info: 'Grundlegendes', personality: 'Persönlichkeit',
    work_life: 'Arbeit & Beruf', goals_dreams: 'Ziele & Träume',
    interests_hobbies: 'Interessen & Hobbys', communication_style: 'Kommunikationsstil',
    decision_making: 'Entscheidungsfindung', daily_routines: 'Tagesablauf',
    values_beliefs: 'Werte & Überzeugungen', challenges: 'Herausforderungen',
  },
  VALID_CATEGORIES: [
    'basic_info', 'personality', 'work_life', 'goals_dreams',
    'interests_hobbies', 'communication_style', 'decision_making',
    'daily_routines', 'values_beliefs', 'challenges',
  ],
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

const { longTermMemory } = require('../../../services/memory');
const { queryContext } = require('../../../utils/database-context');
const { invalidatePersonalFactsCache } = require('../../../services/personal-facts-bridge');

const defaultContext: ToolExecutionContext = {
  aiContext: 'personal',
  sessionId: 'test-session',
  userId: 'test-user',
};

describe('Memory Self-Editing Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // memory_update
  // ==========================================
  describe('handleMemoryUpdate', () => {
    it('should return error if no new_content provided', async () => {
      const result = await handleMemoryUpdate({}, defaultContext);
      expect(result).toContain('Fehler');
      expect(result).toContain('Neuer Inhalt');
    });

    it('should return error if neither fact_id nor search_content provided', async () => {
      const result = await handleMemoryUpdate(
        { new_content: 'test' },
        defaultContext
      );
      expect(result).toContain('Fehler');
      expect(result).toContain('fact_id oder search_content');
    });

    it('should update existing fact by ID', async () => {
      const existingFacts = [
        {
          id: 'fact-123',
          factType: 'knowledge' as const,
          content: 'Arbeitet bei Firma A',
          confidence: 0.8,
          source: 'explicit' as const,
          firstSeen: new Date(),
          lastConfirmed: new Date(),
          occurrences: 3,
          retrievalCount: 5,
          lastRetrieved: new Date(),
          decayClass: 'normal_decay' as const,
        },
      ];
      longTermMemory.getFacts.mockResolvedValue(existingFacts);
      queryContext.mockResolvedValue({ rows: [] });

      const result = await handleMemoryUpdate(
        {
          fact_id: 'fact-123',
          new_content: 'Arbeitet bei Firma B',
          confidence: 0.95,
        },
        defaultContext
      );

      expect(result).toContain('aktualisiert');
      expect(result).toContain('Firma B');
      expect(queryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('UPDATE personalization_facts'),
        expect.arrayContaining(['Arbeitet bei Firma B', 'knowledge', 0.95, 'fact-123'])
      );
    });

    it('should find fact by search_content', async () => {
      const existingFacts = [
        {
          id: 'fact-456',
          factType: 'preference' as const,
          content: 'Bevorzugt Dark Mode',
          confidence: 0.7,
          source: 'inferred' as const,
          firstSeen: new Date(),
          lastConfirmed: new Date(),
          occurrences: 2,
          retrievalCount: 0,
          lastRetrieved: null,
          decayClass: 'normal_decay' as const,
        },
      ];
      longTermMemory.getFacts.mockResolvedValue(existingFacts);
      queryContext.mockResolvedValue({ rows: [] });

      const result = await handleMemoryUpdate(
        {
          search_content: 'dark mode',
          new_content: 'Bevorzugt Light Mode',
        },
        defaultContext
      );

      expect(result).toContain('aktualisiert');
      expect(result).toContain('Light Mode');
    });

    it('should create new fact if no existing fact found', async () => {
      longTermMemory.getFacts.mockResolvedValue([]);

      const result = await handleMemoryUpdate(
        {
          search_content: 'nonexistent fact',
          new_content: 'Brand new fact',
        },
        defaultContext
      );

      expect(result).toContain('Neuer Fakt gespeichert');
      expect(longTermMemory.addFact).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({
          content: 'Brand new fact',
          source: 'explicit',
        })
      );
    });
  });

  // ==========================================
  // memory_delete
  // ==========================================
  describe('handleMemoryDelete', () => {
    it('should return error if neither fact_id nor search_content provided', async () => {
      const result = await handleMemoryDelete({}, defaultContext);
      expect(result).toContain('Fehler');
    });

    it('should delete fact by ID', async () => {
      const existingFacts = [
        {
          id: 'fact-789',
          factType: 'behavior' as const,
          content: 'Raucht Zigaretten',
          confidence: 0.6,
          source: 'inferred' as const,
          firstSeen: new Date(),
          lastConfirmed: new Date(),
          occurrences: 1,
          retrievalCount: 0,
          lastRetrieved: null,
          decayClass: 'normal_decay' as const,
        },
      ];
      longTermMemory.getFacts.mockResolvedValue(existingFacts);
      queryContext.mockResolvedValue({ rows: [] });

      const result = await handleMemoryDelete(
        {
          fact_id: 'fact-789',
          reason: 'User corrected: never smoked',
        },
        defaultContext
      );

      expect(result).toContain('gelöscht');
      expect(result).toContain('Raucht Zigaretten');
      expect(queryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('UPDATE personalization_facts'),
        ['fact-789']
      );
    });

    it('should return not-found message for missing fact', async () => {
      longTermMemory.getFacts.mockResolvedValue([]);

      const result = await handleMemoryDelete(
        { search_content: 'nonexistent' },
        defaultContext
      );

      expect(result).toContain('Kein Fakt gefunden');
    });

    it('should find and delete fact by search_content', async () => {
      const existingFacts = [
        {
          id: 'fact-abc',
          factType: 'knowledge' as const,
          content: 'Wohnt in München',
          confidence: 0.8,
          source: 'explicit' as const,
          firstSeen: new Date(),
          lastConfirmed: new Date(),
          occurrences: 1,
          retrievalCount: 0,
          lastRetrieved: null,
          decayClass: 'normal_decay' as const,
        },
      ];
      longTermMemory.getFacts.mockResolvedValue(existingFacts);
      queryContext.mockResolvedValue({ rows: [] });

      const result = await handleMemoryDelete(
        {
          search_content: 'münchen',
          reason: 'Umgezogen',
        },
        defaultContext
      );

      expect(result).toContain('gelöscht');
      expect(result).toContain('München');
    });
  });

  // ==========================================
  // memory_update_profile
  // ==========================================
  describe('handleMemoryUpdateProfile', () => {
    it('should return error if required fields missing', async () => {
      const result = await handleMemoryUpdateProfile(
        { category: 'basic_info' },
        defaultContext
      );
      expect(result).toContain('Fehler');
    });

    it('should reject invalid category', async () => {
      const result = await handleMemoryUpdateProfile(
        {
          category: 'invalid_category',
          fact_key: 'name',
          fact_value: 'Test',
        },
        defaultContext
      );
      expect(result).toContain('Ungültige Kategorie');
    });

    it('should update profile fact via upsert', async () => {
      queryContext.mockResolvedValue({ rows: [{ id: 'test-uuid-1234' }] });

      const result = await handleMemoryUpdateProfile(
        {
          category: 'basic_info',
          fact_key: 'name',
          fact_value: 'Alexander',
        },
        defaultContext
      );

      expect(result).toContain('Profil aktualisiert');
      expect(result).toContain('Alexander');
      expect(result).toContain('Grundlegendes');

      // Should use 'personal' schema (identity is context-independent)
      expect(queryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO personal_facts'),
        expect.arrayContaining(['basic_info', 'name', 'Alexander'])
      );

      // Should invalidate cache
      expect(invalidatePersonalFactsCache).toHaveBeenCalled();
    });

    it('should handle all valid categories', async () => {
      queryContext.mockResolvedValue({ rows: [{ id: 'test-uuid-1234' }] });

      const categories = [
        'basic_info', 'personality', 'work_life', 'goals_dreams',
        'interests_hobbies', 'communication_style', 'decision_making',
        'daily_routines', 'values_beliefs', 'challenges',
      ];

      for (const category of categories) {
        const result = await handleMemoryUpdateProfile(
          { category, fact_key: 'test_key', fact_value: 'test_value' },
          defaultContext
        );
        expect(result).toContain('Profil aktualisiert');
      }
    });
  });
});
