/**
 * BusinessReports - AI-generated Business Reports
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface Report {
  id: string;
  report_type: string;
  period_start: string;
  period_end: string;
  summary: string | null;
  metrics: Record<string, unknown> | null;
  recommendations: string[] | null;
  generated_at: string;
}

export const BusinessReports: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const res = await axios.get('/api/business/reports');
      if (res.data.success) {
        setReports(res.data.reports ?? []);
        if (res.data.reports?.length > 0) {
          setSelectedReport(res.data.reports[0]);
        }
      }
    } catch {
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const generateReport = async (type: string) => {
    setGenerating(true);
    try {
      await axios.post('/api/business/reports/generate', { type });
      await fetchReports();
    } catch {
      // Generation may fail if no data available
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="business-empty"><div className="business-empty-icon">📋</div><div className="business-empty-text">Berichte werden geladen...</div></div>;
  }

  if (reports.length === 0) {
    return (
      <div className="business-empty">
        <div className="business-empty-icon">📋</div>
        <div className="business-empty-title">Noch keine Berichte</div>
        <div className="business-empty-text">
          Berichte werden automatisch generiert, sobald genuegend Daten gesammelt wurden.
          Stelle sicher, dass mindestens ein Connector konfiguriert ist.
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button type="button" className="business-btn primary" onClick={() => generateReport('weekly')} disabled={generating}>
            {generating ? 'Wird generiert...' : '📊 Wochenbericht generieren'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
      {/* Report List */}
      <div className="business-section" style={{ marginBottom: 0 }}>
        <div className="business-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 Berichte</span>
          <button type="button" className="business-btn" onClick={() => generateReport('weekly')} disabled={generating}>
            {generating ? '...' : '+ Neu'}
          </button>
        </div>
        {reports.map((report) => (
          <div
            key={report.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedReport(report)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedReport(report); }}
            style={{
              padding: '0.75rem',
              marginBottom: '0.5rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              background: selectedReport?.id === report.id ? 'rgba(129, 140, 248, 0.15)' : 'transparent',
              border: `1px solid ${selectedReport?.id === report.id ? 'rgba(129, 140, 248, 0.3)' : 'transparent'}`,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' }}>
              {report.report_type === 'weekly' ? 'Wochenbericht' : 'Monatsbericht'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
              {new Date(report.period_start).toLocaleDateString('de-DE')} - {new Date(report.period_end).toLocaleDateString('de-DE')}
            </div>
          </div>
        ))}
      </div>

      {/* Report Detail */}
      <div className="business-section" style={{ marginBottom: 0 }}>
        {selectedReport ? (
          <>
            <div className="business-section-title">
              {selectedReport.report_type === 'weekly' ? '📊 Wochenbericht' : '📊 Monatsbericht'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1rem' }}>
              {new Date(selectedReport.period_start).toLocaleDateString('de-DE')} - {new Date(selectedReport.period_end).toLocaleDateString('de-DE')}
            </div>

            {selectedReport.summary && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }}>Zusammenfassung</h4>
                <p style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{selectedReport.summary}</p>
              </div>
            )}

            {selectedReport.recommendations && selectedReport.recommendations.length > 0 && (
              <div>
                <h4 style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }}>Empfehlungen</h4>
                {selectedReport.recommendations.map((rec, i) => (
                  <div key={i} className="business-insight-card info">
                    <div className="business-insight-desc">💡 {rec}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="business-empty-text">Waehle einen Bericht aus.</div>
        )}
      </div>
    </div>
  );
};
