/**
 * MetacognitiveMonitor — Bias Detection, Urgency Encoding, Novelty Windows,
 *                         and Efficiency Tracking
 *
 * Monitors user interaction patterns to detect cognitive biases (confirmation
 * bias, positivity bias, recency bias), urgency-driven encoding needs, and
 * novelty-proximity windows triggered by high prediction error. Also tracks
 * system efficiency trends over time.
 *
 * Biological analogs:
 *   - Anterior Cingulate Cortex (ACC): conflict monitoring, error detection
 *   - Locus Coeruleus (LC): urgency → norepinephrine → encoding boost
 *   - Dopaminergic surprise signal: prediction error → novelty window
 *
 * All data is in-memory (sliding windows, no DB dependency).
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

import { logger } from '../../utils/logger';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface BiasMetrics {
  positiveAcceptanceRate: number;   // % of positive suggestions accepted
  negativeAcceptanceRate: number;   // % of negative/critical suggestions accepted
  asymmetryScore: number;           // |positive - negative| rate
  confirmationBiasScore: number;    // How often user seeks confirming info
  recencyBias: number;              // Over-weighting of recent vs. historical
}

export interface EfficiencyTrend {
  date: string;           // ISO date (YYYY-MM-DD)
  avgTokensUsed: number;
  retrievalPrecision: number;
  predictionAccuracy: number;
  qualityScore: number;
}

export interface UrgencyResult {
  urgencyLevel: number;   // 0-1
  encodingBoost: number;  // 0-0.2
}

export interface Message {
  content: string;
  timestamp: Date;
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface AcceptanceEvent {
  suggestionType: string;  // 'positive', 'negative', 'confirming', 'contradicting'
  accepted: boolean;
  timestamp: number;       // epoch ms
}

interface NoveltyWindow {
  openedAt: number;        // epoch ms
  predictionError: number;
}

interface EfficiencyEntry {
  tokens: number;
  precision: number;
  quality: number;
}

interface BiasSuggestion {
  type: 'metacognitive_bias_alert';
  title: string;
  description: string;
  priority: number;
}

interface EfficiencyBadge {
  type: 'metacognitive_efficiency_badge';
  title: string;
  description: string;
  priority: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Sliding window for acceptance tracking */
const WINDOW_DAYS = 30;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Recent window for recency bias computation */
const RECENT_DAYS = 7;
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;

/** Novelty window duration (10 minutes) */
const NOVELTY_WINDOW_MS = 10 * 60 * 1000;

/** Maximum novelty boost */
const MAX_NOVELTY_BOOST = 0.2;

/** Efficiency log retention (365 days) */
const EFFICIENCY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

/** Prediction error threshold for opening novelty window */
const PE_THRESHOLD = 0.7;

/** Maximum encoding boost from urgency */
const MAX_ENCODING_BOOST = 0.2;

/** Urgency keywords (German and English) */
const URGENCY_KEYWORDS = [
  'dringend', 'asap', 'deadline', 'bis morgen', 'sofort',
  'urgent', 'eilig',
];

/** Messages per minute threshold for frequency-based urgency */
const RAPID_MSG_THRESHOLD = 3;

/** Short message threshold (chars) */
const SHORT_MSG_THRESHOLD = 50;

/** Asymmetry threshold for bias alert */
const ASYMMETRY_ALERT_THRESHOLD = 0.3;

/** Efficiency improvement threshold (10%) */
const EFFICIENCY_IMPROVEMENT_THRESHOLD = 0.1;

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeKey(userId: string, context: string): string {
  return `${userId}::${context}`;
}

// ─── MetacognitiveMonitor ───────────────────────────────────────────────────

export class MetacognitiveMonitor {
  private available = true;
  private enabled = true;

  /**
   * Enable or disable the monitor.
   * When disabled, all tracking becomes a no-op and queries return defaults (ablation mode).
   */
  setEnabled(flag: boolean): void {
    this.enabled = flag;
    if (!flag) {
      logger.info('[MetacognitiveMonitor] Disabled (ablation mode)');
    }
  }

  /** userId::context → acceptance events */
  private acceptanceLog = new Map<string, AcceptanceEvent[]>();

  /** userId::context → novelty window */
  private noveltyWindows = new Map<string, NoveltyWindow>();

  /** userId::context → date → efficiency entries */
  private efficiencyLog = new Map<string, Map<string, EfficiencyEntry[]>>();

  // ─── Acceptance Tracking ────────────────────────────────────────────────

