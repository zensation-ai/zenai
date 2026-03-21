/**
 * AgentTeamsPage Component
 *
 * Frontend for the Multi-Agent Task Orchestration system.
 * Features: SSE Streaming, Agent Templates, Coder Agent, Analytics.
 * Tabs: Teams (Phase 45), Agenten (Phase 64), Workflows (Phase 64), A2A (Phase 60).
 *
 * Phase 45 + 60 + 64 + 121 (decomposed)
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import { getTimeBasedGreeting } from '../../utils/aiPersonality';
import { logError } from '../../utils/errors';
import { AgentIdentityPanel } from '../AgentIdentityPanel';
import { A2AAgentsPanel } from '../A2AAgentsPanel';
import { WorkflowPanel } from '../WorkflowPanel';
import '../../neurodesign.css';
import '../AgentTeamsPage.css';

import type { AgentTeamsPageProps, AgentTab } from './types';
import { AGENT_TABS } from './types';
import { TeamsTab } from './TeamsTab';

export function AgentTeamsPage({ context, onBack, embedded }: AgentTeamsPageProps) {
  const greeting = getTimeBasedGreeting();
  const [activeTab, setActiveTab] = useState<AgentTab>('teams');

  // Analytics state (loaded on demand, shared with TeamsTab)
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<{
    totals: { executions: number; successful: number; failed: number; tokens: number; successRate: number };
    byStrategy: Array<{ strategy: string; count: number; successful: number; avgExecutionTime: number; avgTokens: number }>;
    dailyTrend: Array<{ date: string; executions: number; successful: number; avgTime: number }>;
  } | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await axios.get('/api/agents/analytics', {
        params: { context, days: 30 },
      });
      if (res.data.success) {
        setAnalytics(res.data);
      }
    } catch (err) {
      logError('AgentTeamsPage:loadAnalytics', err);
    }
  }, [context]);

  return (
    <div className="agent-teams-page neuro-page-enter">
      {!embedded && (
        <div className="agent-teams-header liquid-glass-nav">
          <button className="back-button neuro-hover-lift" onClick={onBack} type="button">
            &larr; Zurueck
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Agent Teams</h1>
            <span className="greeting-subtext neuro-subtext-emotional">
              Multi-Agent Aufgaben orchestrieren
            </span>
          </div>
          <button
            type="button"
            className="analytics-toggle-btn neuro-hover-lift"
            onClick={() => {
              setShowAnalytics(!showAnalytics);
              if (!analytics) loadAnalytics();
            }}
            aria-label="Analytics anzeigen"
            aria-expanded={showAnalytics}
            title="Analytics (letzte 30 Tage)"
          >
            📊
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="strategy-grid" style={{ marginBottom: '1.5rem' }}>
        {AGENT_TABS.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            className={`strategy-card neuro-hover-lift ${activeTab === tab.id ? 'active' : ''}`}
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="strategy-icon">{tab.icon}</span>
            <span className="strategy-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'teams' && (
        <TeamsTab context={context} showAnalytics={showAnalytics} analytics={analytics} />
      )}
      {activeTab === 'identities' && (
        <div className="agent-teams-section liquid-glass neuro-stagger-item">
          <AgentIdentityPanel />
        </div>
      )}
      {activeTab === 'workflows' && (
        <div className="agent-teams-section liquid-glass neuro-stagger-item">
          <WorkflowPanel context={context} />
        </div>
      )}
      {activeTab === 'a2a' && (
        <div className="agent-teams-section liquid-glass neuro-stagger-item">
          <A2AAgentsPanel context={context} />
        </div>
      )}
    </div>
  );
}
