/**
 * Sprint 1.8 Commit 3: Stripe webhook replay admin dashboard.
 *
 * Lists recent billing_events rows and offers admin replay (dry-run by
 * default; force-replay explicitly opt-in). Surfaces the
 * /api/billing/admin/events endpoint.
 */

import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader } from '../SkeletonLoader';
import { apiCall, formatDate, styles } from './admin-shared';

interface BillingEventRow {
  id: string;
  stripe_event_id: string;
  event_type: string;
  user_id: string | null;
  processed_at: string;
}

interface ReplayResult {
  eventId: string;
  eventType: string;
  dryRun: boolean;
  alreadyProcessed: boolean;
  action: 'skip' | 'process' | 'force-replay';
  processed: boolean;
  notes: string;
}

export function BillingTab() {
  const [events, setEvents] = useState<BillingEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [replayInFlight, setReplayInFlight] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (typeFilter) params.set('event_type', typeFilter);
      if (searchFilter) params.set('search', searchFilter);
      params.set('limit', '100');

      const res = await apiCall<{ data: BillingEventRow[]; total: number }>(
        `/api/billing/admin/events?${params.toString()}`,
      );
      setEvents(Array.isArray(res.data) ? res.data : []);
      setTotal(typeof res.total === 'number' ? res.total : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, searchFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runReplay = useCallback(
    async (eventId: string, options: { dryRun: boolean; force?: boolean }) => {
      setReplayInFlight(eventId);
      setReplayResult(null);
      setError(null);
      try {
        const res = await apiCall<{ success: boolean; data: ReplayResult; error?: string }>(
          '/api/billing/admin/webhook-replay',
          {
            method: 'POST',
            body: JSON.stringify({
              event_id: eventId,
              dry_run: options.dryRun,
              force: options.force ?? false,
            }),
          },
        );
        if (res.success === false) {
          setError(res.error ?? 'Replay fehlgeschlagen');
          return;
        }
        setReplayResult(res.data);
        if (!options.dryRun) {
          await loadData();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Replay fehlgeschlagen');
      } finally {
        setReplayInFlight(null);
      }
    },
    [loadData],
  );

  if (loading) return <SkeletonLoader type="card" count={3} />;

  return (
    <div>
      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.filterBar} className="mb-4">
        <input
          style={styles.input}
          placeholder="Event-Typ filtern (z.B. invoice.paid)"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="evt_… suchen"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
        <div className="flex-1" />
        <button style={styles.button} onClick={loadData}>
          Aktualisieren
        </button>
      </div>

      {replayResult && (
        <div style={styles.card} className="mb-4">
          <div className="text-sm font-semibold mb-1">
            Replay-Ergebnis · {replayResult.eventId}
          </div>
          <div className="text-xs text-gray-600 mb-2">
            Aktion: <span className="font-mono">{replayResult.action}</span> ·{' '}
            dry-run: <span className="font-mono">{String(replayResult.dryRun)}</span> ·{' '}
            bereits verarbeitet:{' '}
            <span className="font-mono">{String(replayResult.alreadyProcessed)}</span>
          </div>
          <div className="text-sm">{replayResult.notes}</div>
        </div>
      )}

      {events.length === 0 ? (
        <div style={styles.emptyState}>
          Keine Stripe-Webhook-Events gefunden.
        </div>
      ) : (
        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Zeitpunkt</th>
                <th style={styles.th}>Event ID</th>
                <th style={styles.th}>Typ</th>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td style={styles.td} className="whitespace-nowrap text-xs">
                    {formatDate(ev.processed_at)}
                  </td>
                  <td style={styles.td} className="font-mono text-xs">
                    {ev.stripe_event_id}
                  </td>
                  <td style={styles.td}>
                    <span className="font-mono text-xs">{ev.event_type}</span>
                  </td>
                  <td style={styles.td} className="text-xs">
                    {ev.user_id ?? '-'}
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.button}
                      disabled={replayInFlight === ev.stripe_event_id}
                      onClick={() =>
                        runReplay(ev.stripe_event_id, { dryRun: true })
                      }
                    >
                      Dry-run
                    </button>
                    {' '}
                    <button
                      style={styles.button}
                      disabled={replayInFlight === ev.stripe_event_id}
                      onClick={() => {
                        if (
                          confirm(
                            `Force-Replay für ${ev.stripe_event_id}? Dies löscht die Zeile aus billing_events und führt Nebenwirkungen erneut aus.`,
                          )
                        ) {
                          runReplay(ev.stripe_event_id, {
                            dryRun: false,
                            force: true,
                          });
                        }
                      }}
                    >
                      Force-Replay
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={styles.emptyState} className="!p-2">
            Zeige {events.length} von {total} Einträgen
          </div>
        </div>
      )}
    </div>
  );
}
