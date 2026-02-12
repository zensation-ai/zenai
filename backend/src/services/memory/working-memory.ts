/**
 * Working Memory Service (HiMeS Architecture - Layer 1)
 *
 * Manages active context during task execution.
 * Biological inspiration: Prefrontal Cortex working memory.
 *
 * Features:
 * - Limited capacity (Miller's Law: 7 +/- 2)
 * - Activation-based slot management
 * - Spreading activation to related concepts
 * - Time-based decay
 * - Priority-based eviction
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { generateEmbedding } from '../ai';
import { cosineSimilarity } from '../../utils/embedding';
import { longTermMemory } from './long-term-memory';

// ===========================================
// Types & Interfaces
// ===========================================

export type SlotType = 'goal' | 'constraint' | 'fact' | 'hypothesis' | 'intermediate_result';

export interface WorkingMemorySlot {
  id: string;
  type: SlotType;
  content: string;
  priority: number;      // 0-1, higher = more important
  activation: number;    // 0-1, decay over time
  addedAt: Date;
  lastAccessed: Date;
  embedding?: number[];
}

export interface WorkingMemoryState {
  sessionId: string;
  context: AIContext;
  slots: WorkingMemorySlot[];
  capacity: number;
  currentGoal: string;
  subGoals: string[];
  createdAt: Date;
  lastActivity: Date;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Default capacity (Miller's Law: 7 +/- 2) */
  DEFAULT_CAPACITY: 7,
  /** Decay rate per second of inactivity */
  DECAY_RATE: 0.02,
  /** Minimum activation before slot is eligible for eviction */
  MIN_ACTIVATION: 0.1,
  /** Spreading activation factor */
  SPREADING_FACTOR: 0.15,
  /** Similarity threshold for spreading activation */
  SPREADING_THRESHOLD: 0.5,
  /** Session timeout in milliseconds (30 minutes) */
  SESSION_TIMEOUT_MS: 30 * 60 * 1000,
  /** Maximum sessions in memory */
  MAX_SESSIONS: 100,
  /** Minimum activation for a slot to be promoted to long-term memory */
  PROMOTION_MIN_ACTIVATION: 0.3,
  /** Minimum priority for a slot to be promoted */
  PROMOTION_MIN_PRIORITY: 0.4,
  /** Slot types eligible for long-term promotion */
  PROMOTABLE_TYPES: ['fact', 'goal', 'constraint'] as SlotType[],
  /** Map SlotType to PersonalizationFact factType */
  SLOT_TO_FACT_TYPE: {
    goal: 'goal',
    fact: 'knowledge',
    constraint: 'preference',
    hypothesis: 'knowledge',
    intermediate_result: 'context',
  } as Record<SlotType, string>,
};

// ===========================================
// Working Memory Service
// ===========================================

export class WorkingMemoryService {
  private states: Map<string, WorkingMemoryState> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  // ===========================================
  // Session Management
  // ===========================================

  /**
   * Initialize working memory for a new session
   */
  initialize(
    sessionId: string,
    goal: string,
    context: AIContext,
    capacity: number = CONFIG.DEFAULT_CAPACITY
  ): WorkingMemoryState {
    // Check if already exists
    const existing = this.states.get(sessionId);
    if (existing) {
      // Update goal if different
      if (existing.currentGoal !== goal) {
        existing.currentGoal = goal;
        existing.lastActivity = new Date();
      }
      return existing;
    }

    const now = new Date();

    const state: WorkingMemoryState = {
      sessionId,
      context,
      slots: [],
      capacity,
      currentGoal: goal,
      subGoals: [],
      createdAt: now,
      lastActivity: now,
    };

    // Add goal as first slot (highest priority)
    const goalSlot: WorkingMemorySlot = {
      id: uuidv4(),
      type: 'goal',
      content: goal,
      priority: 1.0,
      activation: 1.0,
      addedAt: now,
      lastAccessed: now,
    };

    state.slots.push(goalSlot);
    this.states.set(sessionId, state);

    logger.debug('Working memory initialized', {
      sessionId,
      goal: goal.substring(0, 50),
      capacity,
    });

    // Evict oldest if over limit
    if (this.states.size > CONFIG.MAX_SESSIONS) {
      this.evictOldestSession();
    }

    return state;
  }