  /**
   * Records an acceptance/rejection event for bias tracking.
   */
  trackAcceptance(
    userId: string,
    context: string,
    suggestionType: string,
    accepted: boolean,
  ): void {
    this.trackAcceptanceWithTimestamp(userId, context, suggestionType, accepted, Date.now());
  }

  /**
   * Records an acceptance event with a specific timestamp (for testing / backfill).
   */
  trackAcceptanceWithTimestamp(
    userId: string,
    context: string,
    suggestionType: string,
    accepted: boolean,
    timestamp: number,
  ): void {
    if (!this.available || !this.enabled) return;

    const key = makeKey(userId, context);
    if (!this.acceptanceLog.has(key)) {
      this.acceptanceLog.set(key, []);
    }
    this.acceptanceLog.get(key)!.push({ suggestionType, accepted, timestamp });

    // Lazy prune: remove events older than 30 days for this key
    const cutoff = timestamp - WINDOW_MS;
    const events = this.acceptanceLog.get(key)!;
    const pruned = events.filter(e => e.timestamp >= cutoff);
    if (pruned.length === 0) {
      this.acceptanceLog.delete(key);
    } else {
      this.acceptanceLog.set(key, pruned);
    }
  }

  /**
   * Computes bias metrics from the 30-day sliding window.
   */
  computeBiasMetrics(userId: string, context: string): BiasMetrics {
    return this.computeBiasMetricsAt(userId, context, Date.now());
  }

  /**
   * Computes bias metrics at a specific timestamp (for testing / determinism).
   */
  computeBiasMetricsAt(userId: string, context: string, now: number): BiasMetrics {
    const key = makeKey(userId, context);
    const events = this.acceptanceLog.get(key);
    if (!events || events.length === 0) {
      return {
        positiveAcceptanceRate: 0,
        negativeAcceptanceRate: 0,
        asymmetryScore: 0,
        confirmationBiasScore: 0,
        recencyBias: 0,
      };
    }

    const cutoff = now - WINDOW_MS;
    const recentCutoff = now - RECENT_MS;

    // Filter to 30-day window
    const windowEvents = events.filter(e => e.timestamp >= cutoff);
    if (windowEvents.length === 0) {
      return {
        positiveAcceptanceRate: 0,
        negativeAcceptanceRate: 0,
        asymmetryScore: 0,
        confirmationBiasScore: 0,
        recencyBias: 0,
      };
    }

    // Positive/negative acceptance rates
    const positiveEvents = windowEvents.filter(e => e.suggestionType === 'positive');
    const negativeEvents = windowEvents.filter(e => e.suggestionType === 'negative');

    const positiveAcceptanceRate = positiveEvents.length > 0
      ? positiveEvents.filter(e => e.accepted).length / positiveEvents.length
      : 0;
    const negativeAcceptanceRate = negativeEvents.length > 0
      ? negativeEvents.filter(e => e.accepted).length / negativeEvents.length
      : 0;

    const asymmetryScore = Math.abs(positiveAcceptanceRate - negativeAcceptanceRate);

    // Confirmation bias: ratio of confirming vs contradicting info sought
    const confirmingEvents = windowEvents.filter(e => e.suggestionType === 'confirming');
    const contradictingEvents = windowEvents.filter(e => e.suggestionType === 'contradicting');
    const totalInfoEvents = confirmingEvents.length + contradictingEvents.length;
    const confirmationBiasScore = totalInfoEvents > 0
      ? confirmingEvents.length / totalInfoEvents
      : 0;

    // Recency bias: acceptance rate in last 7 days vs full 30 days
    // Pure behavioral divergence — how different recent behavior is from older behavior
    const recentEvents = windowEvents.filter(e => e.timestamp >= recentCutoff);
    const olderEvents = windowEvents.filter(e => e.timestamp < recentCutoff);

    let recencyBias = 0;
    if (recentEvents.length > 0 && olderEvents.length > 0) {
      const recentAcceptRate = recentEvents.filter(e => e.accepted).length / recentEvents.length;
      const olderAcceptRate = olderEvents.filter(e => e.accepted).length / olderEvents.length;

      // Recency bias is pure behavioral divergence: how different recent is from older
      if (olderAcceptRate > 0) {
        recencyBias = clamp(Math.abs(recentAcceptRate - olderAcceptRate), 0, 1);
      } else {
        recencyBias = clamp(recentAcceptRate, 0, 1);
      }
    }

    return {
      positiveAcceptanceRate,
      negativeAcceptanceRate,
      asymmetryScore,
      confirmationBiasScore,
      recencyBias,
    };
  }

  // ─── Urgency Detection ─────────────────────────────────────────────────

