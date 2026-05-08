/**
 * Unit Tests for MetacognitiveMonitor
 *
 * Tracks cognitive biases, urgency signals, novelty-proximity windows,
 * and system efficiency trends. All data is in-memory (sliding windows).
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

import {
  MetacognitiveMonitor,
  metacognitiveMonitor,
  type BiasMetrics,
  type Message,
} from '../../../../services/memory/metacognitive-monitor';

describe('MetacognitiveMonitor', () => {
  let monitor: MetacognitiveMonitor;

  beforeEach(() => {
    monitor = new MetacognitiveMonitor();
  });

  // =========================================================
  // Bias Detection (10 tests)
  // =========================================================

  describe('Bias Detection', () => {
    it('trackAcceptance stores events correctly', () => {
      monitor.trackAcceptance('u1', 'operations', 'positive', true);
      monitor.trackAcceptance('u1', 'operations', 'positive', false);
      monitor.trackAcceptance('u1', 'operations', 'negative', true);

      const metrics = monitor.computeBiasMetrics('u1', 'operations');
      // 2 positive events, 1 negative event — we can verify rates
      expect(metrics.positiveAcceptanceRate).toBeCloseTo(0.5); // 1 accepted / 2 total
      expect(metrics.negativeAcceptanceRate).toBeCloseTo(1.0); // 1 accepted / 1 total
    });

    it('computeBiasMetrics with no data returns zeroes', () => {
      const metrics = monitor.computeBiasMetrics('unknown', 'operations');
      expect(metrics.positiveAcceptanceRate).toBe(0);
      expect(metrics.negativeAcceptanceRate).toBe(0);
      expect(metrics.asymmetryScore).toBe(0);
      expect(metrics.confirmationBiasScore).toBe(0);
      expect(metrics.recencyBias).toBe(0);
    });

    it('computeBiasMetrics with all positive accepted returns high positiveAcceptanceRate', () => {
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptance('u1', 'operations', 'positive', true);
      }
      const metrics = monitor.computeBiasMetrics('u1', 'operations');
      expect(metrics.positiveAcceptanceRate).toBe(1.0);
    });

    it('computeBiasMetrics with mixed acceptance returns correct asymmetryScore', () => {
      // 8/10 positive accepted = 0.8 rate
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptance('u1', 'finance', 'positive', i < 8);
      }
      // 3/10 negative accepted = 0.3 rate
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptance('u1', 'finance', 'negative', i < 3);
      }
      const metrics = monitor.computeBiasMetrics('u1', 'finance');
      expect(metrics.positiveAcceptanceRate).toBeCloseTo(0.8);
      expect(metrics.negativeAcceptanceRate).toBeCloseTo(0.3);
      expect(metrics.asymmetryScore).toBeCloseTo(0.5); // |0.8 - 0.3|
    });

    it('detects asymmetryScore > 0.3', () => {
      // All positive accepted, no negative accepted
      for (let i = 0; i < 5; i++) {
        monitor.trackAcceptance('u1', 'operations', 'positive', true);
        monitor.trackAcceptance('u1', 'operations', 'negative', false);
      }
      const metrics = monitor.computeBiasMetrics('u1', 'operations');
      expect(metrics.asymmetryScore).toBeGreaterThan(0.3);
    });

    it('computes confirmationBiasScore correctly', () => {
      // Track confirming and contradicting info seeking
      for (let i = 0; i < 8; i++) {
        monitor.trackAcceptance('u1', 'operations', 'confirming', true);
      }
      for (let i = 0; i < 2; i++) {
        monitor.trackAcceptance('u1', 'operations', 'contradicting', true);
      }
      const metrics = monitor.computeBiasMetrics('u1', 'operations');
      // 8 confirming / (8 confirming + 2 contradicting) = 0.8
      expect(metrics.confirmationBiasScore).toBeCloseTo(0.8);
    });

    it('recencyBias: recent events weighted higher', () => {
      const now = Date.now();
      // Add old events (20 days ago) — mostly rejected
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptanceWithTimestamp('u1', 'operations', 'positive', false, now - 20 * 86400000);
      }
      // Add recent events (2 days ago) — mostly accepted
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptanceWithTimestamp('u1', 'operations', 'positive', true, now - 2 * 86400000);
      }
      const metrics = monitor.computeBiasMetrics('u1', 'operations');
      // Recent acceptance rate (last 7 days) = 1.0, overall = 0.5
      // recencyBias = recent rate / overall rate when both > 0
      expect(metrics.recencyBias).toBeGreaterThan(0.5);
    });

    it('30-day window: old events excluded', () => {
      const now = Date.now();
      // Add events 40 days ago — should be excluded
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptanceWithTimestamp('u1', 'operations', 'positive', true, now - 40 * 86400000);
      }
      const metrics = monitor.computeBiasMetrics('u1', 'operations');
      // All events are outside 30-day window → zeroes
      expect(metrics.positiveAcceptanceRate).toBe(0);
    });

    it('multiple users isolated', () => {
      monitor.trackAcceptance('u1', 'operations', 'positive', true);
      monitor.trackAcceptance('u2', 'operations', 'positive', false);

      const m1 = monitor.computeBiasMetrics('u1', 'operations');
      const m2 = monitor.computeBiasMetrics('u2', 'operations');

      expect(m1.positiveAcceptanceRate).toBe(1.0);
      expect(m2.positiveAcceptanceRate).toBe(0);
    });

    it('multiple contexts isolated', () => {
      monitor.trackAcceptance('u1', 'operations', 'positive', true);
      monitor.trackAcceptance('u1', 'finance', 'positive', false);

      const mPersonal = monitor.computeBiasMetrics('u1', 'operations');
      const mWork = monitor.computeBiasMetrics('u1', 'finance');

      expect(mPersonal.positiveAcceptanceRate).toBe(1.0);
      expect(mWork.positiveAcceptanceRate).toBe(0);
    });
  });

  // =========================================================
  // Urgency Detection (5 tests)
  // =========================================================

  describe('Urgency Detection', () => {
    it('no urgency for slow, long messages', () => {
      const now = new Date();
      const messages: Message[] = [
        { content: 'This is a fairly long message with enough content to be detailed.', timestamp: new Date(now.getTime() - 120000) },
        { content: 'Another lengthy message that takes time to compose and think about.', timestamp: new Date(now.getTime() - 60000) },
        { content: 'A third message with substantial content for discussion purposes.', timestamp: now },
      ];
      const result = monitor.detectUrgency(messages);
      expect(result.urgencyLevel).toBeLessThan(0.3);
      expect(result.encodingBoost).toBeLessThan(0.1);
    });

    it('high urgency for rapid messages (>3/min)', () => {
      const now = new Date();
      const messages: Message[] = [
        { content: 'Where is it?', timestamp: new Date(now.getTime() - 15000) },
        { content: 'Need it now', timestamp: new Date(now.getTime() - 10000) },
        { content: 'Hello??', timestamp: new Date(now.getTime() - 5000) },
        { content: 'Status?', timestamp: now },
      ];
      const result = monitor.detectUrgency(messages);
      expect(result.urgencyLevel).toBeGreaterThan(0.5);
    });

    it('high urgency for short messages (<50 chars)', () => {
      const now = new Date();
      const messages: Message[] = [
        { content: 'Yes', timestamp: new Date(now.getTime() - 30000) },
        { content: 'Do it', timestamp: new Date(now.getTime() - 20000) },
        { content: 'Now', timestamp: new Date(now.getTime() - 10000) },
        { content: 'Hurry', timestamp: now },
      ];
      const result = monitor.detectUrgency(messages);
      expect(result.urgencyLevel).toBeGreaterThan(0.3);
    });

    it('detects urgency keywords ("dringend", "asap", "deadline")', () => {
      const now = new Date();
      const messages: Message[] = [
        { content: 'Das ist dringend, bitte sofort erledigen!', timestamp: new Date(now.getTime() - 60000) },
        { content: 'Deadline ist morgen, brauche das asap', timestamp: now },
      ];
      const result = monitor.detectUrgency(messages);
      expect(result.urgencyLevel).toBeGreaterThan(0.5);
    });

    it('detects urgency from single keyword message', () => {
      const result = monitor.detectUrgency([
        { content: 'dringend!', timestamp: new Date() },
      ]);
      // Single message: frequency = 0, but keyword + brevity should still produce urgency
      expect(result.urgencyLevel).toBeGreaterThan(0);
      expect(result.encodingBoost).toBeGreaterThan(0);
    });

    it('encodingBoost capped at 0.2', () => {
      const now = new Date();
      // Extreme urgency: rapid, short, keyword-filled messages
      const messages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push({
          content: 'dringend asap sofort deadline urgent eilig bis morgen!',
          timestamp: new Date(now.getTime() - i * 1000),
        });
      }
      const result = monitor.detectUrgency(messages);
      expect(result.encodingBoost).toBeLessThanOrEqual(0.2);
      expect(result.urgencyLevel).toBeLessThanOrEqual(1.0);
    });
  });

  // =========================================================
  // Novelty-Proximity Boost (5 tests)
  // =========================================================

  describe('Novelty-Proximity Boost', () => {
    it('PE < 0.7 does NOT open window', () => {
      monitor.openNoveltyWindow('u1', 'operations', 0.5);
      const boost = monitor.getNoveltyBoost('u1', 'operations');
      expect(boost).toBe(0);
    });

    it('PE > 0.7 opens window, getNoveltyBoost returns > 0', () => {
      monitor.openNoveltyWindow('u1', 'operations', 0.8);
      const boost = monitor.getNoveltyBoost('u1', 'operations');
      expect(boost).toBeGreaterThan(0);
      expect(boost).toBeLessThanOrEqual(0.2);
    });

    it('boost decays linearly over 10 minutes', () => {
      const now = Date.now();
      // Open window 5 minutes ago (half of 10-minute window)
      monitor.openNoveltyWindowAt('u1', 'operations', 0.9, now - 5 * 60000);
      const boost = monitor.getNoveltyBoostAt('u1', 'operations', now);
      // After 5 of 10 minutes: 50% decay → boost ≈ 0.1
      expect(boost).toBeCloseTo(0.1, 1);
    });

    it('boost returns 0 after 10 minutes elapsed', () => {
      const now = Date.now();
      monitor.openNoveltyWindowAt('u1', 'operations', 0.9, now - 11 * 60000);
      const boost = monitor.getNoveltyBoostAt('u1', 'operations', now);
      expect(boost).toBe(0);
    });

    it('multiple windows: newer PE overwrites older', () => {
      const now = Date.now();
      monitor.openNoveltyWindowAt('u1', 'operations', 0.9, now - 8 * 60000);
      // Open a new window just now
      monitor.openNoveltyWindowAt('u1', 'operations', 0.95, now);
      const boost = monitor.getNoveltyBoostAt('u1', 'operations', now);
      // New window just opened → full boost
      expect(boost).toBeCloseTo(0.2, 1);
    });
  });

  // =========================================================
  // Efficiency Tracking (5 tests)
  // =========================================================

  describe('Efficiency Tracking', () => {
    it('trackEfficiency stores data', () => {
      monitor.trackEfficiency('u1', 'operations', 500, 0.8, 0.9);
      const trend = monitor.getEfficiencyTrend('u1', 'operations', 7);
      expect(trend.length).toBe(1);
      expect(trend[0].avgTokensUsed).toBe(500);
      expect(trend[0].retrievalPrecision).toBe(0.8);
      expect(trend[0].qualityScore).toBe(0.9);
    });

    it('getEfficiencyTrend returns sorted by date', () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      monitor.trackEfficiencyForDate('u1', 'operations', yesterday, 600, 0.7, 0.8);
      monitor.trackEfficiencyForDate('u1', 'operations', today, 400, 0.9, 0.95);

      const trend = monitor.getEfficiencyTrend('u1', 'operations', 7);
      expect(trend.length).toBe(2);
      expect(trend[0].date).toBe(yesterday);
      expect(trend[1].date).toBe(today);
    });

    it('getEfficiencyTrend limits to requested days', () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        const date = new Date(now - i * 86400000).toISOString().split('T')[0];
        monitor.trackEfficiencyForDate('u1', 'operations', date, 500, 0.8, 0.9);
      }
      const trend = monitor.getEfficiencyTrend('u1', 'operations', 3);
      expect(trend.length).toBe(3);
    });

    it('empty trend returns empty array', () => {
      const trend = monitor.getEfficiencyTrend('unknown', 'operations', 7);
      expect(trend).toEqual([]);
    });

    it('multiple entries on same day aggregated (averaged)', () => {
      const today = new Date().toISOString().split('T')[0];
      monitor.trackEfficiencyForDate('u1', 'operations', today, 400, 0.6, 0.7);
      monitor.trackEfficiencyForDate('u1', 'operations', today, 600, 0.8, 0.9);

      const trend = monitor.getEfficiencyTrend('u1', 'operations', 7);
      expect(trend.length).toBe(1);
      expect(trend[0].avgTokensUsed).toBeCloseTo(500); // (400+600)/2
      expect(trend[0].retrievalPrecision).toBeCloseTo(0.7); // (0.6+0.8)/2
      expect(trend[0].qualityScore).toBeCloseTo(0.8); // (0.7+0.9)/2
    });
  });

  // =========================================================
  // Integration with SmartSuggestions (5 tests)
  // =========================================================

  describe('SmartSuggestion Integration', () => {
    it('generateBiasAlert returns suggestion when asymmetryScore > 0.3', () => {
      // Create high asymmetry: 100% positive acceptance, 0% negative
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptance('u1', 'operations', 'positive', true);
        monitor.trackAcceptance('u1', 'operations', 'negative', false);
      }

      const alert = monitor.generateBiasAlert('u1', 'operations');
      expect(alert).not.toBeNull();
      expect(alert!.type).toBe('metacognitive_bias_alert');
      expect(alert!.title).toBe('Kognitive Balance-Warnung');
      expect(alert!.priority).toBe(80);
    });

    it('generateBiasAlert returns null when asymmetryScore <= 0.3', () => {
      // Balanced acceptance: 50% positive, 50% negative
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptance('u1', 'operations', 'positive', i < 5);
        monitor.trackAcceptance('u1', 'operations', 'negative', i < 5);
      }

      const alert = monitor.generateBiasAlert('u1', 'operations');
      expect(alert).toBeNull();
    });

    it('generateEfficiencyBadge returns suggestion when improvement detected', () => {
      const now = Date.now();
      // Old data (90+ days ago): high token usage, low quality
      for (let i = 100; i >= 90; i--) {
        const date = new Date(now - i * 86400000).toISOString().split('T')[0];
        monitor.trackEfficiencyForDate('u1', 'operations', date, 1000, 0.5, 0.7);
      }
      // Recent data (last 7 days): low token usage, same quality
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 86400000).toISOString().split('T')[0];
        monitor.trackEfficiencyForDate('u1', 'operations', date, 500, 0.8, 0.7);
      }

      const badge = monitor.generateEfficiencyBadge('u1', 'operations');
      expect(badge).not.toBeNull();
      expect(badge!.type).toBe('metacognitive_efficiency_badge');
      expect(badge!.title).toBe('Effizienz-Verbesserung');
      expect(badge!.priority).toBe(60);
    });

    it('generateEfficiencyBadge returns null when no improvement', () => {
      const now = Date.now();
      // Same token usage across all time
      for (let i = 100; i >= 0; i--) {
        const date = new Date(now - i * 86400000).toISOString().split('T')[0];
        monitor.trackEfficiencyForDate('u1', 'operations', date, 500, 0.8, 0.9);
      }

      const badge = monitor.generateEfficiencyBadge('u1', 'operations');
      expect(badge).toBeNull();
    });

    it('German string format correct for bias alert', () => {
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptance('u1', 'operations', 'positive', true);
        monitor.trackAcceptance('u1', 'operations', 'negative', false);
      }

      const alert = monitor.generateBiasAlert('u1', 'operations');
      expect(alert).not.toBeNull();
      expect(alert!.description).toContain('positiven Prognosen akzeptiert');
      expect(alert!.description).toContain('kritischen Hinweise');
      expect(alert!.description).toContain('ausgewogenere Perspektive');
      // Should contain percentage numbers
      expect(alert!.description).toMatch(/\d+%/);
    });
  });

  // =========================================================
  // Singleton export
  // =========================================================

  describe('Module exports', () => {
    it('exports a singleton metacognitiveMonitor instance', () => {
      expect(metacognitiveMonitor).toBeInstanceOf(MetacognitiveMonitor);
    });
  });
});
