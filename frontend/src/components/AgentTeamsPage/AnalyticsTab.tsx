/**
 * AnalyticsTab — Agent system analytics and optimization suggestions
 *
 * Phase 143
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import axios from 'axios';
import { logError } from '../../utils/errors';
import type { AgentSystemStats } from './types';

interface Suggestion {
  type: string;
  agentId: string;
  agentName: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

interface UsageTrend {
  date: string;
  executions: number;
  tokensUsed: number;
  successRate: number;
}

export function AnalyticsTab() {
  const [overview, setOverview] = useState<AgentSystemStats | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [trends, setTrends] = useState<UsageTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [overviewRes, suggestionsRes, trendsRes] = await Promise.all([
        axios.get('/api/agents/analytics/overview').catch(() => ({ data: { data: null } })),
        axios.get('/api/agents/analytics/suggestions').catch(() => ({ data: { data: [] } })),
        axios.get('/api/agents/analytics/trends').catch(() => ({ data: { data: [] } })),
      ]);
      setOverview(overviewRes.data?.data || null);
      setSuggestions(suggestionsRes.data?.data || []);
      setTrends(trendsRes.data?.data || []);
    } catch (err) {
      logError('AnalyticsTab:load', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const severityColor = (s: string) => {
    if (s === 'critical') return '#ef4444';
    if (s === 'warning') return '#f59e0b';
    return '#3b82f6';
  };

  if (loading) {
    return <div className="text-center p-12 opacity-60">Lade Analytics...</div>;
  }

  return (
    <div className="analytics-tab">
      {/* Overview Stats */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item mb-6">
        <h3 className="m-0 mb-4 text-lg">System-Übersicht</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {[
            { label: 'Agents gesamt', value: overview?.totalAgents ?? '-' },
            { label: 'Aktive Agents', value: overview?.activeAgents ?? '-' },
            { label: 'Ausführungen heute', value: overview?.totalExecutionsToday ?? '-' },
            { label: 'Tokens heute', value: overview?.totalTokensToday?.toLocaleString('de-DE') ?? '-' },
            { label: 'Erfolgsrate', value: overview?.overallSuccessRate != null ? `${Math.round(overview.overallSuccessRate * 100)}%` : '-' },
            { label: 'Budget-Auslastung', value: overview?.tokenBudgetUtilization != null ? `${Math.round(overview.tokenBudgetUtilization * 100)}%` : '-' },
          ].map(stat => (
            <div key={stat.label} className="liquid-glass p-3 rounded-[10px] text-center">
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-[0.7rem] opacity-60 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Top performers */}
        {(overview?.topPerformingAgent || overview?.mostUsedAgent) && (
          <div className="flex gap-4 mt-4 flex-wrap">
            {overview?.topPerformingAgent && (
              <div className="liquid-glass flex-1 p-3 rounded-lg min-w-[200px]">
                <div className="text-[0.7rem] opacity-60">Top Performer</div>
                <div className="font-semibold">{overview.topPerformingAgent.name}</div>
                <div className="text-[0.8rem] text-green-500">
                  {Math.round(overview.topPerformingAgent.successRate * 100)}% Erfolg
                </div>
              </div>
            )}
            {overview?.mostUsedAgent && (
              <div className="liquid-glass flex-1 p-3 rounded-lg min-w-[200px]">
                <div className="text-[0.7rem] opacity-60">Meistgenutzt</div>
                <div className="font-semibold">{overview.mostUsedAgent.name}</div>
                <div className="text-[0.8rem] text-blue-500">
                  {overview.mostUsedAgent.executionCount} Ausführungen
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Usage Trends */}
      {trends.length > 0 && (
        <div className="agent-teams-section liquid-glass neuro-stagger-item mb-6">
          <h3 className="m-0 mb-3 text-base">Nutzungstrend (7 Tage)</h3>
          <div className="flex gap-2 overflow-x-auto">
            {trends.map(t => (
              <div
                key={t.date}
                className="liquid-glass px-3 py-2 rounded-lg min-w-[100px] text-center flex-none"
              >
                <div className="text-[0.7rem] opacity-60">{new Date(t.date).toLocaleDateString('de-DE', { weekday: 'short' })}</div>
                <div className="text-xl font-semibold">{t.executions}</div>
                <div className="text-[0.65rem] opacity-50">{t.tokensUsed.toLocaleString('de-DE')} Tokens</div>
                <div className={`text-[0.65rem] ${t.successRate >= 0.8 ? 'text-green-500' : 'text-amber-500'}`}>
                  {Math.round(t.successRate * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimization Suggestions */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <h3 className="m-0 mb-3 text-base">
          Optimierungsvorschlaege ({suggestions.length})
        </h3>
        {suggestions.length > 0 ? (
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="liquid-glass p-3 rounded-lg [border-left:3px_solid_var(--sc-border)]"
                style={{ '--sc-border': severityColor(s.severity) } as CSSProperties}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-[0.85rem]">{s.agentName}</span>
                  <span
                    className="text-[0.65rem] px-1.5 py-px rounded bg-[var(--sc-bg)] text-[var(--sc)]"
                    style={{
                      '--sc': severityColor(s.severity),
                      '--sc-bg': `${severityColor(s.severity)}22`,
                    } as CSSProperties}
                  >
                    {s.type.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-[0.8rem] opacity-70">{s.message}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-6 opacity-50 text-[0.85rem]">
            Alle Agents arbeiten optimal.
          </div>
        )}
      </div>
    </div>
  );
}