  /**
   * Detects urgency from message patterns: frequency, length, keywords.
   */
  detectUrgency(messages: Message[]): UrgencyResult {
    if (!this.available || !this.enabled || messages.length === 0) {
      return { urgencyLevel: 0, encodingBoost: 0 };
    }

    let frequencySignal = 0;
    let brevitySignal = 0;
    let keywordSignal = 0;

    // Frequency: messages per minute in the last minute
    if (messages.length >= 2) {
      const sorted = [...messages].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
      const first = sorted[0].timestamp.getTime();
      const last = sorted[sorted.length - 1].timestamp.getTime();
      const spanMinutes = (last - first) / 60000;

      if (spanMinutes > 0) {
        const msgsPerMinute = messages.length / spanMinutes;
        frequencySignal = clamp(msgsPerMinute / (RAPID_MSG_THRESHOLD * 2), 0, 1);
      }
    }

    // Brevity: average message length
    const avgLength = messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;
    if (avgLength < SHORT_MSG_THRESHOLD) {
      brevitySignal = clamp(1 - avgLength / SHORT_MSG_THRESHOLD, 0, 1);
    }

    // Keywords
    const allContent = messages.map(m => m.content.toLowerCase()).join(' ');
    const keywordHits = URGENCY_KEYWORDS.filter(kw => allContent.includes(kw)).length;
    keywordSignal = clamp(keywordHits / 3, 0, 1); // 3 keywords = max signal

    // Combine signals: frequency 40%, keywords 35%, brevity 25%
    const urgencyLevel = clamp(
      0.4 * frequencySignal + 0.35 * keywordSignal + 0.25 * brevitySignal,
      0,
      1,
    );

    const encodingBoost = clamp(urgencyLevel * MAX_ENCODING_BOOST, 0, MAX_ENCODING_BOOST);

    return { urgencyLevel, encodingBoost };
  }

  // ─── Novelty-Proximity Boost ────────────────────────────────────────────

  /**
   * Opens a 10-minute novelty window if prediction error exceeds threshold.
   */
  openNoveltyWindow(
    userId: string,
    context: string,
    predictionError: number,
  ): void {
    this.openNoveltyWindowAt(userId, context, predictionError, Date.now());
  }

  /**
   * Opens a novelty window at a specific time (for testing).
   */
  openNoveltyWindowAt(
    userId: string,
    context: string,
    predictionError: number,
    timestamp: number,
  ): void {
    if (!this.available || !this.enabled) return;
    if (predictionError <= PE_THRESHOLD) return;

    const key = makeKey(userId, context);
    this.noveltyWindows.set(key, {
      openedAt: timestamp,
      predictionError,
    });

    // Lazy sweep: delete any expired windows encountered during write
    for (const [k, w] of this.noveltyWindows.entries()) {
      if (timestamp - w.openedAt >= NOVELTY_WINDOW_MS) {
        this.noveltyWindows.delete(k);
      }
    }
  }

  /**
   * Returns current novelty boost (0-0.2), with linear decay over 10 min.
   */
  getNoveltyBoost(userId: string, context: string): number {
    return this.getNoveltyBoostAt(userId, context, Date.now());
  }

  /**
   * Returns novelty boost at a specific time (for testing).
   */
  getNoveltyBoostAt(userId: string, context: string, now: number): number {
    const key = makeKey(userId, context);
    const window = this.noveltyWindows.get(key);
    if (!window) return 0;

    const elapsed = now - window.openedAt;
    if (elapsed >= NOVELTY_WINDOW_MS) {
      this.noveltyWindows.delete(key);
      return 0;
    }

    // Linear decay: full boost at t=0, zero at t=NOVELTY_WINDOW_MS
    const remaining = 1 - elapsed / NOVELTY_WINDOW_MS;
    return clamp(remaining * MAX_NOVELTY_BOOST, 0, MAX_NOVELTY_BOOST);
  }

  // ─── Efficiency Tracking ────────────────────────────────────────────────

  /**
   * Records a daily efficiency data point (uses today's date).
   */
  trackEfficiency(
    userId: string,
    context: string,
    tokens: number,
    precision: number,
    quality: number,
  ): void {
    const date = new Date().toISOString().split('T')[0];
    this.trackEfficiencyForDate(userId, context, date, tokens, precision, quality);
  }

