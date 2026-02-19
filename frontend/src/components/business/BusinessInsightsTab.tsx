/**
 * BusinessInsightsTab - AI-generated Business Insights
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { AIContext } from '../ContextSwitcher';

interface BusinessInsightsTabProps {
  context: AIContext;
}

interface ActionItem {
  title: string;
  priority?: string;
}

interface Insight {
  id: string;
  insight_type: 'anomaly' | 'trend' | 'recommendation' | 'alert' | 'milestone';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  data_source: string | null;
  related_metrics: Record<string, unknown>;
  action_items: ActionItem[];
  status: 'active' | 'dismissed' | 'acted_on' | 'expired';
  generated_at: string;
}

type InsightFilter = 'all' | 'anomaly' | 'trend' | 'recommendation' | 'alert' | 'milestone';

const FILTERS: { id: InsightFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'anomaly', label: 'Anomalien' },
  { id: 'trend', label: 'Trends' },
  { id: 'recommendation', label: 'Empfehlungen' },
  { id: 'alert', label: 'Alerts' },
  { id: 'milestone', label: 'Meilensteine' },
];

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Kritisch',
  warning: 'Warnung',
  info: 'Info',
};

const SOURCE_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  ga4: 'Google Analytics',
  gsc: 'Search Console',
  uptime: 'UptimeRobot',
  lighthouse: 'Lighthouse',
  ai: 'AI-Analyse',
};

export const BusinessInsightsTab: React.FC<BusinessInsightsTabProps> = () => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [filter, setFilter] = useState<InsightFilter>('all');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await axios.get('/api/business/insights');
      if (res.data.success) {
        setInsights(res.data.insights ?? []);
      }
    } catch {
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const generateInsights = async () => {
    setGenerating(true);
    try {
      await axios.post('/api/business/insights/generate');
      await fetchInsights();
    } catch {
      // Generation may fail if no connectors configured
    } finally {
      setGenerating(false);
    }
  };

  const dismissInsight = async (id: string) => {
    try {
      await axios.post(`/api/business/insights/${id}/dismiss`);
      setInsights(prev => prev.filter(i => i.id !== id));
    } catch {
      // Ignore
    }
  };

  const actOnInsight = async (id: string) => {
    try {
      await axios.post(`/api/business/insights/${id}/act`);
      setInsights(prev => prev.filter(i => i.id !== id));
    } catch {
      // Ignore
    }
  };

  if (loading) {
    return <div className="business-empty"><div className="business-empty-icon">💡</div><div className="business-empty-text">Insights werden geladen...</div></div>;
  }

  const filtered = filter === 'all' ? insights : insights.filter(i => i.insight_type === filter);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={`business-btn ${filter === f.id ? 'primary' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="business-btn primary" onClick={generateInsights} disabled={generating}>
          {generating ? 'Generiere...' : '💡 Insights generieren'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="business-empty">
          <div className="business-empty-icon">💡</div>
          <div className="business-empty-title">Keine aktiven Insights</div>
          <div className="business-empty-text">
            Klicke auf &quot;Insights generieren&quot; um AI-Analysen basierend auf deinen Business-Metriken zu erstellen.
          </div>
        </div>
      ) : (
        filtered.map(insight => (
          <div key={insight.id} className={`business-insight-card ${insight.severity}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div className="business-insight-title">{insight.title}</div>
              <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                <span className={`business-kpi-badge ${insight.severity === 'critical' ? 'negative' : insight.severity === 'warning' ? 'neutral' : 'positive'}`}>
                  {SEVERITY_LABELS[insight.severity] ?? insight.severity}
                </span>
              </div>
            </div>
            <div className="business-insight-desc">{insight.description}</div>
            {insight.data_source && (
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.25rem' }}>
                Quelle: {SOURCE_LABELS[insight.data_source] ?? insight.data_source}
              </div>
            )}
            {insight.action_items && insight.action_items.length > 0 && (
              <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {insight.action_items.map((item, idx) => (
                  <div key={idx} style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', padding: '0.2rem 0' }}>
                    → {item.title}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="business-btn" onClick={() => actOnInsight(insight.id)}>
                ✅ Erledigt
              </button>
              <button type="button" className="business-btn" onClick={() => dismissInsight(insight.id)}>
                ✕ Verwerfen
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