  /**
   * Get or initialize working memory state
   */
  getOrInitialize(
    sessionId: string,
    goal: string,
    context: AIContext
  ): WorkingMemoryState {
    const existing = this.states.get(sessionId);
    if (existing) {
      existing.lastActivity = new Date();
      return existing;
    }
    return this.initialize(sessionId, goal, context);
  }

  /**
   * Get state by session ID
   */
  getState(sessionId: string): WorkingMemoryState | null {
    const state = this.states.get(sessionId);
    if (!state) {return null;}

    // Check if expired
    if (Date.now() - state.lastActivity.getTime() > CONFIG.SESSION_TIMEOUT_MS) {
      this.states.delete(sessionId);
      return null;
    }

    return state;
  }

  // ===========================================
  // Slot Management
  // ===========================================

  /**
   * Add item to working memory
   */
  async add(
    sessionId: string,
    type: SlotType,
    content: string,
    priority: number = 0.5
  ): Promise<WorkingMemorySlot | null> {
    const state = this.states.get(sessionId);
    if (!state) {
      logger.warn('Attempted to add to non-existent working memory', { sessionId });
      return null;
    }

    // Apply decay to existing slots
    this.applyDecay(state);

    // Check if similar content already exists
    const existingIndex = state.slots.findIndex(s =>
      s.content.toLowerCase() === content.toLowerCase()
    );

    if (existingIndex !== -1) {
      // Boost existing slot instead of adding duplicate
      const existing = state.slots[existingIndex];
      existing.activation = Math.min(1.0, existing.activation + 0.3);
      existing.lastAccessed = new Date();
      state.lastActivity = new Date();
      return existing;
    }

    // Check capacity and evict if needed
    if (state.slots.length >= state.capacity) {
      this.evictLowestSlot(state);
    }

    const now = new Date();
    const slot: WorkingMemorySlot = {
      id: uuidv4(),
      type,
      content,
      priority: Math.max(0, Math.min(1, priority)),
      activation: 1.0,
      addedAt: now,
      lastAccessed: now,
    };

    state.slots.push(slot);
    state.lastActivity = now;

    logger.debug('Slot added to working memory', {
      sessionId,
      slotId: slot.id,
      type,
      slotsCount: state.slots.length,
      capacity: state.capacity,
    });

    return slot;
  }

  /**
   * Add multiple items at once
   */
  async addMultiple(
    sessionId: string,
    items: Array<{ type: SlotType; content: string; priority?: number }>
  ): Promise<WorkingMemorySlot[]> {
    const added: WorkingMemorySlot[] = [];

    for (const item of items) {
      const slot = await this.add(sessionId, item.type, item.content, item.priority);
      if (slot) {added.push(slot);}
    }

    return added;
  }