  /**
   * Records an efficiency data point for a specific date (for testing / backfill).
   */
  trackEfficiencyForDate(
    userId: string,
    context: string,
    date: string,
    tokens: number,
    precision: number,
    quality: number,
  ): void {
    if (!this.available || !this.enabled) return;

    const key = makeKey(userId, context);
    if (!this.efficiencyLog.has(key)) {
      this.efficiencyLog.set(key, new Map());
    }
    const dateMap = this.efficiencyLog.get(key)!;
    if (!dateMap.has(date)) {
      dateMap.set(date, []);
    }
    dateMap.get(date)!.push({ tokens, precision, quality });

    // Lazy prune: remove entries older than 365 days for this key
    const retentionCutoff = new Date(Date.now() - EFFICIENCY_RETENTION_MS).toISOString().split('T')[0];
    for (const [d] of dateMap.entries()) {
      if (d < retentionCutoff) {
        dateMap.delete(d);
      }
    }
    if (dateMap.size === 0) {
      this.efficiencyLog.delete(key);
    }
  }

  /**
   * Returns efficiency trend for the last N days, sorted by date ascending.
   */
  getEfficiencyTrend(userId: string, context: string, days: number): EfficiencyTrend[] {
    const key = makeKey(userId, context);
    const dateMap = this.efficiencyLog.get(key);
    if (!dateMap) return [];

    const now = Date.now();
    const cutoff = new Date(now - (days - 1) * 86400000).toISOString().split('T')[0];

    const result: EfficiencyTrend[] = [];
    for (const [date, entries] of dateMap.entries()) {
      if (date < cutoff) continue;

      const avgTokens = entries.reduce((s, e) => s + e.tokens, 0) / entries.length;
      const avgPrecision = entries.reduce((s, e) => s + e.precision, 0) / entries.length;
      const avgQuality = entries.reduce((s, e) => s + e.quality, 0) / entries.length;

      result.push({
        date,
        avgTokensUsed: avgTokens,
        retrievalPrecision: avgPrecision,
        predictionAccuracy: avgPrecision, // proxy: retrieval precision ≈ prediction accuracy
        qualityScore: avgQuality,
      });
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ─── SmartSuggestion Integration ────────────────────────────────────────

  /**
   * Generates a bias alert suggestion when asymmetry exceeds threshold.
   * Accepts optional `now` for deterministic testing.
   */
  generateBiasAlert(userId: string, context: string, now?: number): BiasSuggestion | null {
    const metrics = this.computeBiasMetricsAt(userId, context, now ?? Date.now());
    if (metrics.asymmetryScore <= ASYMMETRY_ALERT_THRESHOLD) return null;

    const posRate = Math.round(metrics.positiveAcceptanceRate * 100);
    const negRate = Math.round(metrics.negativeAcceptanceRate * 100);

    return {
      type: 'metacognitive_bias_alert',
      title: 'Kognitive Balance-Warnung',
      description: `In den letzten 30 Tagen hast du ${posRate}% der positiven Prognosen akzeptiert, aber nur ${negRate}% der kritischen Hinweise. Möchtest du eine ausgewogenere Perspektive einbeziehen?`,
      priority: 80,
    };
  }

  /**
   * Generates an efficiency badge when recent efficiency improves >=10% over older.
   * Accepts optional `now` for deterministic testing.
   */
  generateEfficiencyBadge(userId: string, context: string, now?: number): EfficiencyBadge | null {
    // Compare last 7 days vs 90+ days ago
    const allTrend = this.getEfficiencyTrend(userId, context, 365);
    if (allTrend.length < 2) return null;

    const ts = now ?? Date.now();
    const recentCutoff = new Date(ts - 7 * 86400000).toISOString().split('T')[0];
    const oldCutoff = new Date(ts - 90 * 86400000).toISOString().split('T')[0];

    const recentEntries = allTrend.filter(e => e.date >= recentCutoff);
    const oldEntries = allTrend.filter(e => e.date < oldCutoff);

    if (recentEntries.length === 0 || oldEntries.length === 0) return null;

    const recentAvgTokens = recentEntries.reduce((s, e) => s + e.avgTokensUsed, 0) / recentEntries.length;
    const oldAvgTokens = oldEntries.reduce((s, e) => s + e.avgTokensUsed, 0) / oldEntries.length;

    if (oldAvgTokens === 0) return null;

    const improvement = (oldAvgTokens - recentAvgTokens) / oldAvgTokens;
    if (improvement < EFFICIENCY_IMPROVEMENT_THRESHOLD) return null;

    const improvementPct = Math.round(improvement * 100);

    return {
      type: 'metacognitive_efficiency_badge',
      title: 'Effizienz-Verbesserung',
      description: `Dein ZenAI nutzt jetzt ${improvementPct}% weniger Kontextfenster für gleiche Antwortqualität als vor 3 Monaten.`,
      priority: 60,
    };
  }
}

// ─── Singleton Export ───────────────────────────────────────────────────────

export const metacognitiveMonitor = new MetacognitiveMonitor();
