/**
 * RevenueDashboard - Stripe Revenue Metrics
 */

import React, { useState, useEffect } from 'react';
import { AIContext } from '../ContextSwitcher';
import { getApiBaseUrl, getApiFetchHeaders } from '../../utils/apiConfig';
import type { RevenueMetrics, RevenueTimelinePoint, RevenueEvent } from '../../types/business';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface RevenueDashboardProps {
  context: AIContext;
}

export const RevenueDashboard: React.FC<RevenueDashboardProps> = () => {
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [timeline, setTimeline] = useState<RevenueTimelinePoint[]>([]);
  const [events, setEvents] = useState<RevenueEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const headers = getApiFetchHeaders();
      const base = getApiBaseUrl();
      try {
        const [metricsRes, timelineRes, eventsRes] = await Promise.all([
          fetch(`${base}/api/business/revenue`, { headers }),
          fetch(`${base}/api/business/revenue/timeline`, { headers }),
          fetch(`${base}/api/business/revenue/events?limit=20`, { headers }),
        ]);
        const [mData, tData, eData] = await Promise.all([
          metricsRes.json(), timelineRes.json(), eventsRes.json(),
        ]);
        if (mData.success) setMetrics(mData.revenue);
        if (tData.success) setTimeline(tData.timeline ?? []);
        if (eData.success) setEvents(eData.events ?? []);
      } catch {
        // Keep defaults
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <div className="business-empty"><div className="business-empty-icon">💰</div><div className="business-empty-text">Revenue-Daten werden geladen...</div></div>;
  }

  if (!metrics) {
    return (
      <div className="business-empty">
        <div className="business-empty-icon">💰</div>
        <div className="business-empty-title">Keine Revenue-Daten</div>
        <div className="business-empty-text">Stripe ist nicht konfiguriert. Verbinde deinen Stripe-Account unter Connectors.</div>
      </div>
    );
  }

  const chartData = timeline.map(p => ({
    date: new Date(p.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
    mrr: p.mrr / 100,
  }));

  return (
    <div>
      <div className="business-kpi-grid">
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">💰</span></div>
          <div className="business-kpi-value">€{(metrics.mrr / 100).toFixed(0)}</div>
          <div className="business-kpi-label">MRR</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">📈</span></div>
          <div className="business-kpi-value">€{(metrics.arr / 100).toFixed(0)}</div>
          <div className="business-kpi-label">ARR</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">👥</span></div>
          <div className="business-kpi-value">{metrics.activeSubscriptions}</div>
          <div className="business-kpi-label">Subscriptions</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">📉</span></div>
          <div className="business-kpi-value">{(metrics.churnRate * 100).toFixed(1)}%</div>
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
                  formatter={(value: number | undefined) => [`€${(value ?? 0).toFixed(2)}`, 'MRR']}
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
                  <td>{e.amount !== null ? `€${(e.amount / 100).toFixed(2)}` : '-'}</td>
                  <td>{new Date(e.occurred_at).toLocaleDateString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
