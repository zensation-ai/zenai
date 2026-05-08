/**
 * Sprint 1.12 — Admin moderation queue for marketplace publishes.
 *
 * Lists blueprints whose owner has hit POST /publish and are waiting on
 * admin review. Approve lifts them into public listings; reject requires
 * a reason so the submitter gets actionable feedback via the existing
 * moderation_decisions audit trail.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SkeletonLoader } from '../SkeletonLoader';
import { apiCall, formatDate, styles } from './admin-shared';

interface PendingBlueprintRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  tags: string[];
  tools: string[];
  instructions: string;
  author: string | null;
  userId: string | null;
  publishedAt: string | null;
  createdAt: string;
  moderationReason: string | null;
}

export function MarketplaceTab() {
  const [rows, setRows] = useState<PendingBlueprintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<PendingBlueprintRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiCall<{ data: PendingBlueprintRow[] }>(
        '/api/marketplace/admin/pending?limit=100',
      );
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(
    async (id: string, decision: 'approved' | 'rejected', reason?: string) => {
      setInFlight(id);
      setError(null);
      try {
        await apiCall(`/api/marketplace/admin/blueprints/${id}/moderate`, {
          method: 'POST',
          body: JSON.stringify({ decision, reason }),
        });
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Moderation fehlgeschlagen');
      } finally {
        setInFlight(null);
      }
    },
    [load],
  );

  const handleReject = useCallback(async () => {
    if (!rejectFor) return;
    const reason = rejectReason.trim();
    if (reason.length < 10) {
      setError('Bitte mindestens 10 Zeichen als Begründung angeben.');
      return;
    }
    await decide(rejectFor.id, 'rejected', reason);
    setRejectFor(null);
    setRejectReason('');
  }, [rejectFor, rejectReason, decide]);

  const total = useMemo(() => rows.length, [rows]);

  if (loading) return <SkeletonLoader type="card" count={3} />;

  return (
    <div>
      {error && <div style={styles.errorBox} role="alert">{error}</div>}

      <div style={styles.filterBar}>
        <div style={{ ...styles.sectionTitle, marginBottom: 0 }}>
          Moderation-Queue ({total})
        </div>
        <div style={{ flex: 1 }} />
        <button style={styles.button} onClick={load} data-testid="marketplace-refresh">
          Aktualisieren
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={styles.emptyState}>Keine offenen Einreichungen.</div>
      ) : (
        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Agent</th>
                <th style={styles.th}>Autor</th>
                <th style={styles.th}>Kategorie</th>
                <th style={styles.th}>Tools</th>
                <th style={styles.th}>Eingereicht</th>
                <th style={styles.th}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} data-testid={`pending-row-${row.id}`}>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span aria-hidden="true" style={{ fontSize: 18 }}>{row.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{row.name}</div>
                        {row.description && (
                          <div style={{ fontSize: 11, opacity: 0.6, maxWidth: 320 }}>
                            {row.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={styles.td} className="text-xs">{row.author ?? row.userId ?? '-'}</td>
                  <td style={styles.td}>
                    <span style={styles.badge('#60a5fa')}>{row.category}</span>
                  </td>
                  <td style={styles.td} className="text-xs">
                    {row.tools.slice(0, 3).map(t => (
                      <span
                        key={t}
                        style={{ ...styles.badge('#94a3b8'), marginRight: 4 }}
                      >
                        {t}
                      </span>
                    ))}
                    {row.tools.length > 3 && (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>
                        +{row.tools.length - 3}
                      </span>
                    )}
                  </td>
                  <td style={styles.td} className="whitespace-nowrap text-xs">
                    {formatDate(row.publishedAt ?? row.createdAt)}
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.buttonPrimary}
                      disabled={inFlight === row.id}
                      data-testid={`approve-${row.id}`}
                      onClick={() => decide(row.id, 'approved')}
                    >
                      Freigeben
                    </button>
                    {' '}
                    <button
                      style={styles.button}
                      disabled={inFlight === row.id}
                      data-testid={`reject-${row.id}`}
                      onClick={() => { setRejectFor(row); setRejectReason(''); }}
                    >
                      Ablehnen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ablehnung begründen"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
          }}
          onClick={() => setRejectFor(null)}
        >
          <div
            style={{ ...styles.card, maxWidth: 480, width: '90%' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={styles.sectionTitle}>Ablehnen: {rejectFor.name}</div>
            <textarea
              rows={4}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Begründung (wird dem Autor gezeigt, min. 10 Zeichen)"
              data-testid="reject-reason"
              style={{ ...styles.input, width: '100%', minWidth: 0, resize: 'vertical' }}
            />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={styles.button} onClick={() => setRejectFor(null)}>
                Abbrechen
              </button>
              <button
                style={styles.buttonPrimary}
                data-testid="reject-submit"
                onClick={handleReject}
                disabled={inFlight === rejectFor.id || rejectReason.trim().length < 10}
              >
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
