/**
 * Shared Memory Service Tests
 *
 * Tests the shared memory system for agent team collaboration.
 */

import {
  sharedMemory,
  AgentRole,
  SharedEntryType,
} from '../../../services/memory/shared-memory';

describe('Shared Memory Service', () => {
  const teamId = 'test-team-1';
  const teamId2 = 'test-team-2';

  afterEach(() => {
    sharedMemory.clear(teamId);
    sharedMemory.clear(teamId2);
  });

  describe('initialize', () => {
    it('should initialize a new team store', () => {
      sharedMemory.initialize(teamId);
      expect(sharedMemory.has(teamId)).toBe(true);
    });

    it('should be idempotent', () => {
      sharedMemory.initialize(teamId);
      sharedMemory.write(teamId, 'researcher', 'finding', 'Test');
      sharedMemory.initialize(teamId); // Should not reset
      const entries = sharedMemory.read(teamId);
      expect(entries).toHaveLength(1);
    });
  });

  describe('write', () => {
    it('should write an entry to shared memory', () => {
      const entry = sharedMemory.write(teamId, 'researcher', 'finding', 'Found important data');
      expect(entry.id).toBeDefined();
      expect(entry.agentRole).toBe('researcher');
      expect(entry.type).toBe('finding');
      expect(entry.content).toBe('Found important data');
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it('should auto-initialize store on write', () => {
      sharedMemory.write(teamId, 'writer', 'artifact', 'Article draft');
      expect(sharedMemory.has(teamId)).toBe(true);
    });

    it('should support metadata', () => {
      const entry = sharedMemory.write(
        teamId,
        'reviewer',
        'feedback',
        'Needs improvement',
        { targetAgent: 'writer', severity: 'high' }
      );
      expect(entry.metadata?.targetAgent).toBe('writer');
      expect(entry.metadata?.severity).toBe('high');
    });

    it('should support all entry types', () => {
      const types: SharedEntryType[] = ['finding', 'decision', 'question', 'artifact', 'feedback', 'plan'];
      for (const type of types) {
        const entry = sharedMemory.write(teamId, 'orchestrator', type, `Test ${type}`);
        expect(entry.type).toBe(type);
      }
      expect(sharedMemory.read(teamId)).toHaveLength(types.length);
    });

    it('should support all agent roles', () => {
      const roles: AgentRole[] = ['researcher', 'writer', 'reviewer', 'coder', 'orchestrator'];
      for (const role of roles) {
        sharedMemory.write(teamId, role, 'finding', `Finding from ${role}`);
      }
      expect(sharedMemory.read(teamId)).toHaveLength(roles.length);
    });
  });

  describe('read', () => {
    beforeEach(() => {
      sharedMemory.write(teamId, 'researcher', 'finding', 'Research finding 1');
      sharedMemory.write(teamId, 'researcher', 'finding', 'Research finding 2');
      sharedMemory.write(teamId, 'writer', 'artifact', 'Draft article');
      sharedMemory.write(teamId, 'reviewer', 'feedback', 'Review feedback');
      sharedMemory.write(teamId, 'orchestrator', 'decision', 'Use full pipeline');
    });

    it('should read all entries', () => {
      const entries = sharedMemory.read(teamId);
      expect(entries).toHaveLength(5);
    });

    it('should filter by agent role', () => {
      const entries = sharedMemory.read(teamId, { agentRole: 'researcher' });
      expect(entries).toHaveLength(2);
      entries.forEach(e => expect(e.agentRole).toBe('researcher'));
    });

    it('should filter by entry type', () => {
      const entries = sharedMemory.read(teamId, { type: 'finding' });
      expect(entries).toHaveLength(2);
      entries.forEach(e => expect(e.type).toBe('finding'));
    });

    it('should filter by time', () => {
      // Use a future timestamp to filter out all existing entries
      const futureDate = new Date(Date.now() + 1000);
      sharedMemory.write(teamId, 'researcher', 'finding', 'Late finding');
      // Manually adjust the entry's timestamp to be in the future
      const allEntries = sharedMemory.read(teamId);
      const lateEntry = allEntries.find(e => e.content === 'Late finding');
      if (lateEntry) {
        lateEntry.timestamp = new Date(Date.now() + 2000);
      }
      const entries = sharedMemory.read(teamId, { since: futureDate });
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].content).toBe('Late finding');
    });

    it('should limit results', () => {
      const entries = sharedMemory.read(teamId, { limit: 2 });
      expect(entries).toHaveLength(2);
    });

    it('should sort by timestamp (newest first)', () => {
      const entries = sharedMemory.read(teamId);
      for (let i = 0; i < entries.length - 1; i++) {
        expect(entries[i].timestamp.getTime()).toBeGreaterThanOrEqual(entries[i + 1].timestamp.getTime());
      }
    });

    it('should return empty array for unknown team', () => {
      expect(sharedMemory.read('unknown-team')).toHaveLength(0);
    });

    it('should combine multiple filters', () => {
      const entries = sharedMemory.read(teamId, { agentRole: 'researcher', type: 'finding' });
      expect(entries).toHaveLength(2);
    });
  });

  describe('getContext', () => {
    it('should return empty string for empty team', () => {
      sharedMemory.initialize(teamId);
      expect(sharedMemory.getContext(teamId)).toBe('');
    });

    it('should format context with sections', () => {
      sharedMemory.write(teamId, 'orchestrator', 'plan', 'Execute research then write');
      sharedMemory.write(teamId, 'researcher', 'finding', 'Key finding here');
      sharedMemory.write(teamId, 'orchestrator', 'decision', 'Use Sonnet for writing');

      const context = sharedMemory.getContext(teamId);
      expect(context).toContain('[TEAM SHARED MEMORY]');
      expect(context).toContain('## Plan');
      expect(context).toContain('## Findings');
      expect(context).toContain('## Decisions');
    });

    it('should include feedback for target agent', () => {
      sharedMemory.write(teamId, 'reviewer', 'feedback', 'Improve the intro', { targetAgent: 'writer' });
      const context = sharedMemory.getContext(teamId, 'writer');
      expect(context).toContain('## Feedback');
      expect(context).toContain('Improve the intro');
    });

    it('should show feedback without target to all agents', () => {
      sharedMemory.write(teamId, 'reviewer', 'feedback', 'General note');
      const context = sharedMemory.getContext(teamId, 'researcher');
      expect(context).toContain('General note');
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty team', () => {
      const stats = sharedMemory.getStats(teamId);
      expect(stats.totalEntries).toBe(0);
      expect(stats.byAgent).toEqual({});
      expect(stats.byType).toEqual({});
    });

    it('should count entries by agent and type', () => {
      sharedMemory.write(teamId, 'researcher', 'finding', 'F1');
      sharedMemory.write(teamId, 'researcher', 'finding', 'F2');
      sharedMemory.write(teamId, 'writer', 'artifact', 'A1');

      const stats = sharedMemory.getStats(teamId);
      expect(stats.totalEntries).toBe(3);
      expect(stats.byAgent.researcher).toBe(2);
      expect(stats.byAgent.writer).toBe(1);
      expect(stats.byType.finding).toBe(2);
      expect(stats.byType.artifact).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all team data', () => {
      sharedMemory.write(teamId, 'researcher', 'finding', 'Test');
      sharedMemory.clear(teamId);
      expect(sharedMemory.has(teamId)).toBe(false);
      expect(sharedMemory.read(teamId)).toHaveLength(0);
    });
  });

  describe('team isolation', () => {
    it('should keep data separate between teams', () => {
      sharedMemory.write(teamId, 'researcher', 'finding', 'Team 1 finding');
      sharedMemory.write(teamId2, 'writer', 'artifact', 'Team 2 artifact');

      expect(sharedMemory.read(teamId)).toHaveLength(1);
      expect(sharedMemory.read(teamId2)).toHaveLength(1);
      expect(sharedMemory.read(teamId)[0].content).toBe('Team 1 finding');
      expect(sharedMemory.read(teamId2)[0].content).toBe('Team 2 artifact');
    });
  });

  describe('getActiveTeamCount', () => {
    it('should track active teams', () => {
      const initialCount = sharedMemory.getActiveTeamCount();
      sharedMemory.initialize(teamId);
      expect(sharedMemory.getActiveTeamCount()).toBe(initialCount + 1);
      sharedMemory.initialize(teamId2);
      expect(sharedMemory.getActiveTeamCount()).toBe(initialCount + 2);
      sharedMemory.clear(teamId);
      expect(sharedMemory.getActiveTeamCount()).toBe(initialCount + 1);
    });
  });
});
