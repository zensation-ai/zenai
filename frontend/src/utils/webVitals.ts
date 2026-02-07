/**
 * Phase 7.5: Frontend Performance Monitoring
 *
 * Tracks Core Web Vitals (LCP, FID, CLS, INP, TTFB) using the
 * browser PerformanceObserver API. No external dependencies required.
 *
 * Metrics are collected and can be sent to a backend endpoint or
 * logged for debugging. Uses the same patterns as Google's web-vitals
 * library but without the dependency.
 *
 * Usage:
 *   import { initWebVitals } from './utils/webVitals';
 *   initWebVitals((metric) => console.log(metric));
 */

export interface WebVitalMetric {
  /** Metric name: LCP, FID, CLS, INP, TTFB */
  name: string;
  /** Metric value in ms (or unitless for CLS) */
  value: number;
  /** Rating: good, needs-improvement, poor */
  rating: 'good' | 'needs-improvement' | 'poor';
  /** Navigation type */
  navigationType: string;
}

type MetricCallback = (metric: WebVitalMetric) => void;

// ---------------------------------------------------------------------------
// Thresholds per Google's Core Web Vitals guidelines
// ---------------------------------------------------------------------------

const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],     // good < 2.5s, poor > 4s
  FID: [100, 300],       // good < 100ms, poor > 300ms
  CLS: [0.1, 0.25],     // good < 0.1, poor > 0.25
  INP: [200, 500],       // good < 200ms, poor > 500ms
  TTFB: [800, 1800],     // good < 800ms, poor > 1.8s
};

function getRating(name: string, value: number): WebVitalMetric['rating'] {
  const threshold = THRESHOLDS[name];
  if (!threshold) return 'good';
  if (value <= threshold[0]) return 'good';
  if (value <= threshold[1]) return 'needs-improvement';
  return 'poor';
}

function getNavigationType(): string {
  if (typeof performance === 'undefined') return 'unknown';
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return nav?.type || 'navigate';
}

// ---------------------------------------------------------------------------
// Individual metric observers
// ---------------------------------------------------------------------------

function observeLCP(callback: MetricCallback): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    let lcpValue = 0;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        lcpValue = lastEntry.startTime;
      }
    });

    observer.observe({ type: 'largest-contentful-paint', buffered: true });

    // Report on page hide (when user navigates away)
    const reportOnHide = () => {
      if (lcpValue > 0) {
        callback({
          name: 'LCP',
          value: Math.round(lcpValue),
          rating: getRating('LCP', lcpValue),
          navigationType: getNavigationType(),
        });
      }
      observer.disconnect();
    };

    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reportOnHide();
      }
    }, { once: true });
  } catch {
    // PerformanceObserver not supported for this entry type
  }
}

function observeFID(callback: MetricCallback): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const firstEntry = entries[0] as PerformanceEventTiming | undefined;
      if (firstEntry) {
        const value = firstEntry.processingStart - firstEntry.startTime;
        callback({
          name: 'FID',
          value: Math.round(value),
          rating: getRating('FID', value),
          navigationType: getNavigationType(),
        });
        observer.disconnect();
      }
    });

    observer.observe({ type: 'first-input', buffered: true });
  } catch {
    // PerformanceObserver not supported for this entry type
  }
}

function observeCLS(callback: MetricCallback): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    let clsValue = 0;
    let sessionValue = 0;
    let sessionEntries: PerformanceEntry[] = [];

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only count layout shifts without recent user input
        if (!(entry as { hadRecentInput?: boolean }).hadRecentInput) {
          const firstSessionEntry = sessionEntries[0];
          const lastSessionEntry = sessionEntries[sessionEntries.length - 1];

          // Start new session if gap > 1s or session > 5s
          if (
            sessionEntries.length > 0 &&
            (entry.startTime - (lastSessionEntry?.startTime ?? 0) > 1000 ||
              entry.startTime - (firstSessionEntry?.startTime ?? 0) > 5000)
          ) {
            // Update CLS with max session value
            if (sessionValue > clsValue) {
              clsValue = sessionValue;
            }
            sessionValue = 0;
            sessionEntries = [];
          }

          sessionEntries.push(entry);
          sessionValue += (entry as { value?: number }).value ?? 0;
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });

    // Report on page hide
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Final check
        if (sessionValue > clsValue) {
          clsValue = sessionValue;
        }
        if (clsValue > 0) {
          callback({
            name: 'CLS',
            value: parseFloat(clsValue.toFixed(4)),
            rating: getRating('CLS', clsValue),
            navigationType: getNavigationType(),
          });
        }
        observer.disconnect();
      }
    }, { once: true });
  } catch {
    // PerformanceObserver not supported for this entry type
  }
}

function observeTTFB(callback: MetricCallback): void {
  if (typeof performance === 'undefined') return;

  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      const value = nav.responseStart - nav.requestStart;
      if (value > 0) {
        callback({
          name: 'TTFB',
          value: Math.round(value),
          rating: getRating('TTFB', value),
          navigationType: nav.type,
        });
      }
    }
  } catch {
    // Navigation timing not available
  }
}

function observeINP(callback: MetricCallback): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    let maxDuration = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const eventEntry = entry as PerformanceEventTiming;
        const duration = eventEntry.duration;
        if (duration > maxDuration) {
          maxDuration = duration;
        }
      }
    });

    observer.observe({ type: 'event', buffered: true });

    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && maxDuration > 0) {
        callback({
          name: 'INP',
          value: Math.round(maxDuration),
          rating: getRating('INP', maxDuration),
          navigationType: getNavigationType(),
        });
        observer.disconnect();
      }
    }, { once: true });
  } catch {
    // PerformanceObserver not supported for this entry type
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Store collected metrics for retrieval
const collectedMetrics: WebVitalMetric[] = [];

/**
 * Initialize web vitals monitoring.
 * Call once at app startup. Optionally pass a callback to receive each metric.
 *
 * @param onMetric - Callback for each collected metric. Defaults to console.debug in dev.
 */
export function initWebVitals(onMetric?: MetricCallback): void {
  const handler: MetricCallback = (metric) => {
    collectedMetrics.push(metric);

    if (onMetric) {
      onMetric(metric);
    } else if (import.meta.env.DEV) {
      const color = metric.rating === 'good' ? '#0c0' :
                    metric.rating === 'needs-improvement' ? '#fa0' : '#f00';
      console.debug(
        `%c[WebVital] ${metric.name}: ${metric.value}${metric.name === 'CLS' ? '' : 'ms'} (${metric.rating})`,
        `color: ${color}; font-weight: bold;`,
      );
    }
  };

  // Start observing all vitals
  observeLCP(handler);
  observeFID(handler);
  observeCLS(handler);
  observeTTFB(handler);
  observeINP(handler);
}

/**
 * Get all collected web vital metrics.
 */
export function getCollectedMetrics(): WebVitalMetric[] {
  return [...collectedMetrics];
}
