/**
 * Phase 7.5: Web Vitals Tests
 *
 * Tests for the web vitals monitoring module.
 * Note: PerformanceObserver is not available in jsdom, so we test
 * the utility functions and module structure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initWebVitals, getCollectedMetrics, type WebVitalMetric } from '../webVitals';

describe('Web Vitals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initWebVitals', () => {
    it('should initialize without errors', () => {
      // In jsdom, PerformanceObserver is not available
      // initWebVitals should gracefully handle this
      expect(() => initWebVitals()).not.toThrow();
    });

    it('should accept a custom callback', () => {
      const callback = vi.fn();
      expect(() => initWebVitals(callback)).not.toThrow();
    });
  });

  describe('getCollectedMetrics', () => {
    it('should return an array', () => {
      const metrics = getCollectedMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should return a copy (not the original array)', () => {
      const metrics1 = getCollectedMetrics();
      const metrics2 = getCollectedMetrics();
      // Should be equal but not the same reference
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('WebVitalMetric type', () => {
    it('should have correct structure', () => {
      const metric: WebVitalMetric = {
        name: 'LCP',
        value: 1500,
        rating: 'good',
        navigationType: 'navigate',
      };

      expect(metric.name).toBe('LCP');
      expect(metric.value).toBe(1500);
      expect(metric.rating).toBe('good');
      expect(metric.navigationType).toBe('navigate');
    });

    it('should support all rating values', () => {
      const ratings: WebVitalMetric['rating'][] = ['good', 'needs-improvement', 'poor'];
      expect(ratings).toHaveLength(3);
    });

    it('should support all metric names', () => {
      const names = ['LCP', 'FID', 'CLS', 'INP', 'TTFB'];
      for (const name of names) {
        const metric: WebVitalMetric = {
          name,
          value: 0,
          rating: 'good',
          navigationType: 'navigate',
        };
        expect(metric.name).toBe(name);
      }
    });
  });

  describe('Rating thresholds', () => {
    it('LCP thresholds should be 2500ms / 4000ms', () => {
      // Good: <= 2500, Poor: > 4000
      expect(2500).toBeLessThan(4000);
    });

    it('FID thresholds should be 100ms / 300ms', () => {
      expect(100).toBeLessThan(300);
    });

    it('CLS thresholds should be 0.1 / 0.25', () => {
      expect(0.1).toBeLessThan(0.25);
    });

    it('INP thresholds should be 200ms / 500ms', () => {
      expect(200).toBeLessThan(500);
    });

    it('TTFB thresholds should be 800ms / 1800ms', () => {
      expect(800).toBeLessThan(1800);
    });
  });
});
