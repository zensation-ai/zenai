/**
 * BusinessNarrative - Cross-Context Business Intelligence Dashboard (Phase 96)
 *
 * 3 tabs: Daily Digest, Weekly Report, KPIs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { NarrativeCard } from './NarrativeCard';
import { KPICard } from './KPICard';
import './BusinessNarrative.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

type NarrativeTab = 'daily' | 'weekly' | 'kpis';

interface NarrativeSection {
  title: string;
  icon: string;
  narrative: string;
  metrics: MetricPoint[];
  actionItems: string[];
  anomalies: AnomalyInfo[];
}

interface MetricPoint {
  label: string;
  value: number;
  previousValue?: number;
  unit?: string;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

interface AnomalyInfo {
  metric: string;
  value: number;
  expected: number;
  deviation: number;
  severity: 'warning' | 'critical';
  description: string;
}

interface DailyDigest {
  date: string;
  sections: NarrativeSection[];
  overallNarrative: string;
  actionItems: string[];
  anomalyCount: number;
}

interface WeeklyReport {
  periodStart: string;
  periodEnd: string;
  sections: NarrativeSection[];
  overallNarrative: string;
  trendSummary: { metric: string; direction: 'up' | 'down' | 'stable'; changePercent: number; sparkline: number[] }[];
}

interface CustomKPI {
  id: string;
  name: string;
  description: string | null;
  formula: { sources: string[]; aggregation: string };
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  trend: 'up' | 'down' | 'stable';
  lastCalculatedAt: string | null;
  createdAt: string;
}

interface BusinessNarrativeProps {
  context: string;
}

export const BusinessNarrative: React.FC<BusinessNarrativeProps> = ({ context }) => {
  const [activeTab, setActiveTab] = useState<NarrativeTab>('daily');
  const [dailyDigest, setDailyDigest] = useState<DailyDigest | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [kpis, setKpis] = useState<CustomKPI[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKPIModal, setShowKPIModal] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async (endpoint: string) => {
    const res = await fetch(`${API_URL}/api/${context}/business-narrative/${endpoint}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
    const data = await res.json();
    return data.data;
  }, [context]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (activeTab === 'daily') {
          const digest = await fetchData('daily');
          setDailyDigest(digest);
        } else if (activeTab === 'weekly') {
          const report = await fetchData('weekly');
          setWeeklyReport(report);
        } else {
          const kpiList = await fetchData('kpis');
          setKpis(kpiList);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeTab, fetchData]);

  const handleToggleCheck = (item: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const handleCreateKPI = async (data: { name: string; description: string; formula: { sources: string[]; aggregation: string }; targetValue: number; unit: string }) => {
    try {
      const res = await fetch(`${API_URL}/api/${context}/business-narrative/kpis`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create KPI');
      const result = await res.json();
      setKpis(prev => [result.data, ...prev]);
      setShowKPIModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
    }
  };

  const handleDeleteKPI = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/${context}/business-narrative/kpis/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${API_KEY}` },
      });
      setKpis(prev => prev.filter(k => k.id !== id));
    } catch {
      // silent
    }
  };

  return (
    <div className="bn-container">
      <div className="bn-tabs">
        <button
          className={`bn-tab ${activeTab === 'daily' ? 'bn-tab--active' : ''}`}
          onClick={() => setActiveTab('daily')}
        >
          Tagesbericht
        </button>
        <button
          className={`bn-tab ${activeTab === 'weekly' ? 'bn-tab--active' : ''}`}
          onClick={() => setActiveTab('weekly')}
        >
          Wochenbericht
        </button>
        <button
          className={`bn-tab ${activeTab === 'kpis' ? 'bn-tab--active' : ''}`}
          onClick={() => setActiveTab('kpis')}
        >
          KPIs
        </button>
      </div>

      {error && <div className="bn-error">{error}</div>}

      {loading && (
        <div className="bn-loading">
          <div className="bn-loading-spinner" />
          <span>Daten werden geladen...</span>
        </div>
      )}

      {!loading && activeTab === 'daily' && dailyDigest && (
        <div className="bn-daily">
          <div className="bn-overall">
            <p className="bn-overall-text">{dailyDigest.overallNarrative}</p>
            {dailyDigest.anomalyCount > 0 && (
              <span className="bn-anomaly-badge">{dailyDigest.anomalyCount} Anomalie(n)</span>
            )}
          </div>

          <div className="bn-sections-grid">
            {dailyDigest.sections.map((section, i) => (
              <NarrativeCard key={i} section={section} />
            ))}
          </div>

          {dailyDigest.actionItems.length > 0 && (
            <div className="bn-action-items">
              <h3>Handlungsempfehlungen</h3>
              <ul className="bn-checklist">
                {dailyDigest.actionItems.map((item, i) => (
                  <li key={i} className={checkedItems.has(item) ? 'bn-checked' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checkedItems.has(item)}
                        onChange={() => handleToggleCheck(item)}
                      />
                      <span>{item}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === 'weekly' && weeklyReport && (
        <div className="bn-weekly">
          <div className="bn-overall">
            <p className="bn-overall-text">{weeklyReport.overallNarrative}</p>
            <span className="bn-period">{weeklyReport.periodStart} — {weeklyReport.periodEnd}</span>
          </div>

          <div className="bn-sections-grid">
            {weeklyReport.sections.map((section, i) => (
              <NarrativeCard key={i} section={section} />
            ))}
          </div>

          {weeklyReport.trendSummary.length > 0 && (
            <div className="bn-trends">
              <h3>Wochentrends</h3>
              <div className="bn-trend-list">
                {weeklyReport.trendSummary.map((t, i) => (
                  <div key={i} className="bn-trend-item">
                    <span className="bn-trend-name">{t.metric}</span>
                    <span className={`bn-trend-arrow bn-trend-arrow--${t.direction}`}>
                      {t.direction === 'up' ? '↑' : t.direction === 'down' ? '↓' : '→'}
                    </span>
                    {t.sparkline.length > 0 && (
                      <svg className="bn-sparkline" viewBox={`0 0 ${t.sparkline.length * 10} 30`} width="70" height="30">
                        <polyline
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          points={t.sparkline.map((v, idx) => {
                            const max = Math.max(...t.sparkline, 1);
                            const y = 28 - (v / max) * 26;
                            return `${idx * 10 + 2},${y}`;
                          }).join(' ')}
                        />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === 'kpis' && (
        <div className="bn-kpis">
          <div className="bn-kpis-header">
            <h3>Benutzerdefinierte KPIs</h3>
            <button className="bn-btn bn-btn--primary" onClick={() => setShowKPIModal(true)}>
              + KPI erstellen
            </button>
          </div>

          {kpis.length === 0 && (
            <div className="bn-empty">
              <p>Noch keine KPIs definiert. Erstellen Sie Ihren ersten KPI.</p>
            </div>
          )}

          <div className="bn-kpi-grid">
            {kpis.map(kpi => (
              <KPICard key={kpi.id} kpi={kpi} onDelete={handleDeleteKPI} />
            ))}
          </div>

          {showKPIModal && (
            <KPICreateModal
              onClose={() => setShowKPIModal(false)}
              onCreate={handleCreateKPI}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ─── KPI Create Modal ────────────────────────────

interface KPICreateModalProps {
  onClose: () => void;
  onCreate: (data: { name: string; description: string; formula: { sources: string[]; aggregation: string }; targetValue: number; unit: string }) => void;
}

const KPICreateModal: React.FC<KPICreateModalProps> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sources, setSources] = useState('revenue');
  const [aggregation, setAggregation] = useState('sum');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      description: description.trim(),
      formula: { sources: sources.split(',').map(s => s.trim()), aggregation },
      targetValue: parseFloat(targetValue) || 0,
      unit: unit.trim(),
    });
  };

  return (
    <div className="bn-modal-overlay" onClick={onClose}>
      <div className="bn-modal" onClick={e => e.stopPropagation()}>
        <h3>Neuen KPI erstellen</h3>
        <form onSubmit={handleSubmit}>
          <div className="bn-form-group">
            <label>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Woechentlicher Umsatz" required />
          </div>
          <div className="bn-form-group">
            <label>Beschreibung</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div className="bn-form-group">
            <label>Datenquellen (kommagetrennt)</label>
            <input value={sources} onChange={e => setSources(e.target.value)} placeholder="revenue, emails, tasks" />
          </div>
          <div className="bn-form-group">
            <label>Aggregation</label>
            <select value={aggregation} onChange={e => setAggregation(e.target.value)}>
              <option value="sum">Summe</option>
              <option value="avg">Durchschnitt</option>
              <option value="count">Anzahl</option>
              <option value="max">Maximum</option>
              <option value="min">Minimum</option>
            </select>
          </div>
          <div className="bn-form-row">
            <div className="bn-form-group">
              <label>Zielwert</label>
              <input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value)} placeholder="0" />
            </div>
            <div className="bn-form-group">
              <label>Einheit</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="EUR, %, etc." />
            </div>
          </div>
          <div className="bn-modal-actions">
            <button type="button" className="bn-btn" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="bn-btn bn-btn--primary">Erstellen</button>
          </div>
        </form>
      </div>
    </div>
  );
};
