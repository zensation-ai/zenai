/**
 * SeoDashboard - Google Search Console SEO Metrics
 */

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AIContext } from '../ContextSwitcher';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface SeoDashboardProps {
  context: AIContext;
}

interface SeoMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
  impressionsGrowth?: number;
}

interface SeoTimelinePoint {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
}

interface SeoQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export const SeoDashboard: React.FC<SeoDashboardProps> = () => {
  const [metrics, setMetrics] = useState<SeoMetrics | null>(null);
  const [timeline, setTimeline] = useState<SeoTimelinePoint[]>([]);
  const [queries, setQueries] = useState<SeoQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const fetchData = async () => {
      try {
        const [metricsRes, timelineRes, queriesRes] = await Promise.all([
          axios.get('/api/business/seo', { signal }),
          axios.get('/api/business/seo/timeline', { signal }),
          axios.get('/api/business/seo/queries', { signal }),
        ]);
        if (metricsRes.data.success) setMetrics(metricsRes.data.seo);
        if (timelineRes.data.success) setTimeline(timelineRes.data.timeline ?? []);
        if (queriesRes.data.success) setQueries(queriesRes.data.queries ?? []);
        setError(null);
      } catch (err) {
        if (!axios.isCancel(err)) setError('SEO-Daten konnten nicht geladen werden');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, []);

  if (loading) {
    return <div className="business-empty"><div className="business-empty-icon">🔍</div><div className="business-empty-text">SEO-Daten werden geladen...</div></div>;
  }

  if (!metrics) {
    return (
      <div className="business-empty">
        <div className="business-empty-icon">🔍</div>
        <div className="business-empty-title">{error || 'Keine SEO-Daten'}</div>
        <div className="business-empty-text">Google Search Console ist nicht verbunden. Autorisiere den Zugang unter Connectors.</div>
      </div>
    );
  }

  const chartData = timeline.map(p => ({
    date: new Date(p.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
    impressions: p.impressions,
    clicks: p.clicks,
  }));

  return (
    <div>
      <div className="business-kpi-grid">
        <div className="business-kpi-card">
          <div className="business-kpi-header">
            <span className="business-kpi-icon">👀</span>
            {metrics.impressionsGrowth !== undefined && metrics.impressionsGrowth !== 0 && (
              <span className={`business-kpi-badge ${metrics.impressionsGrowth >= 0 ? 'positive' : 'negative'}`}>
                {metrics.impressionsGrowth >= 0 ? '+' : ''}{(metrics.impressionsGrowth * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="business-kpi-value">{metrics.impressions.toLocaleString('de-DE')}</div>
          <div className="business-kpi-label">Impressionen</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">🖱️</span></div>
          <div className="business-kpi-value">{metrics.clicks.toLocaleString('de-DE')}</div>
          <div className="business-kpi-label">Klicks</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">📊</span></div>
          <div className="business-kpi-value">{(metrics.ctr * 100).toFixed(2)}%</div>
          <div className="business-kpi-label">CTR</div>
        </div>
        <div className="business-kpi-card">
          <div className="business-kpi-header"><span className="business-kpi-icon">📍</span></div>
          <div className="business-kpi-value">{metrics.avgPosition.toFixed(1)}</div>
          <div className="business-kpi-label">Ø Position</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="business-section">
          <div className="business-section-title">📈 SEO-Verlauf</div>
          <div className="business-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: 'rgba(20,30,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                />
                <Line type="monotone" dataKey="impressions" stroke="#818cf8" strokeWidth={2} dot={false} name="Impressionen" />
                <Line type="monotone" dataKey="clicks" stroke="#34d399" strokeWidth={2} dot={false} name="Klicks" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {queries.length > 0 && (
        <div className="business-section">
          <div className="business-section-title">🔎 Top Suchanfragen</div>
          <table className="business-table">
            <thead><tr><th>Suchanfrage</th><th>Klicks</th><th>Impressionen</th><th>CTR</th><th>Position</th></tr></thead>
            <tbody>
              {queries.slice(0, 20).map((q) => (
                <tr key={q.query}>
                  <td>{q.query}</td>
                  <td>{q.clicks}</td>
                  <td>{q.impressions}</td>
                  <td>{(q.ctr * 100).toFixed(1)}%</td>
                  <td>{q.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
