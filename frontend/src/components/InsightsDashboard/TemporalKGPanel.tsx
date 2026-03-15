/**
 * TemporalKGPanel - Temporaler Wissensgraph
 *
 * Phase 54: Temporal Knowledge Graph visualization
 * - Temporale Widersprueche (Contradictions)
 * - Zeitraum-Abfragen (Time Range Query)
 * - Beziehungs-Verlauf (Relation Timeline)
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';
import './TemporalKGPanel.css';

// ─── Types ────────────────────────────────────────────────

interface TemporalContradiction {
  source_id: string;
  source_title: string;
  target_id: string;
  target_title: string;
  relation_type: string;
  contradiction_type: string;
  details: string;
  detected_at: string;
}

interface TemporalRelation {
  id: string;
  source_id: string;
  source_title: string;
  target_id: string;
  target_title: string;
  relation_type: string;
  strength: number;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

interface RelationHistoryEntry {
  id: string;
  relation_type: string;
  strength: number;
  valid_from: string | null;
  valid_until: string | null;
  changed_at: string;
  change_type: string;
}

interface TemporalKGPanelProps {
  context: AIContext;
}

type ViewMode = 'contradictions' | 'query' | 'timeline';

// ─── Helpers ──────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '---';
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '---';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function relationLabel(type: string): string {
  const labels: Record<string, string> = {
    supports: 'unterstuetzt',
    contradicts: 'widerspricht',
    extends: 'erweitert',
    related: 'verwandt',
    refines: 'verfeinert',
    causes: 'verursacht',
    requires: 'erfordert',
  };
  return labels[type] || type;
}

function strengthBar(strength: number): string {
  const pct = Math.round(strength * 100);
  return `${pct}%`;
}

// ─── Component ────────────────────────────────────────────

export function TemporalKGPanel({ context }: TemporalKGPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('contradictions');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contradictions
  const [contradictions, setContradictions] = useState<TemporalContradiction[]>([]);

  // Time range query
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [queryResults, setQueryResults] = useState<TemporalRelation[]>([]);
  const [hasQueried, setHasQueried] = useState(false);

  // Relation timeline
  const [timelineSourceId, setTimelineSourceId] = useState('');
  const [timelineTargetId, setTimelineTargetId] = useState('');
  const [timeline, setTimeline] = useState<RelationHistoryEntry[]>([]);
  const [hasLoadedTimeline, setHasLoadedTimeline] = useState(false);

  // ─── Fetch Contradictions ─────────────────────────────

  const fetchContradictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/${context}/knowledge-graph/temporal-contradictions`);
      if (res.data.success) {
        setContradictions(res.data.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Widersprueche');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    if (viewMode === 'contradictions') {
      fetchContradictions();
    }
  }, [viewMode, fetchContradictions]);

  // ─── Time Range Query ─────────────────────────────────

  const handleTimeRangeQuery = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    setError(null);
    setHasQueried(true);
    try {
      const res = await axios.post(`/api/${context}/knowledge-graph/temporal-query`, {
        from: new Date(dateFrom).toISOString(),
        to: new Date(dateTo).toISOString(),
      });
      if (res.data.success) {
        setQueryResults(res.data.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler bei der Zeitraum-Abfrage');
    } finally {
      setLoading(false);
    }
  }, [context, dateFrom, dateTo]);

  // ─── Relation History ─────────────────────────────────

  const handleLoadTimeline = useCallback(async () => {
    if (!timelineSourceId || !timelineTargetId) return;
    setLoading(true);
    setError(null);
    setHasLoadedTimeline(true);
    try {
      const res = await axios.get(
        `/api/${context}/knowledge-graph/relation-history/${encodeURIComponent(timelineSourceId)}/${encodeURIComponent(timelineTargetId)}`
      );
      if (res.data.success) {
        setTimeline(res.data.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Verlaufs-Daten');
    } finally {
      setLoading(false);
    }
  }, [context, timelineSourceId, timelineTargetId]);

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="tkg-panel">
      <div className="tkg-header">
        <h3 className="tkg-title">Temporaler Wissensgraph</h3>
        <p className="tkg-subtitle">Zeitliche Beziehungen und Widersprueche analysieren</p>
      </div>

      {/* View Mode Tabs */}
      <div className="tkg-tabs">
        <button
          type="button"
          className={`tkg-tab ${viewMode === 'contradictions' ? 'tkg-tab-active' : ''}`}
          onClick={() => setViewMode('contradictions')}
        >
          Widersprueche
        </button>
        <button
          type="button"
          className={`tkg-tab ${viewMode === 'query' ? 'tkg-tab-active' : ''}`}
          onClick={() => setViewMode('query')}
        >
          Zeitraum-Abfrage
        </button>
        <button
          type="button"
          className={`tkg-tab ${viewMode === 'timeline' ? 'tkg-tab-active' : ''}`}
          onClick={() => setViewMode('timeline')}
        >
          Beziehungs-Verlauf
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="tkg-error">
          <span>{error}</span>
          <button type="button" className="tkg-retry-btn" onClick={() => {
            if (viewMode === 'contradictions') fetchContradictions();
            else if (viewMode === 'query') handleTimeRangeQuery();
            else handleLoadTimeline();
          }}>
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="tkg-loading">
          <div className="tkg-spinner" />
          <span>Wird geladen...</span>
        </div>
      )}

      {/* ─── Contradictions View ──────────────────────── */}
      {viewMode === 'contradictions' && !loading && (
        <div className="tkg-section">
          {contradictions.length === 0 ? (
            <div className="tkg-empty">
              <span className="tkg-empty-icon">✓</span>
              <span>Keine temporalen Widersprueche erkannt</span>
              <span className="tkg-empty-sub">
                Das Wissensnetz ist konsistent.
              </span>
            </div>
          ) : (
            <div className="tkg-contradictions-list">
              {contradictions.map((c, i) => (
                <div key={i} className="tkg-contradiction-card">
                  <div className="tkg-contradiction-chain">
                    <div className="tkg-chain-node tkg-chain-source">
                      <span className="tkg-chain-label">{c.source_title || c.source_id}</span>
                    </div>
                    <div className="tkg-chain-edge">
                      <span className="tkg-chain-relation tkg-relation-supports">
                        {relationLabel(c.relation_type)}
                      </span>
                      <div className="tkg-chain-arrow" />
                    </div>
                    <div className="tkg-chain-node tkg-chain-target">
                      <span className="tkg-chain-label">{c.target_title || c.target_id}</span>
                    </div>
                  </div>
                  <div className="tkg-contradiction-details">
                    <span className="tkg-contradiction-badge">
                      {c.contradiction_type || 'Widerspruch'}
                    </span>
                    {c.details && <p className="tkg-contradiction-desc">{c.details}</p>}
                    <span className="tkg-contradiction-date">
                      Erkannt: {formatDateTime(c.detected_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Time Range Query View ────────────────────── */}
      {viewMode === 'query' && !loading && (
        <div className="tkg-section">
          <div className="tkg-query-form">
            <div className="tkg-query-field">
              <label className="tkg-label">Von</label>
              <input
                type="date"
                className="tkg-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="tkg-query-field">
              <label className="tkg-label">Bis</label>
              <input
                type="date"
                className="tkg-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="tkg-query-btn"
              onClick={handleTimeRangeQuery}
              disabled={!dateFrom || !dateTo}
            >
              Abfragen
            </button>
          </div>

          {hasQueried && queryResults.length === 0 && (
            <div className="tkg-empty">
              <span>Keine Beziehungen im gewaehlten Zeitraum</span>
            </div>
          )}

          {queryResults.length > 0 && (
            <div className="tkg-results-list">
              <div className="tkg-results-header">
                <span>{queryResults.length} Beziehung{queryResults.length !== 1 ? 'en' : ''} gefunden</span>
              </div>
              {queryResults.map((r) => (
                <div key={r.id} className="tkg-relation-card">
                  <div className="tkg-relation-nodes">
                    <span className="tkg-relation-source">{r.source_title || r.source_id}</span>
                    <span className="tkg-relation-arrow">
                      <span className={`tkg-relation-type tkg-type-${r.relation_type}`}>
                        {relationLabel(r.relation_type)}
                      </span>
                    </span>
                    <span className="tkg-relation-target">{r.target_title || r.target_id}</span>
                  </div>
                  <div className="tkg-relation-meta">
                    <div className="tkg-strength">
                      <div className="tkg-strength-bar">
                        <div
                          className="tkg-strength-fill"
                          style={{ width: strengthBar(r.strength) }}
                        />
                      </div>
                      <span className="tkg-strength-label">{strengthBar(r.strength)}</span>
                    </div>
                    <span className="tkg-relation-dates">
                      {formatDate(r.valid_from)} – {formatDate(r.valid_until)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Relation Timeline View ───────────────────── */}
      {viewMode === 'timeline' && !loading && (
        <div className="tkg-section">
          <div className="tkg-query-form">
            <div className="tkg-query-field">
              <label className="tkg-label">Quell-ID</label>
              <input
                type="text"
                className="tkg-input"
                value={timelineSourceId}
                onChange={(e) => setTimelineSourceId(e.target.value)}
                placeholder="Idee-UUID"
              />
            </div>
            <div className="tkg-query-field">
              <label className="tkg-label">Ziel-ID</label>
              <input
                type="text"
                className="tkg-input"
                value={timelineTargetId}
                onChange={(e) => setTimelineTargetId(e.target.value)}
                placeholder="Idee-UUID"
              />
            </div>
            <button
              type="button"
              className="tkg-query-btn"
              onClick={handleLoadTimeline}
              disabled={!timelineSourceId || !timelineTargetId}
            >
              Verlauf laden
            </button>
          </div>

          {hasLoadedTimeline && timeline.length === 0 && (
            <div className="tkg-empty">
              <span>Kein Verlauf fuer diese Beziehung gefunden</span>
            </div>
          )}

          {timeline.length > 0 && (
            <div className="tkg-timeline">
              {timeline.map((entry, i) => (
                <div key={entry.id || i} className="tkg-timeline-item">
                  <div className="tkg-timeline-dot-col">
                    <div className={`tkg-timeline-dot ${i === 0 ? 'tkg-dot-latest' : ''}`} />
                    {i < timeline.length - 1 && <div className="tkg-timeline-line" />}
                  </div>
                  <div className="tkg-timeline-content">
                    <div className="tkg-timeline-top">
                      <span className="tkg-timeline-date">{formatDateTime(entry.changed_at)}</span>
                      <span className={`tkg-timeline-change tkg-change-${entry.change_type}`}>
                        {entry.change_type === 'created' ? 'Erstellt' :
                         entry.change_type === 'updated' ? 'Aktualisiert' :
                         entry.change_type === 'deleted' ? 'Geloescht' :
                         entry.change_type}
                      </span>
                    </div>
                    <div className="tkg-timeline-details">
                      <span className={`tkg-relation-type tkg-type-${entry.relation_type}`}>
                        {relationLabel(entry.relation_type)}
                      </span>
                      <div className="tkg-strength tkg-strength-sm">
                        <div className="tkg-strength-bar">
                          <div
                            className="tkg-strength-fill"
                            style={{ width: strengthBar(entry.strength) }}
                          />
                        </div>
                        <span className="tkg-strength-label">{strengthBar(entry.strength)}</span>
                      </div>
                      <span className="tkg-timeline-validity">
                        Gueltig: {formatDate(entry.valid_from)} – {formatDate(entry.valid_until)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
