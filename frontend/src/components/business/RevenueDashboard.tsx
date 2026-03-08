/**
 * RevenueDashboard - Stripe Revenue Metrics
 */

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import type { RevenueMetrics, RevenueTimelinePoint, RevenueEvent } from '../../types/business';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export const RevenueDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [timeline, setTimeline] = useState<RevenueTimelinePoint[]>([]);
  const [events, setEvents] = useState<RevenueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const fetchData = async () => {
      try {
        const [metricsRes, timelineRes, eventsRes] = await Promise.all([
          axios.get('/api/business/revenue', { signal }),
          axios.get('/api/business/revenue/timeline', { signal }),
          axios.get('/api/business/revenue/events', { params: { limit: 20 }, signal }),
        ]);
        if (metricsRes.data.success && metricsRes.data.revenue) {
          const r = metricsRes.data.revenue;
          setMetrics({
            mrr: r.mrr ?? 0,
            arr: r.arr ?? 0,
            activeSubscriptions: r.activeSubscriptions ?? 0,
            churnRate: r.churnRate ?? 0,
            mrrGrowth: r.mrrGrowth ?? 0,
            totalCustomers: r.totalCustomers ?? 0,
            recentPayments: r.recentPayments ?? [],
          });
        }
        if (timelineRes.data.success) setTimeline(timelineRes.data.timeline ?? []);
        if (eventsRes.data.success) setEvents(eventsRes.data.events ?? []);
        setError(null);
      } catch (err) {
        if (!axios.isCancel(err)) setError('Revenue-Daten konnten nicht geladen werden');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, []);

  if (loading) {
    return <div className="business-empty"><div className="business-empty-icon">💰</div><div className="business-empty-text">Revenue-Daten werden geladen...</div></div>;
  }

  if (!metrics) {
    return (
      <div className="business-empty">
        <div className="business-empty-icon">💰</div>
        <div className="business-empty-title">{error ?? 'Keine Revenue-Daten'}</div>
        <div className="business-empty-text">Stripe ist nicht konfiguriert. Verbinde deinen Stripe-Account unter Connectors.</div>
      </div>
    );
  }

  const chartData = timeline.map(p => ({
    date: p.date ? new Date(p.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '–',
    mrr: p.mrr ?? 0,
  }));

  return (
    <div>
      <div className="business-kpi-grid">
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">💰</span></div>
          <div className="business-kpi-value">€{metrics.mrr.toFixed(0)}</div>
          <div className="business-kpi-label">MRR</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">📈</span></div>
          <div className="business-kpi-value">€{metrics.arr.toFixed(0)}</div>
          <div className="business-kpi-label">ARR</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">👥</span></div>
          <div className="business-kpi-value">{metrics.activeSubscriptions}</div>
          <div className="business-kpi-label">Subscriptions</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">📉</span></div>
          <div className="business-kpi-value">{metrics.churnRate.toFixed(1)}%</div>
          <div className="business-kpi-label">Churn Rate</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="business-section">
          <div className="business-section-title">📈 MRR-Verlauf</div>
          <div className="business-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} tickFormatter={(v: number) => `€${v}`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(20,30,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((value: any) => [`€${Number(value ?? 0).toFixed(2)}`, 'MRR']) as any}
                />
                <Line type="monotone" dataKey="mrr" stroke="#818cf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="business-section">
          <div className="business-section-title">🔔 Letzte Events</div>
          <table className="business-table">
            <thead><tr><th>Typ</th><th>Betrag</th><th>Datum</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{e.event_type}</td>
                  <td>{e.amount !== null ? `€${e.amount.toFixed(2)}` : '-'}</td>
                  <td>{e.occurred_at ? new Date(e.occurred_at).toLocaleDateString('de-DE') : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
