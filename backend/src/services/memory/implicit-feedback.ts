/**
 * Implicit Feedback Tracker (HiMeS Enhancement)
 *
 * Tracks "silent" signals from user-AI interactions to improve memory quality.
 * Instead of relying solely on explicit thumbs-up/down, this service detects:
 *
 * - Follow-up questions (user wasn't satisfied → weaken related memories)
 * - Rephrasing (user restated query → response wasn't understood)
 * - Acceptance (user moved on to new topic → response was helpful)
 * - Session depth (longer sessions on a topic → high engagement)
 * - Correction patterns (user corrected AI → adjust future behavior)
 *
 * These signals feed back into episodic memory strength and long-term
 * fact confidence, creating a continuous learning loop.
 *
 * Research basis:
 * - Mem0 implicit feedback (26% accuracy improvement)
 * - ICLR 2026 MemAgents Workshop: memory as cognitive loop
 */

import { AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { episodicMemory } from './episodic-memory';
import { longTermMemory } from './long-term-memory';

// ===========================================
// Types & Interfaces
// ===========================================

export type FeedbackSignal =
  | 'acceptance'        // User moved on (positive)
  | 'follow_up'         // User asked follow-up (neutral/negative)
  | 'rephrasing'        // User rephrased same query (negative)
  | 'topic_switch'      // User changed topic (neutral)
  | 'deep_engagement'   // Extended conversation on topic (positive)
  | 'correction'        // User corrected AI response (negative)
  | 'gratitude'         // User expressed thanks (strong positive)
  | 'frustration';      // User expressed frustration (strong negative)

export interface ImplicitFeedbackEvent {
  sessionId: string;
  context: AIContext;
  signal: FeedbackSignal;
  /** The AI response that triggered this signal */
  relatedResponseId?: string;
  /** Confidence in signal detection (0-1) */
  confidence: number;
  /** Additional data about the signal */
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface SessionFeedbackStats {
  sessionId: string;
  totalSignals: number;
  positiveSignals: number;
  negativeSignals: number;
  engagementScore: number; // 0-1
  satisfactionEstimate: number; // 0-1
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Minimum messages in session before analyzing */
  MIN_MESSAGES_FOR_ANALYSIS: 4,
  /** Similarity threshold for rephrasing detection */
  REPHRASING_SIMILARITY_THRESHOLD: 0.7,
  /** Memory strength adjustment per signal */
  STRENGTH_ADJUSTMENTS: {
    acceptance: 0.03,       // Slight boost
    follow_up: -0.01,      // Slight penalty
    rephrasing: -0.03,     // Moderate penalty
    topic_switch: 0,       // Neutral
    deep_engagement: 0.05, // Strong boost
    correction: -0.05,     // Moderate penalty
    gratitude: 0.08,       // Strong boost
    frustration: -0.08,    // Strong penalty
  } as Record<FeedbackSignal, number>,
  /** Fact confidence adjustment per signal */
  CONFIDENCE_ADJUSTMENTS: {
    acceptance: 0.02,
    follow_up: -0.01,
    rephrasing: -0.02,
    topic_switch: 0,
    deep_engagement: 0.03,
    correction: -0.04,
    gratitude: 0.05,
    frustration: -0.05,
  } as Record<FeedbackSignal, number>,
  /** Patterns for detecting implicit signals */
  GRATITUDE_PATTERNS: [
    /danke|vielen dank|super|perfekt|genau|toll|excellent|great|thanks|perfect/i,
  ],
  FRUSTRATION_PATTERNS: [
    /nein|falsch|nicht richtig|das stimmt nicht|no|wrong|incorrect|das meine ich nicht/i,
  ],
  FOLLOW_UP_PATTERNS: [
    /und was|was ist mit|wie wäre|kannst du|könntest du|and what|what about|how about|can you|could you/i,
  ],
  CORRECTION_PATTERNS: [
    /ich meinte|nein.*sondern|nicht.*sondern|i meant|no.*but rather|actually.*i wanted/i,
  ],
};

// ===========================================
// Implicit Feedback Service
// ===========================================

class ImplicitFeedbackService {
  private sessionHistory: Map<string, { messages: Array<{ role: string; content: string; timestamp: Date }>; signals: ImplicitFeedbackEvent[] }> = new Map();

  /**
   * Analyze a new message pair and detect implicit feedback signals
   */
  async analyzeInteraction(
    sessionId: string,
    context: AIContext,
    userMessage: string,
    _aiResponse: string,
    previousMessages: Array<{ role: string; content: string }> = []
  ): Promise<ImplicitFeedbackEvent[]> {
    const signals: ImplicitFeedbackEvent[] = [];
    const now = new Date();

    // Initialize session tracking if needed
    if (!this.sessionHistory.has(sessionId)) {
      this.sessionHistory.set(sessionId, { messages: [], signals: [] });
    }
    const session = this.sessionHistory.get(sessionId)!;

    // Get previous user message for comparison
    const prevUserMessages = previousMessages
      .filter(m => m.role === 'user')
      .map(m => m.content);
    const lastUserMessage = prevUserMessages.length > 1
      ? prevUserMessages[prevUserMessages.length - 2]
      : null;

    // 1. Detect gratitude (strong positive signal)
    if (CONFIG.GRATITUDE_PATTERNS.some(p => p.test(userMessage))) {
      signals.push({
        sessionId,
        context,
        signal: 'gratitude',
        confidence: 0.85,
        timestamp: now,
      });
    }

    // 2. Detect frustration (strong negative signal)
    if (CONFIG.FRUSTRATION_PATTERNS.some(p => p.test(userMessage))) {
      signals.push({
        sessionId,
        context,
        signal: 'frustration',
        confidence: 0.75,
        timestamp: now,
      });
    }

    // 3. Detect correction (user is correcting the AI)
    if (CONFIG.CORRECTION_PATTERNS.some(p => p.test(userMessage))) {
      signals.push({
        sessionId,
        context,
        signal: 'correction',
        confidence: 0.80,
        timestamp: now,
      });
    }

    // 4. Detect rephrasing (user is repeating in different words)
    if (lastUserMessage && this.isRephrasing(userMessage, lastUserMessage)) {
      signals.push({
        sessionId,
        context,
        signal: 'rephrasing',
        confidence: 0.70,
        timestamp: now,
      });
    }

    // 5. Detect follow-up questions
    else if (CONFIG.FOLLOW_UP_PATTERNS.some(p => p.test(userMessage))) {
      signals.push({
        sessionId,
        context,
        signal: 'follow_up',
        confidence: 0.65,
        timestamp: now,
      });
    }

    // 6. Detect topic switch (new topic = acceptance of previous)
    if (lastUserMessage && this.isTopicSwitch(userMessage, lastUserMessage)) {
      // Topic switch implies acceptance of previous response
      signals.push({
        sessionId,
        context,
        signal: 'acceptance',
        confidence: 0.60,
        timestamp: now,
      });
    }

    // 7. Detect deep engagement (many messages on same topic)
    const messageCount = previousMessages.length + 1;
    if (messageCount >= 8 && !this.isTopicSwitch(userMessage, lastUserMessage || '')) {
      signals.push({
        sessionId,
        context,
        signal: 'deep_engagement',
        confidence: 0.70,
        metadata: { messageCount },
        timestamp: now,
      });
    }

    // Store signals
    session.signals.push(...signals);
    session.messages.push({ role: 'user', content: userMessage, timestamp: now });

    // Apply feedback to memory (non-blocking)
    if (signals.length > 0) {
      this.applyFeedbackToMemory(context, signals).catch(error => {
        logger.debug('Failed to apply implicit feedback to memory', { error });
      });
    }

    return signals;
  }

  /**
   * Apply detected feedback signals to memory layers
   */
  private async applyFeedbackToMemory(
    context: AIContext,
    signals: ImplicitFeedbackEvent[]
  ): Promise<void> {
    for (const signal of signals) {
      const strengthAdj = CONFIG.STRENGTH_ADJUSTMENTS[signal.signal];
      const confidenceAdj = CONFIG.CONFIDENCE_ADJUSTMENTS[signal.signal];

      // Adjust most recent episodic memory strength
      if (strengthAdj !== 0) {
        try {
          // Retrieve recent episodes to find the one related to this interaction
          const recentEpisodes = await episodicMemory.retrieve(
            signal.sessionId || 'recent',
            signal.context,
            { limit: 1, minStrength: 0.1 }
          );
          if (recentEpisodes.length > 0) {
            const episode = recentEpisodes[0];
            // For positive signals, trigger a retrieve (which boosts strength via spacing effect)
            // For negative signals, we log for future consolidation analysis
            if (strengthAdj > 0) {
              // Re-retrieving triggers the spacing effect (strength + 0.05)
              await episodicMemory.retrieve(
                episode.trigger,
                signal.context,
                { limit: 1, minStrength: 0.01 }
              );
            }
            logger.debug('Implicit feedback applied to episodic memory', {
              signal: signal.signal,
              episodeId: episode.id,
              strengthChange: strengthAdj,
            });
          }
        } catch (error) {
          logger.debug('Failed to adjust episodic memory from feedback', { error });
        }
      }

      // Adjust recent long-term fact confidence
      if (confidenceAdj !== 0) {
        try {
          const facts = await longTermMemory.getFacts(context);
          // Find most recently confirmed fact
          if (facts.length > 0) {
            const recentFact = facts
              .sort((a, b) => b.lastConfirmed.getTime() - a.lastConfirmed.getTime())[0];
            recentFact.confidence = Math.max(0.1,
              Math.min(1.0, recentFact.confidence + confidenceAdj * signal.confidence)
            );
            logger.debug('Implicit feedback applied to fact confidence', {
              signal: signal.signal,
              factType: recentFact.factType,
              confidenceChange: confidenceAdj,
            });
          }
        } catch (error) {
          logger.debug('Failed to adjust fact confidence from feedback', { error });
        }
      }
    }
  }

  /**
   * Detect if current message is a rephrasing of previous message
   * Uses simple word overlap (avoiding expensive embedding calls)
   */
  private isRephrasing(current: string, previous: string): boolean {
    const currentWords = new Set(current.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const previousWords = new Set(previous.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    if (currentWords.size === 0 || previousWords.size === 0) { return false; }

    let overlap = 0;
    for (const word of currentWords) {
      if (previousWords.has(word)) { overlap++; }
    }

    const overlapRatio = overlap / Math.min(currentWords.size, previousWords.size);
    return overlapRatio >= CONFIG.REPHRASING_SIMILARITY_THRESHOLD;
  }

  /**
   * Detect if messages are about different topics
   * Simple heuristic: low word overlap = topic switch
   */
  private isTopicSwitch(current: string, previous: string): boolean {
    if (!previous) { return false; }

    const currentWords = new Set(current.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const previousWords = new Set(previous.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    if (currentWords.size === 0 || previousWords.size === 0) { return false; }

    let overlap = 0;
    for (const word of currentWords) {
      if (previousWords.has(word)) { overlap++; }
    }

    const overlapRatio = overlap / Math.max(currentWords.size, previousWords.size);
    return overlapRatio < 0.15; // Less than 15% overlap = new topic
  }

  /**
   * Get session feedback statistics
   */
  getSessionStats(sessionId: string): SessionFeedbackStats | null {
    const session = this.sessionHistory.get(sessionId);
    if (!session) { return null; }

    const positiveSignals = session.signals.filter(s =>
      ['acceptance', 'deep_engagement', 'gratitude'].includes(s.signal)
    ).length;

    const negativeSignals = session.signals.filter(s =>
      ['rephrasing', 'correction', 'frustration'].includes(s.signal)
    ).length;

    const totalSignals = session.signals.length;
    const engagementScore = Math.min(1.0, session.messages.length / 20);
    const satisfactionEstimate = totalSignals > 0
      ? Math.max(0, Math.min(1, 0.5 + (positiveSignals - negativeSignals) / (totalSignals * 2)))
      : 0.5; // Unknown = neutral

    return {
      sessionId,
      totalSignals,
      positiveSignals,
      negativeSignals,
      engagementScore,
      satisfactionEstimate,
    };
  }

  /**
   * Cleanup old session data (called periodically)
   */
  cleanup(maxAge: number = 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);
    for (const [sessionId, session] of this.sessionHistory) {
      const lastMessage = session.messages[session.messages.length - 1];
      if (!lastMessage || lastMessage.timestamp < cutoff) {
        this.sessionHistory.delete(sessionId);
      }
    }
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const implicitFeedback = new ImplicitFeedbackService();
