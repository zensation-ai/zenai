/**
 * BusinessOverview - KPI-Cards with quick metrics
 */

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import type { BusinessTab, BusinessOverview as BusinessOverviewType } from '../../types/business';

interface BusinessOverviewProps {
  onNavigateTab: (tab: BusinessTab) => void;
}

const DEFAULT_OVERVIEW: BusinessOverviewType = {
  revenue: { mrr: 0, mrrGrowth: 0, activeSubscriptions: 0, churnRate: 0 },
  traffic: { users: 0, usersGrowth: 0, sessions: 0, bounceRate: 0 },
  seo: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0 },
  health: { uptime: 0, activeIncidents: 0, avgResponseTime: 0 },
  performance: { score: 0, lcp: 0, fid: 0, cls: 0 },
};

export const BusinessOverview: React.FC<BusinessOverviewProps> = ({ onNavigateTab }) => {
  const [data, setData] = useState<BusinessOverviewType>(DEFAULT_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const fetchOverview = async () => {
      try {
        const res = await axios.get('/api/business/overview', { signal });
        if (res.data.success && res.data.overview) {
          setData({
            revenue: res.data.overview.revenue ?? DEFAULT_OVERVIEW.revenue,
            traffic: res.data.overview.traffic ?? DEFAULT_OVERVIEW.traffic,
            seo: res.data.overview.seo ?? DEFAULT_OVERVIEW.seo,
            health: res.data.overview.health ?? DEFAULT_OVERVIEW.health,
            performance: res.data.overview.performance ?? DEFAULT_OVERVIEW.performance,
          });
        }
        setError(null);
      } catch (err) {
        if (!axios.isCancel(err)) setError('Übersicht konnte nicht geladen werden');
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
    return () => { abortRef.current?.abort(); };
  }, []);

  const formatCurrency = (value: number) => `€${value.toFixed(0)}`;
  const formatPercent = (val: number) => `${val.toFixed(1)}%`;
  const formatGrowth = (val: number) => {
    const pct = val.toFixed(1);
    return val >= 0 ? `+${pct}%` : `${pct}%`;
  };

  const kpis = [
    {
      icon: '💰', label: 'MRR', value: formatCurrency(data.revenue.mrr),
      growth: data.revenue.mrrGrowth, tab: 'revenue' as BusinessTab,
    },
    {
      icon: '🌐', label: 'Besucher', value: data.traffic.users.toLocaleString('de-DE'),
      growth: data.traffic.usersGrowth, tab: 'traffic' as BusinessTab,
    },
    {
      icon: '🔍', label: 'SEO Klicks', value: data.seo.clicks.toLocaleString('de-DE'),
      growth: 0, tab: 'seo' as BusinessTab,
    },
    {
      icon: '🏥', label: 'Uptime', value: `${data.health.uptime.toFixed(1)}%`,
      growth: 0, tab: 'health' as BusinessTab,
    },
    {
      icon: '⚡', label: 'Performance', value: `${data.performance.score}/100`,
      growth: 0, tab: 'health' as BusinessTab,
    },
  ];

  if (loading) {
    return <div className="business-kpi-grid">{Array.from({ length: 5 }, (_, i) => (
      <div key={i} className="business-kpi-card" style={{ opacity: 0.5 }}>
        <div className="business-kpi-header"><span className="business-kpi-icon">...</span></div>
        <div className="business-kpi-value">--</div>
        <div className="business-kpi-label">Laden...</div>
      </div>
    ))}</div>;
  }

  return (
    <div>
      {error && <div className="business-empty-text" style={{ color: 'var(--danger, #f87171)', marginBottom: '1rem' }}>{error}</div>}
      <div className="business-kpi-grid">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="business-kpi-card neuro-hover-lift"
            onClick={() => onNavigateTab(kpi.tab)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigateTab(kpi.tab); } }}
            role="button"
            tabIndex={0}
            aria-label={`${kpi.label}: ${kpi.value}`}
          >
            <div className="business-kpi-header">
              <span className="business-kpi-icon">{kpi.icon}</span>
              {kpi.growth !== 0 && (
                <span className={`business-kpi-badge ${kpi.growth >= 0 ? 'positive' : 'negative'}`}>
                  {formatGrowth(kpi.growth)}
                </span>
              )}
            </div>
            <div className="business-kpi-value">{kpi.value}</div>
            <div className="business-kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="business-section">
        <div className="business-section-title">📈 Schnellübersicht</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Subscriptions</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{data.revenue.activeSubscriptions}</div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Churn Rate</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatPercent(data.revenue.churnRate)}</div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Bounce Rate</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatPercent(data.traffic.bounceRate)}</div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>SEO CTR</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatPercent(data.seo.ctr)}</div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Ø Position</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{data.seo.avgPosition.toFixed(1)}</div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Response Time</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{data.health.avgResponseTime}ms</div>
          </div>
        </div>
      </div>
    </div>
  );
};
