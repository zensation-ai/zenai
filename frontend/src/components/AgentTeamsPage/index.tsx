/**
 * AgentTeamsPage Component
 *
 * Frontend for the Multi-Agent Task Orchestration system.
 * 6 Tabs: My Agents, Create, Marketplace, Analytics, Workflows, A2A.
 *
 * Phase 45 + 60 + 64 + 121 + 143 (Agent Ecosystem Expansion)
 */

import { useState, useCallback, type CSSProperties } from 'react';
import axios from 'axios';
import { getTimeBasedGreeting } from '../../utils/aiPersonality';
import { logError } from '../../utils/errors';
import { A2AAgentsPanel } from '../A2AAgentsPanel';
import { WorkflowBuilder } from '../WorkflowBuilder/WorkflowBuilder';
import type { AgentTeamsPageProps, AgentTab } from './types';
import { AGENT_TABS } from './types';
import { MyAgentsTab } from './MyAgentsTab';
import { CreateAgentTab } from './CreateAgentTab';
import { MarketplaceTab } from './MarketplaceTab';
import { AnalyticsTab } from './AnalyticsTab';

export function AgentTeamsPage({ context, onBack, embedded }: AgentTeamsPageProps) {
  const greeting = getTimeBasedGreeting();
  const [activeTab, setActiveTab] = useState<AgentTab>('my-agents');

  // Analytics state (loaded on demand, shared with MyAgentsTab → TeamsTab)
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
            &larr; Zurück
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Agent Ecosystem</h1>
            <span className="greeting-subtext neuro-subtext-emotional">
              Autonome Agents erstellen, verwalten und optimieren
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
      <div className="strategy-grid mb-6">
        {AGENT_TABS.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            className={`strategy-card neuro-hover-lift [animation-delay:var(--delay)] ${activeTab === tab.id ? 'active' : ''}`}
            style={{ '--delay': `${index * 50}ms` } as CSSProperties}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="strategy-icon">{tab.icon}</span>
            <span className="strategy-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'my-agents' && (
        <MyAgentsTab context={context} showAnalytics={showAnalytics} analytics={analytics} />
      )}
      {activeTab === 'create' && (
        <CreateAgentTab context={context} />
      )}
      {activeTab === 'marketplace' && (
        <MarketplaceTab />
      )}
      {activeTab === 'analytics' && (
        <AnalyticsTab />
      )}
      {activeTab === 'workflows' && (
        <div className="agent-teams-section liquid-glass neuro-stagger-item h-[600px]">
          <WorkflowBuilder />
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
