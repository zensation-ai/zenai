/**
 * Sprint 1.8 Commit 5: Unit coverage for the three new metric helpers
 * (`recordSIEMForward`, `recordGuardrailBlock`, `recordStripeWebhookReplay`).
 *
 * The OTel instruments are no-ops in tests (initMetrics is never called), so
 * these tests verify the snapshot side of the shim: every call must produce
 * exactly one in-memory MetricSnapshot with the right name, type, value, and
 * labels. That is what the observability API and downstream Prometheus
 * exporter read.
 */

import {
  recordSIEMForward,
  recordGuardrailBlock,
  recordStripeWebhookReplay,
  getMetricSnapshots,
  clearSnapshots,
} from '../../../services/observability/metrics';

describe('Sprint 1.8 metrics helpers', () => {
  beforeEach(() => {
    clearSnapshots();
  });

  describe('recordSIEMForward', () => {
    it('emits a counter snapshot with provider + result labels', () => {
      recordSIEMForward('datadog', true, { severity: 'critical' });
      const snaps = getMetricSnapshots();
      expect(snaps).toHaveLength(1);
      expect(snaps[0]).toMatchObject({
        name: 'security.siem.forward',
        type: 'counter',
        value: 1,
        labels: { provider: 'datadog', result: 'ok', severity: 'critical' },
      });
    });

    it('marks failures with result=fail and truncates long error strings', () => {
      const longError = 'x'.repeat(200);
      recordSIEMForward('syslog', false, { error: longError });
      const [snap] = getMetricSnapshots();
      expect(snap.labels.result).toBe('fail');
      expect(snap.labels.provider).toBe('syslog');
      // Error is truncated to 64 chars to keep label cardinality bounded.
      expect(snap.labels.error.length).toBe(64);
    });

    it('omits optional labels when not supplied', () => {
      recordSIEMForward('noop', true);
      const [snap] = getMetricSnapshots();
      expect(Object.keys(snap.labels).sort()).toEqual(['provider', 'result']);
    });
  });

  describe('recordGuardrailBlock', () => {
    it('emits a counter snapshot keyed by finding', () => {
      recordGuardrailBlock('openai_key', { surface: 'chat.stream.output', context: 'operations' });
      const [snap] = getMetricSnapshots();
      expect(snap.name).toBe('security.guardrail.blocks');
      expect(snap.type).toBe('counter');
      expect(snap.value).toBe(1);
      expect(snap.labels).toEqual({
        finding: 'openai_key',
        surface: 'chat.stream.output',
        context: 'operations',
      });
    });

    it('allows calling without optional attrs', () => {
      recordGuardrailBlock('jailbreak_echo');
      const [snap] = getMetricSnapshots();
      expect(snap.labels).toEqual({ finding: 'jailbreak_echo' });
    });
  });

  describe('recordStripeWebhookReplay', () => {
    it('stringifies booleans into labels so Prometheus can filter by dry_run', () => {
      recordStripeWebhookReplay('force-replay', {
        dryRun: false,
        processed: true,
        eventType: 'invoice.paid',
      });
      const [snap] = getMetricSnapshots();
      expect(snap.name).toBe('billing.webhook.replay');
      expect(snap.labels).toEqual({
        action: 'force-replay',
        dry_run: 'false',
        processed: 'true',
        event_type: 'invoice.paid',
      });
    });

    it('records a dry-run process event', () => {
      recordStripeWebhookReplay('process', { dryRun: true, processed: false });
      const [snap] = getMetricSnapshots();
      expect(snap.labels.action).toBe('process');
      expect(snap.labels.dry_run).toBe('true');
      expect(snap.labels.processed).toBe('false');
    });

    it('omits optional label keys when attrs is empty', () => {
      recordStripeWebhookReplay('skip');
      const [snap] = getMetricSnapshots();
      expect(Object.keys(snap.labels)).toEqual(['action']);
    });
  });

  it('all three helpers share the same snapshot ring, so the observability API sees them in order', () => {
    recordSIEMForward('datadog', true);
    recordGuardrailBlock('stripe_secret');
    recordStripeWebhookReplay('process', { dryRun: true, processed: false });

    const snaps = getMetricSnapshots();
    expect(snaps.map((s) => s.name)).toEqual([
      'security.siem.forward',
      'security.guardrail.blocks',
      'billing.webhook.replay',
    ]);
  });
});
