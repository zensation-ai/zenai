/**
 * HealthDashboard - Uptime & Performance Monitoring
 */

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AIContext } from '../ContextSwitcher';
import type { PerformanceMetrics } from '../../types/business';

interface HealthDashboardProps {
  context: AIContext;
}

interface UptimeData {
  monitors: Array<{ id: string; name: string; status: string; uptime: number; responseTime: number }>;
  incidents: Array<{ id: string; monitorName: string; description: string; occurredAt: string }>;
  uptimePercentage: number;
  avgResponseTime: number;
}

export const HealthDashboard: React.FC<HealthDashboardProps> = () => {
  const [uptime, setUptime] = useState<UptimeData | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const fetchData = async () => {
      try {
        const [uptimeRes, perfRes] = await Promise.all([
          axios.get('/api/business/health/uptime', { signal }),
          axios.get('/api/business/health/performance', { signal }),
        ]);
        if (uptimeRes.data.success) setUptime(uptimeRes.data.uptime);
        if (perfRes.data.success) setPerformance(perfRes.data.performance);
      } catch (err) {
        if (!axios.isCancel(err)) { /* connectors may not be configured */ }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, []);

  const runAudit = async () => {
    setAuditing(true);
    try {
      const res = await axios.post('/api/business/health/audit', { url: 'https://zensation.ai' });
      if (res.data.success && res.data.scores) {
        setPerformance(res.data.scores);
      }
    } catch {
      // Audit may fail if Lighthouse is not available
    } finally {
      setAuditing(false);
    }
  };

  if (loading) {
    return <div className="business-empty"><div className="business-empty-icon">🏥</div><div className="business-empty-text">Health-Daten werden geladen...</div></div>;
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#34d399';
    if (score >= 50) return '#fbbf24';
    return '#f87171';
  };

  return (
    <div>
      {/* Uptime Section */}
      <div className="business-section">
        <div className="business-section-title">🔄 Uptime</div>
        {uptime ? (
          <>
            <div className="business-kpi-grid">
              <div className="business-kpi-card">
                <div className="business-kpi-header"><span className="business-kpi-icon">✅</span></div>
                <div className="business-kpi-value">{uptime.uptimePercentage.toFixed(2)}%</div>
                <div className="business-kpi-label">Verfuegbarkeit</div>
              </div>
              <div className="business-kpi-card">
                <div className="business-kpi-header"><span className="business-kpi-icon">⚡</span></div>
                <div className="business-kpi-value">{uptime.avgResponseTime}ms</div>
                <div className="business-kpi-label">Ø Antwortzeit</div>
              </div>
              <div className="business-kpi-card">
                <div className="business-kpi-header"><span className="business-kpi-icon">📡</span></div>
                <div className="business-kpi-value">{uptime.monitors.length}</div>
                <div className="business-kpi-label">Monitore</div>
              </div>
              <div className="business-kpi-card">
                <div className="business-kpi-header"><span className="business-kpi-icon">⚠️</span></div>
                <div className="business-kpi-value">{uptime.incidents.length}</div>
                <div className="business-kpi-label">Incidents</div>
              </div>
            </div>

            {uptime.monitors.length > 0 && (
              <table className="business-table" style={{ marginTop: '1rem' }}>
                <thead><tr><th>Monitor</th><th>Status</th><th>Uptime</th><th>Antwortzeit</th></tr></thead>
                <tbody>
                  {uptime.monitors.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td><span className={`status-dot ${m.status}`} />{m.status}</td>
                      <td>{m.uptime.toFixed(2)}%</td>
                      <td>{m.responseTime}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <div className="business-empty-text">UptimeRobot nicht konfiguriert.</div>
        )}
      </div>

      {/* Performance Section */}
      <div className="business-section">
        <div className="business-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚡ Performance (Lighthouse)</span>
          <button type="button" className="business-btn" onClick={runAudit} disabled={auditing}>
            {auditing ? 'Audit laeuft...' : '🔄 Neues Audit'}
          </button>
        </div>
        {performance ? (
          <>
            <div className="business-kpi-grid">
              <div className="business-kpi-card">
                <div className="business-kpi-header"><span className="business-kpi-icon">🎯</span></div>
                <div className="business-kpi-value" style={{ color: getScoreColor(performance.score) }}>{performance.score}/100</div>
                <div className="business-kpi-label">Performance</div>
              </div>
              <div className="business-kpi-card">
                <div className="business-kpi-header"><span className="business-kpi-icon">♿</span></div>
                <div className="business-kpi-value" style={{ color: getScoreColor(performance.accessibilityScore) }}>{performance.accessibilityScore}/100</div>
                <div className="business-kpi-label">Accessibility</div>
              </div>
              <div className="business-kpi-card">
                <div className="business-kpi-header"><span className="business-kpi-icon">✅</span></div>
                <div className="business-kpi-value" style={{ color: getScoreColor(performance.bestPracticesScore) }}>{performance.bestPracticesScore}/100</div>
                <div className="business-kpi-label">Best Practices</div>
              </div>
              <div className="business-kpi-card">
                <div className="business-kpi-header"><span className="business-kpi-icon">🔍</span></div>
                <div className="business-kpi-value" style={{ color: getScoreColor(performance.seoScore) }}>{performance.seoScore}/100</div>
                <div className="business-kpi-label">SEO Score</div>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div className="business-section-title">Core Web Vitals</div>
              <div className="business-kpi-grid">
                <div className="business-kpi-card">
                  <div className="business-kpi-value">{performance.lcp}ms</div>
                  <div className="business-kpi-label">LCP (Largest Contentful Paint)</div>
                </div>
                <div className="business-kpi-card">
                  <div className="business-kpi-value">{performance.fid}ms</div>
                  <div className="business-kpi-label">FID (First Input Delay)</div>
                </div>
                <div className="business-kpi-card">
                  <div className="business-kpi-value">{performance.cls}</div>
                  <div className="business-kpi-label">CLS (Cumulative Layout Shift)</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="business-empty-text">Noch keine Performance-Daten. Starte ein Audit.</div>
          </div>
        )}
      </div>
    </div>
  );
};
