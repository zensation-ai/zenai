/**
 * ConnectorSettings - Manage Business Data Sources
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AIContext } from '../ContextSwitcher';
import { getApiBaseUrl, getApiFetchHeaders } from '../../utils/apiConfig';
import type { BusinessConnector, BusinessSourceType } from '../../types/business';

interface ConnectorSettingsProps {
  context: AIContext;
}

interface ConnectorStatus {
  type: string;
  available: boolean;
  label: string;
}

const CONNECTOR_INFO: Record<string, { icon: string; label: string; description: string }> = {
  stripe: { icon: '💳', label: 'Stripe', description: 'Revenue-Daten, Subscriptions, Payments' },
  gsc: { icon: '🔍', label: 'Google Search Console', description: 'SEO-Metriken, Rankings, Suchanfragen' },
  ga4: { icon: '📊', label: 'Google Analytics 4', description: 'Traffic, Sessions, Conversions' },
  uptime: { icon: '🔄', label: 'UptimeRobot', description: 'Uptime-Monitoring, Incidents' },
  lighthouse: { icon: '⚡', label: 'Lighthouse', description: 'Performance-Scores, Web Vitals' },
};

export const ConnectorSettings: React.FC<ConnectorSettingsProps> = () => {
  const [connectors, setConnectors] = useState<BusinessConnector[]>([]);
  const [, setStatuses] = useState<ConnectorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ type: string; success: boolean; message: string } | null>(null);

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/business/connectors`, {
        headers: getApiFetchHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setConnectors(data.connectors ?? []);
        setStatuses(data.available ?? []);
      }
    } catch {
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConnectors(); }, [fetchConnectors]);

  const testConnector = async (type: string) => {
    setTesting(type);
    setTestResult(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/business/connectors/${type}/test`, {
        method: 'POST',
        headers: getApiFetchHeaders('application/json'),
      });
      const data = await res.json();
      setTestResult({ type, success: data.test?.success ?? false, message: data.test?.message ?? 'Unknown' });
    } catch (error) {
      setTestResult({ type, success: false, message: error instanceof Error ? error.message : 'Verbindungsfehler' });
    } finally {
      setTesting(null);
    }
  };

  const addConnector = async (sourceType: BusinessSourceType) => {
    const info = CONNECTOR_INFO[sourceType];
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/business/connectors`, {
        method: 'POST',
        headers: getApiFetchHeaders('application/json'),
        body: JSON.stringify({
          source_type: sourceType,
          display_name: info?.label ?? sourceType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchConnectors();
      }
    } catch {
      // Ignore
    }
  };

  const removeConnector = async (id: string) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/business/connectors/${id}`, {
        method: 'DELETE',
        headers: getApiFetchHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setConnectors(prev => prev.filter(c => c.id !== id));
      }
    } catch {
      // Ignore
    }
  };

  const triggerCollection = async () => {
    try {
      await fetch(`${getApiBaseUrl()}/api/business/connectors/collect`, {
        method: 'POST',
        headers: getApiFetchHeaders('application/json'),
      });
    } catch {
      // Ignore
    }
  };

  const authorizeGoogle = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/business/connectors/google/authorize`, {
        headers: getApiFetchHeaders(),
      });
      const data = await res.json();
      if (data.success && data.authorizeUrl) {
        window.open(data.authorizeUrl, '_blank');
      }
    } catch {
      // Ignore
    }
  };

  if (loading) {
    return <div className="business-empty"><div className="business-empty-icon">🔗</div><div className="business-empty-text">Connectors werden geladen...</div></div>;
  }

  const configuredTypes = new Set(connectors.map(c => c.source_type));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ color: 'rgba(255,255,255,0.9)', margin: 0 }}>Datenquellen</h3>
        <button className="business-btn" onClick={triggerCollection}>🔄 Daten sammeln</button>
      </div>

      {/* Configured Connectors */}
      {connectors.length > 0 && (
        <div className="business-section">
          <div className="business-section-title">✅ Konfigurierte Connectors</div>
          <div className="business-connector-grid">
            {connectors.map((c) => {
              const info = CONNECTOR_INFO[c.source_type];
              return (
                <div key={c.id} className="business-connector-card">
                  <div className="business-connector-header">
                    <div className="business-connector-name">
                      <span>{info?.icon ?? '📦'}</span>
                      <span>{c.display_name}</span>
                    </div>
                    <span className={`status-dot ${c.status}`} />
                  </div>
                  <div className="business-connector-meta">
                    {c.last_sync ? `Letzter Sync: ${new Date(c.last_sync).toLocaleString('de-DE')}` : 'Noch nicht synchronisiert'}
                  </div>
                  {c.last_error && (
                    <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.25rem' }}>{c.last_error}</div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                      className="business-btn"
                      onClick={() => testConnector(c.source_type)}
                      disabled={testing === c.source_type}
                    >
                      {testing === c.source_type ? '...' : '🔌 Testen'}
                    </button>
                    <button className="business-btn" onClick={() => removeConnector(c.id)}>🗑️ Entfernen</button>
                  </div>
                  {testResult?.type === c.source_type && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      background: testResult.success ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                      color: testResult.success ? '#34d399' : '#f87171',
                      fontSize: '0.8rem',
                    }}>
                      {testResult.message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Connectors */}
      <div className="business-section">
        <div className="business-section-title">➕ Verfuegbare Connectors</div>
        <div className="business-connector-grid">
          {Object.entries(CONNECTOR_INFO).map(([type, info]) => {
            const isConfigured = configuredTypes.has(type as BusinessSourceType);
            const isGoogleType = type === 'gsc' || type === 'ga4';
            return (
              <div key={type} className="business-connector-card" style={{ opacity: isConfigured ? 0.5 : 1 }}>
                <div className="business-connector-header">
                  <div className="business-connector-name">
                    <span>{info.icon}</span>
                    <span>{info.label}</span>
                  </div>
                  {isConfigured && <span className="business-kpi-badge positive">Aktiv</span>}
                </div>
                <div className="business-connector-meta">{info.description}</div>
                {!isConfigured && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button className="business-btn primary" onClick={() => addConnector(type as BusinessSourceType)}>
                      Hinzufuegen
                    </button>
                    {isGoogleType && (
                      <button className="business-btn" onClick={authorizeGoogle}>
                        🔑 Google Auth
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
