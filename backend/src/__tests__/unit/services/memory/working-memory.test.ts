/**
 * Unit Tests for Working Memory Service
 *
 * Tests active context management during task execution.
 * Biological inspiration: Prefrontal Cortex working memory (Miller's Law: 7 +/- 2)
 */

import { WorkingMemoryService, workingMemory, SlotType, WorkingMemorySlot } from '../../../../services/memory/working-memory';

// Mock dependencies
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
}));

jest.mock('../../../../utils/embedding', () => ({
  cosineSimilarity: jest.fn().mockReturnValue(0.7),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Working Memory Service', () => {
  let memory: WorkingMemoryService;

  beforeEach(() => {
    memory = new WorkingMemoryService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    memory.stopCleanupInterval();
  });

  // ===========================================
  // Session Initialization Tests
  // ===========================================

  describe('initialize', () => {
    it('should create a new working memory session with goal', () => {
      const state = memory.initialize('session-1', 'Complete project analysis', 'work');

      expect(state).toBeDefined();
      expect(state.sessionId).toBe('session-1');
      expect(state.currentGoal).toBe('Complete project analysis');
      expect(state.context).toBe('work');
      expect(state.capacity).toBe(7); // Miller's Law default
    });

    it('should add goal as first slot with highest priority', () => {
      const state = memory.initialize('session-1', 'Test goal', 'personal');

      expect(state.slots).toHaveLength(1);
      expect(state.slots[0].type).toBe('goal');
      expect(state.slots[0].content).toBe('Test goal');
      expect(state.slots[0].priority).toBe(1.0);
      expect(state.slots[0].activation).toBe(1.0);
    });

    it('should allow custom capacity', () => {
      const state = memory.initialize('session-1', 'Goal', 'work', 9);

      expect(state.capacity).toBe(9);
    });

    it('should return existing session if already initialized', () => {
      const state1 = memory.initialize('session-1', 'Goal 1', 'work');
      const state2 = memory.initialize('session-1', 'Goal 2', 'work');

      expect(state1).toBe(state2);
      expect(state2.currentGoal).toBe('Goal 2'); // Updated
    });
  });

  // ===========================================
  // Slot Management Tests
  // ===========================================

  describe('add', () => {
    beforeEach(() => {
      memory.initialize('session-1', 'Main goal', 'work');
    });

    it('should add a new slot to working memory', async () => {
      const slot = await memory.add('session-1', 'fact', 'Important fact');

      expect(slot).toBeDefined();
      expect(slot?.type).toBe('fact');
      expect(slot?.content).toBe('Important fact');
      expect(slot?.activation).toBe(1.0);
    });

    it('should support different slot types', async () => {
      const types: SlotType[] = ['constraint', 'fact', 'hypothesis', 'intermediate_result'];

      for (const type of types) {
        const slot = await memory.add('session-1', type, `Test ${type}`);
        expect(slot?.type).toBe(type);
      }
    });

    it('should boost existing slot instead of adding duplicate', async () => {
      await memory.add('session-1', 'fact', 'Same content');
      const slot2 = await memory.add('session-1', 'fact', 'Same content');

      const state = memory.getState('session-1');
      // Should have goal + 1 fact (not 2)
      expect(state?.slots.filter((s: WorkingMemorySlot) => s.type === 'fact')).toHaveLength(1);
      // Activation is boosted but capped at 1.0
      expect(slot2?.activation).toBe(1.0);
    });

    it('should evict lowest slot when at capacity', async () => {
      // Fill up to capacity (7 default - 1 goal = 6 slots)
      for (let i = 0; i < 7; i++) {
        await memory.add('session-1', 'fact', `Fact ${i}`, i * 0.1);
      }

      const state = memory.getState('session-1');
      expect(state?.slots.length).toBeLessThanOrEqual(7);
    });

    it('should return null for non-existent session', async () => {
      const slot = await memory.add('non-existent', 'fact', 'Test');
      expect(slot).toBeNull();
    });
  });

  describe('addMultiple', () => {
    beforeEach(() => {
      memory.initialize('session-1', 'Goal', 'work');
    });

    it('should add multiple slots at once', async () => {
      const items = [
        { type: 'fact' as SlotType, content: 'Fact 1' },
        { type: 'constraint' as SlotType, content: 'Constraint 1' },
        { type: 'hypothesis' as SlotType, content: 'Hypothesis 1' },
      ];

      const added = await memory.addMultiple('session-1', items);

      expect(added).toHaveLength(3);
    });
  });

  // ===========================================
  // Activation Tests
  // ===========================================

  describe('activate', () => {
    beforeEach(() => {
      memory.initialize('session-1', 'Goal', 'work');
    });

    it('should boost activation when slot is activated', async () => {
      const slot = await memory.add('session-1', 'fact', 'Test fact');

      // Wait a tiny bit to simulate time passing
      await new Promise(resolve => setTimeout(resolve, 10));

      await memory.activate('session-1', slot!.id);

      const state = memory.getState('session-1');
      const activatedSlot = state?.slots.find((s: WorkingMemorySlot) => s.id === slot!.id);

      // Activation should be boosted (up to max 1.0)
      expect(activatedSlot?.activation).toBeGreaterThanOrEqual(1.0);
    });

    it('should not throw for non-existent slot', async () => {
      await expect(memory.activate('session-1', 'non-existent')).resolves.not.toThrow();
    });
  });

  describe('activateByContent', () => {
    beforeEach(() => {
      memory.initialize('session-1', 'Goal', 'work');
    });

    it('should activate slots matching content', async () => {
      await memory.add('session-1', 'fact', 'Project deadline is Friday');
      await memory.add('session-1', 'fact', 'Budget is $10000');

      await memory.activateByContent('session-1', 'deadline');

      const state = memory.getState('session-1');
      const deadlineSlot = state?.slots.find((s: WorkingMemorySlot) => s.content.includes('deadline'));
      const budgetSlot = state?.slots.find((s: WorkingMemorySlot) => s.content.includes('Budget'));

      // Deadline slot should have higher activation
      expect(deadlineSlot).toBeDefined();
    });
  });

  // ===========================================
  // Removal Tests
  // ===========================================

  describe('remove', () => {
    beforeEach(() => {
      memory.initialize('session-1', 'Goal', 'work');
    });

    it('should remove a slot by id', async () => {
      const slot = await memory.add('session-1', 'fact', 'Test fact');

      const removed = memory.remove('session-1', slot!.id);

      expect(removed).toBe(true);
      const state = memory.getState('session-1');
      expect(state?.slots.find((s: WorkingMemorySlot) => s.id === slot!.id)).toBeUndefined();
    });

    it('should not allow removing goal slot', () => {
      const state = memory.getState('session-1');
      const goalSlot = state?.slots.find((s: WorkingMemorySlot) => s.type === 'goal');

      const removed = memory.remove('session-1', goalSlot!.id);

      expect(removed).toBe(false);
    });

    it('should return false for non-existent slot', () => {
      const removed = memory.remove('session-1', 'non-existent');
      expect(removed).toBe(false);
    });
  });

  // ===========================================
  // Sub-Goals Tests
  // ===========================================

  describe('sub-goals', () => {
    beforeEach(() => {
      memory.initialize('session-1', 'Main goal', 'work');
    });

    it('should add sub-goals', () => {
      memory.addSubGoal('session-1', 'Sub-goal 1');
      memory.addSubGoal('session-1', 'Sub-goal 2');

      const state = memory.getState('session-1');
      expect(state?.subGoals).toContain('Sub-goal 1');
      expect(state?.subGoals).toContain('Sub-goal 2');
    });

    it('should not add duplicate sub-goals', () => {
      memory.addSubGoal('session-1', 'Sub-goal 1');
      memory.addSubGoal('session-1', 'Sub-goal 1');

      const state = memory.getState('session-1');
      expect(state?.subGoals.filter((g: string) => g === 'Sub-goal 1')).toHaveLength(1);
    });

    it('should remove sub-goals', () => {
      memory.addSubGoal('session-1', 'Sub-goal 1');
      memory.removeSubGoal('session-1', 'Sub-goal 1');

      const state = memory.getState('session-1');
      expect(state?.subGoals).not.toContain('Sub-goal 1');
    });
  });

  // ===========================================
  // Context Generation Tests
  // ===========================================

  describe('generateContextString', () => {
    beforeEach(() => {
      memory.initialize('session-1', 'Analyze project risks', 'work');
    });

    it('should generate context string with goal', () => {
      const context = memory.generateContextString('session-1');

      expect(context).toContain('[AKTUELLES ZIEL]');
      expect(context).toContain('Analyze project risks');
    });

    it('should include sub-goals in context', () => {
      memory.addSubGoal('session-1', 'Identify stakeholders');
      memory.addSubGoal('session-1', 'Assess timeline');

      const context = memory.generateContextString('session-1');

      expect(context).toContain('[TEILZIELE]');
      expect(context).toContain('Identify stakeholders');
    });

    it('should include slots grouped by type', async () => {
      await memory.add('session-1', 'constraint', 'Must complete by Friday');
      await memory.add('session-1', 'fact', 'Team has 5 members');
      await memory.add('session-1', 'hypothesis', 'May need external help');

      const context = memory.generateContextString('session-1');

      expect(context).toContain('[CONSTRAINTS]');
      expect(context).toContain('[RELEVANTE FAKTEN]');
      expect(context).toContain('[HYPOTHESEN]');
    });

    it('should return empty string for non-existent session', () => {
      const context = memory.generateContextString('non-existent');
      expect(context).toBe('');
    });
  });

  // ===========================================
  // Active Slots Tests
  // ===========================================

  describe('getActiveSlots', () => {
    beforeEach(() => {
      memory.initialize('session-1', 'Goal', 'work');
    });

    it('should return slots sorted by relevance', async () => {
      await memory.add('session-1', 'fact', 'Low priority', 0.3);
      await memory.add('session-1', 'constraint', 'High priority', 0.9);

      const slots = memory.getActiveSlots('session-1');

      // Goal should be first (priority 1.0), then high priority constraint
      expect(slots[0].type).toBe('goal');
    });

    it('should return empty array for non-existent session', () => {
      const slots = memory.getActiveSlots('non-existent');
      expect(slots).toEqual([]);
    });
  });

  // ===========================================
  // Session Management Tests
  // ===========================================

  describe('getOrInitialize', () => {
    it('should return existing session', async () => {
      const state1 = memory.initialize('session-1', 'Goal 1', 'work');
      const state2 = await memory.getOrInitialize('session-1', 'Goal 2', 'work');

      expect(state1).toBe(state2);
    });

    it('should create new session if not exists', async () => {
      const state = await memory.getOrInitialize('new-session', 'New goal', 'personal');

      expect(state.sessionId).toBe('new-session');
      expect(state.currentGoal).toBe('New goal');
    });
  });

  describe('getState', () => {
    it('should return null for non-existent session', () => {
      expect(memory.getState('non-existent')).toBeNull();
    });

    it('should return state for existing session', () => {
      memory.initialize('session-1', 'Goal', 'work');

      const state = memory.getState('session-1');
      expect(state).not.toBeNull();
      expect(state?.sessionId).toBe('session-1');
    });
  });

  describe('clear', () => {
    it('should remove session from memory', () => {
      memory.initialize('session-1', 'Goal', 'work');
      memory.clear('session-1');

      expect(memory.getState('session-1')).toBeNull();
    });
  });

  // ===========================================
  // Statistics Tests
  // ===========================================

  describe('getStats', () => {
    it('should return statistics about working memory', async () => {
      memory.initialize('session-1', 'Goal 1', 'work');
      memory.initialize('session-2', 'Goal 2', 'personal');
      await memory.add('session-1', 'fact', 'Fact 1');
      await memory.add('session-1', 'fact', 'Fact 2');

      const stats = memory.getStats();

      expect(stats.activeSessions).toBe(2);
      expect(stats.totalSlots).toBeGreaterThanOrEqual(4); // 2 goals + 2 facts
      expect(stats.avgSlotsPerSession).toBeGreaterThan(0);
    });
  });

  // ===========================================
  // Singleton Tests
  // ===========================================

  describe('workingMemory singleton', () => {
    it('should be defined', () => {
      expect(workingMemory).toBeDefined();
      expect(workingMemory).toBeInstanceOf(WorkingMemoryService);
    });
  });
});
