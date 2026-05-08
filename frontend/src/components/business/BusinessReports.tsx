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
          Berichte werden automatisch generiert, sobald genügend Daten gesammelt wurden.
          Stelle sicher, dass mindestens ein Connector konfiguriert ist.
        </div>
        <div className="mt-4 flex gap-2 justify-center">
          <button type="button" className="business-btn primary" onClick={() => generateReport('weekly')} disabled={generating}>
            {generating ? 'Wird generiert...' : '📊 Wochenbericht generieren'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6">
      {/* Report List */}
      <div className="business-section mb-0">
        <div className="business-section-title flex justify-between items-center">
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
            className="p-3 mb-2 rounded-[var(--radius-md)] cursor-pointer border bg-[var(--bg)] border-[color:var(--bc)]"
            style={{
              '--bg': selectedReport?.id === report.id ? 'rgba(129, 140, 248, 0.15)' : 'transparent',
              '--bc': selectedReport?.id === report.id ? 'rgba(129, 140, 248, 0.3)' : 'transparent',
            } as React.CSSProperties}
          >
            <div className="font-semibold text-[0.9rem] text-white/90">
              {report.report_type === 'weekly' ? 'Wochenbericht' : 'Monatsbericht'}
            </div>
            <div className="text-[0.8rem] text-white/50">
              {new Date(report.period_start).toLocaleDateString('de-DE')} - {new Date(report.period_end).toLocaleDateString('de-DE')}
            </div>
          </div>
        ))}
      </div>

      {/* Report Detail */}
      <div className="business-section mb-0">
        {selectedReport ? (
          <>
            <div className="business-section-title">
              {selectedReport.report_type === 'weekly' ? '📊 Wochenbericht' : '📊 Monatsbericht'}
            </div>
            <div className="text-[0.85rem] text-white/50 mb-4">
              {new Date(selectedReport.period_start).toLocaleDateString('de-DE')} - {new Date(selectedReport.period_end).toLocaleDateString('de-DE')}
            </div>

            {selectedReport.summary && (
              <div className="mb-6">
                <h4 className="text-white/80 mb-2">Zusammenfassung</h4>
                <p className="text-white/70 leading-relaxed">{selectedReport.summary}</p>
              </div>
            )}

            {selectedReport.recommendations && selectedReport.recommendations.length > 0 && (
              <div>
                <h4 className="text-white/80 mb-2">Empfehlungen</h4>
                {selectedReport.recommendations.map((rec, i) => (
                  <div key={i} className="business-insight-card info">
                    <div className="business-insight-desc">💡 {rec}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="business-empty-text">Wähle einen Bericht aus.</div>
        )}
      </div>
    </div>
  );
};