  /**
   * Activate a slot (when referenced/used)
   */
  async activate(sessionId: string, slotId: string): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state) {return;}

    const slot = state.slots.find(s => s.id === slotId);
    if (!slot) {return;}

    // Boost activation
    slot.activation = Math.min(1.0, slot.activation + 0.3);
    slot.lastAccessed = new Date();
    state.lastActivity = new Date();

    // Spreading activation to similar slots
    await this.spreadActivation(state, slot);
  }

  /**
   * Activate slot by content match
   */
  async activateByContent(sessionId: string, content: string): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state) {return;}

    const contentLower = content.toLowerCase();
    const matchingSlots = state.slots.filter(s =>
      s.content.toLowerCase().includes(contentLower) ||
      contentLower.includes(s.content.toLowerCase())
    );

    for (const slot of matchingSlots) {
      slot.activation = Math.min(1.0, slot.activation + 0.2);
      slot.lastAccessed = new Date();
    }

    state.lastActivity = new Date();
  }

  /**
   * Spread activation to semantically similar slots
   */
  private async spreadActivation(
    state: WorkingMemoryState,
    sourceSlot: WorkingMemorySlot
  ): Promise<void> {
    try {
      // Generate embedding for source if not cached
      if (!sourceSlot.embedding) {
        sourceSlot.embedding = await generateEmbedding(sourceSlot.content);
      }

      if (sourceSlot.embedding.length === 0) {return;}

      // Calculate similarity and spread activation
      for (const slot of state.slots) {
        if (slot.id === sourceSlot.id) {continue;}

        // Generate embedding if not cached
        if (!slot.embedding) {
          slot.embedding = await generateEmbedding(slot.content);
        }

        if (slot.embedding.length === 0) {continue;}

        const similarity = cosineSimilarity(sourceSlot.embedding, slot.embedding);

        if (similarity > CONFIG.SPREADING_THRESHOLD) {
          // Spread activation proportional to similarity
          const spreadAmount = similarity * CONFIG.SPREADING_FACTOR;
          slot.activation = Math.min(1.0, slot.activation + spreadAmount);

          logger.debug('Spreading activation', {
            from: sourceSlot.id,
            to: slot.id,
            similarity,
            newActivation: slot.activation,
          });
        }
      }
    } catch (error) {
      logger.debug('Failed to spread activation', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Remove a specific slot
   */
  remove(sessionId: string, slotId: string): boolean {
    const state = this.states.get(sessionId);
    if (!state) {return false;}

    const index = state.slots.findIndex(s => s.id === slotId);
    if (index === -1) {return false;}

    // Don't allow removing goal slots
    if (state.slots[index].type === 'goal') {
      logger.warn('Attempted to remove goal slot', { sessionId, slotId });
      return false;
    }

    state.slots.splice(index, 1);
    state.lastActivity = new Date();

    return true;
  }

  // ===========================================
  // Sub-Goals Management
  // ===========================================

  /**
   * Add a sub-goal
   */
  addSubGoal(sessionId: string, subGoal: string): void {
    const state = this.states.get(sessionId);
    if (!state) {return;}

    if (!state.subGoals.includes(subGoal)) {
      state.subGoals.push(subGoal);
      state.lastActivity = new Date();
    }
  }

  /**
   * Remove a sub-goal (mark as completed)
   */
  removeSubGoal(sessionId: string, subGoal: string): void {
    const state = this.states.get(sessionId);
    if (!state) {return;}

    const index = state.subGoals.indexOf(subGoal);
    if (index !== -1) {
      state.subGoals.splice(index, 1);
      state.lastActivity = new Date();
    }
  }

  // ===========================================
  // Decay & Eviction
  // ===========================================

  /**
   * Apply time-based decay to all slots
   */
  private applyDecay(state: WorkingMemoryState): void {
    const now = new Date();

    for (const slot of state.slots) {
      const secondsInactive = (now.getTime() - slot.lastAccessed.getTime()) / 1000;

      // Exponential decay
      const decay = Math.exp(-CONFIG.DECAY_RATE * secondsInactive);

      // Goals decay slower
      const decayMultiplier = slot.type === 'goal' ? 0.5 : 1.0;

      slot.activation = Math.max(
        CONFIG.MIN_ACTIVATION,
        slot.activation * Math.pow(decay, decayMultiplier)
      );
    }

    // Remove slots below minimum (except goals)
    state.slots = state.slots.filter(s =>
      s.type === 'goal' || s.activation >= CONFIG.MIN_ACTIVATION
    );
  }

  /**
   * Evict lowest priority/activation slot
   */
  private evictLowestSlot(state: WorkingMemoryState): void {
    // Find candidates (never evict goals)
    const candidates = state.slots.filter(s => s.type !== 'goal');

    if (candidates.length === 0) {return;}

    // Sort by activation * priority (lowest first)
    candidates.sort((a, b) =>
      (a.activation * a.priority) - (b.activation * b.priority)
    );

    const toEvict = candidates[0];

    logger.debug('Evicting slot from working memory', {
      sessionId: state.sessionId,
      slotId: toEvict.id,
      type: toEvict.type,
      activation: toEvict.activation,
    });

    state.slots = state.slots.filter(s => s.id !== toEvict.id);
  }

  /**
   * Evict oldest session when over capacity
   */
  private evictOldestSession(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, state] of this.states) {
      if (state.lastActivity.getTime() < oldestTime) {
        oldestTime = state.lastActivity.getTime();
        oldestId = id;
      }
    }

    if (oldestId) {
      this.states.delete(oldestId);
      logger.info('Evicted oldest working memory session', { sessionId: oldestId });
    }
  }

  // ===========================================
  // Context Generation
  // ===========================================

  /**
   * Generate context string for Claude system prompt
   */
  generateContextString(sessionId: string): string {
    const state = this.states.get(sessionId);
    if (!state) {return '';}

    // Apply decay first
    this.applyDecay(state);

    // Sort by activation * priority
    const sorted = [...state.slots].sort((a, b) =>
      (b.activation * b.priority) - (a.activation * a.priority)
    );

    const parts: string[] = [];

    // Current goal
    parts.push(`[AKTUELLES ZIEL]\n${state.currentGoal}`);

    // Sub-goals
    if (state.subGoals.length > 0) {
      parts.push(`[TEILZIELE]\n${state.subGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}`);
    }

    // Group by type
    const constraints = sorted.filter(s => s.type === 'constraint');
    const facts = sorted.filter(s => s.type === 'fact');
    const hypotheses = sorted.filter(s => s.type === 'hypothesis');
    const results = sorted.filter(s => s.type === 'intermediate_result');

    if (constraints.length > 0) {
      parts.push(`[CONSTRAINTS]\n${constraints.map(c => `- ${c.content}`).join('\n')}`);
    }

    if (facts.length > 0) {
      parts.push(`[RELEVANTE FAKTEN]\n${facts.map(f => `- ${f.content}`).join('\n')}`);
    }

    if (hypotheses.length > 0) {
      parts.push(`[HYPOTHESEN]\n${hypotheses.map(h => `- ${h.content}`).join('\n')}`);
    }

    if (results.length > 0) {
      parts.push(`[ZWISCHENERGEBNISSE]\n${results.map(r => `- ${r.content}`).join('\n')}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Get active slots sorted by relevance
   */
  getActiveSlots(sessionId: string): WorkingMemorySlot[] {
    const state = this.states.get(sessionId);
    if (!state) {return [];}

    this.applyDecay(state);

    return [...state.slots].sort((a, b) =>
      (b.activation * b.priority) - (a.activation * a.priority)
    );
  }

  // ===========================================
  // Persistence (Optional)
  // ===========================================

  /**
   * Persist working memory to database
   */
  async persist(sessionId: string): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state) {return;}

    try {
      await queryContext(
        state.context,
        `INSERT INTO working_memory_sessions
         (session_id, context, current_goal, sub_goals, slots, capacity, last_activity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (session_id) DO UPDATE SET
           current_goal = $3,
           sub_goals = $4,
           slots = $5,
           last_activity = $7`,
        [
          sessionId,
          state.context,
          state.currentGoal,
          state.subGoals,
          JSON.stringify(state.slots.map(s => ({
            id: s.id,
            type: s.type,
            content: s.content,
            priority: s.priority,
            activation: s.activation,
            addedAt: s.addedAt.toISOString(),
            lastAccessed: s.lastAccessed.toISOString(),
          }))),
          state.capacity,
          new Date(),
        ]
      );

      logger.debug('Working memory persisted', { sessionId });
    } catch (error) {
      logger.debug('Failed to persist working memory', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Load working memory from database
   */
  async load(sessionId: string, context: AIContext): Promise<WorkingMemoryState | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT * FROM working_memory_sessions
         WHERE session_id = $1
           AND last_activity > NOW() - INTERVAL '30 minutes'`,
        [sessionId]
      );

      if (result.rows.length === 0) {return null;}

      const row = result.rows[0] as Record<string, unknown>;

      /** Serialized slot structure from database */
      interface SerializedSlot {
        id: string;
        type: SlotType;
        content: string;
        priority: number;
        activation: number;
        addedAt: string;
        lastAccessed: string;
      }

      let slots: SerializedSlot[] = [];
      try {
        const parsed = JSON.parse((row.slots as string) || '[]') as unknown;
        if (!Array.isArray(parsed)) {
          logger.warn('Working memory slots is not an array, resetting', { sessionId });
          slots = [];
        } else {
          slots = parsed as SerializedSlot[];
        }
      } catch (parseError) {
        logger.warn('Failed to parse working memory slots, resetting', {
          sessionId,
          error: parseError instanceof Error ? parseError.message : 'Unknown',
        });
        slots = [];
      }

      const state: WorkingMemoryState = {
        sessionId: row.session_id as string,
        context: row.context as AIContext,
        currentGoal: row.current_goal as string,
        subGoals: (row.sub_goals as string[]) || [],
        capacity: (row.capacity as number) || CONFIG.DEFAULT_CAPACITY,
        slots: slots.map((s: SerializedSlot) => ({
          id: s.id,
          type: s.type,
          content: s.content,
          priority: s.priority,
          activation: s.activation,
          addedAt: new Date(s.addedAt),
          lastAccessed: new Date(s.lastAccessed),
        })),
        createdAt: new Date(row.created_at as string),
        lastActivity: new Date(row.last_activity as string),
      };

      this.states.set(sessionId, state);

      logger.debug('Working memory loaded from database', { sessionId });

      return state;
    } catch (error) {
      logger.debug('Failed to load working memory', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  // ===========================================
  // Cleanup
  // ===========================================

  /**
   * Clear a specific session
   */
  clear(sessionId: string): void {
    this.states.delete(sessionId);
    logger.debug('Working memory cleared', { sessionId });
  }

  /**
   * Start cleanup interval (skip in test env to prevent Jest handle leaks)
   */
  private startCleanupInterval(): void {
    if (process.env.NODE_ENV === 'test') {return;}
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Cleanup expired sessions with knowledge extraction
   *
   * Before deleting expired sessions, promotes high-activation slots
   * to long-term memory. This ensures valuable working memory insights
   * survive session expiry (WM → LT Pipeline).
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredStates: WorkingMemoryState[] = [];

    for (const [_id, state] of this.states) {
      if (now - state.lastActivity.getTime() > CONFIG.SESSION_TIMEOUT_MS) {
        expiredStates.push(state);
      }
    }

    // Extract knowledge before deletion (non-blocking)
    for (const state of expiredStates) {
      this.promoteToLongTerm(state).catch(error => {
        logger.debug('Failed to promote working memory to long-term', {
          sessionId: state.sessionId,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      });
      this.states.delete(state.sessionId);
    }

    if (expiredStates.length > 0) {
      logger.info('Cleaned up expired working memory sessions', { count: expiredStates.length });
    }
  }

  /**
   * Promote high-value Working Memory slots to Long-Term Memory
   *
   * Called when a session expires. Extracts slots with high activation
   * and priority as persistent facts so knowledge isn't lost.
   */
  private async promoteToLongTerm(state: WorkingMemoryState): Promise<number> {
    let promoted = 0;

    // Filter slots eligible for promotion
    const candidates = state.slots.filter(slot =>
      CONFIG.PROMOTABLE_TYPES.includes(slot.type) &&
      slot.activation >= CONFIG.PROMOTION_MIN_ACTIVATION &&
      slot.priority >= CONFIG.PROMOTION_MIN_PRIORITY
    );

    if (candidates.length === 0) {
      return 0;
    }

    for (const slot of candidates) {
      try {
        const factType = CONFIG.SLOT_TO_FACT_TYPE[slot.type] || 'knowledge';
        // Confidence derived from activation * priority (both 0-1)
        const confidence = Math.min(0.9, slot.activation * slot.priority);

        await longTermMemory.addFact(state.context, {
          factType: factType as 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context',
          content: slot.content,
          confidence,
          source: 'inferred' as const,
        });

        promoted++;
      } catch (error) {
        logger.debug('Failed to promote slot to long-term memory', {
          slotId: slot.id,
          slotType: slot.type,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    if (promoted > 0) {
      logger.info('Promoted working memory slots to long-term', {
        sessionId: state.sessionId,
        context: state.context,
        promoted,
        candidates: candidates.length,
      });
    }

    return promoted;
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ===========================================
  // Statistics
  // ===========================================

  /**
   * Get statistics
   */
  getStats(): {
    activeSessions: number;
    totalSlots: number;
    avgSlotsPerSession: number;
  } {
    let totalSlots = 0;
    for (const state of this.states.values()) {
      totalSlots += state.slots.length;
    }

    return {
      activeSessions: this.states.size,
      totalSlots,
      avgSlotsPerSession: this.states.size > 0
        ? Math.round(totalSlots / this.states.size * 10) / 10
        : 0,
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const workingMemory = new WorkingMemoryService();
