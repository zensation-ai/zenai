/**
 * TrafficDashboard - GA4 Traffic Analytics
 */

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import type { TrafficMetrics } from '../../types/business';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export const TrafficDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<TrafficMetrics | null>(null);
  const [timeline, setTimeline] = useState<Array<{ date: string; users: number; sessions: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const fetchData = async () => {
      try {
        const [metricsRes, timelineRes] = await Promise.all([
          axios.get('/api/business/traffic', { signal }),
          axios.get('/api/business/traffic/timeline', { signal }),
        ]);
        if (metricsRes.data.success && metricsRes.data.traffic) {
          const t = metricsRes.data.traffic;
          setMetrics({
            users: t.users ?? 0,
            newUsers: t.newUsers ?? 0,
            sessions: t.sessions ?? 0,
            pageviews: t.pageviews ?? 0,
            bounceRate: t.bounceRate ?? 0,
            avgSessionDuration: t.avgSessionDuration ?? 0,
            conversions: t.conversions ?? 0,
            usersGrowth: t.usersGrowth ?? 0,
            topPages: t.topPages ?? [],
            trafficSources: t.trafficSources ?? [],
          });
        }
        if (timelineRes.data.success) setTimeline(timelineRes.data.timeline ?? []);
        setError(null);
      } catch (err) {
        if (!axios.isCancel(err)) setError('Traffic-Daten konnten nicht geladen werden');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, []);

  if (loading) {
    return <div className="business-empty"><div className="business-empty-icon">🌐</div><div className="business-empty-text">Traffic-Daten werden geladen...</div></div>;
  }

  if (!metrics) {
    return (
      <div className="business-empty">
        <div className="business-empty-icon">🌐</div>
        <div className="business-empty-title">{error ?? 'Keine Traffic-Daten'}</div>
        <div className="business-empty-text">Google Analytics 4 ist nicht konfiguriert. Verbinde deinen GA4-Account unter Connectors.</div>
      </div>
    );
  }

  const chartData = timeline.map(p => ({
    date: p.date ? new Date(p.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '–',
    users: p.users ?? 0,
    sessions: p.sessions ?? 0,
  }));

  return (
    <div>
      <div className="business-kpi-grid">
        <div className="business-kpi-card">
          <div className="business-kpi-header">
            <span className="business-kpi-icon">👥</span>
            {metrics.usersGrowth !== 0 && (
              <span className={`business-kpi-badge ${metrics.usersGrowth >= 0 ? 'positive' : 'negative'}`}>
                {metrics.usersGrowth >= 0 ? '+' : ''}{metrics.usersGrowth.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="business-kpi-value">{metrics.users.toLocaleString('de-DE')}</div>
          <div className="business-kpi-label">Besucher</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">📊</span></div>
          <div className="business-kpi-value">{metrics.sessions.toLocaleString('de-DE')}</div>
          <div className="business-kpi-label">Sessions</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">📄</span></div>
          <div className="business-kpi-value">{metrics.pageviews.toLocaleString('de-DE')}</div>
          <div className="business-kpi-label">Seitenaufrufe</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">↩️</span></div>
          <div className="business-kpi-value">{metrics.bounceRate.toFixed(1)}%</div>
          <div className="business-kpi-label">Bounce Rate</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="business-section">
          <div className="business-section-title">📊 Traffic-Verlauf</div>
          <div className="business-chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: 'rgba(20,30,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                />
                <Bar dataKey="users" fill="#818cf8" name="Besucher" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sessions" fill="#34d399" name="Sessions" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {metrics.topPages && metrics.topPages.length > 0 && (
        <div className="business-section">
          <div className="business-section-title">📄 Top Seiten</div>
          <table className="business-table">
            <thead><tr><th>Seite</th><th>Aufrufe</th><th>Bounce Rate</th></tr></thead>
            <tbody>
              {metrics.topPages.map((p) => (
                <tr key={p.page}>
                  <td>{p.page}</td>
                  <td>{p.views}</td>
                  <td>{p.bounceRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {metrics.trafficSources && metrics.trafficSources.length > 0 && (
        <div className="business-section">
          <div className="business-section-title">🔗 Traffic-Quellen</div>
          <table className="business-table">
            <thead><tr><th>Quelle</th><th>Besucher</th><th>Sessions</th></tr></thead>
            <tbody>
              {metrics.trafficSources.map((s) => (
                <tr key={s.source}>
                  <td>{s.source}</td>
                  <td>{s.users}</td>
                  <td>{s.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
