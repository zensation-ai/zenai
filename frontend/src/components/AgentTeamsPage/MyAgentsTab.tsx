/**
 * MyAgentsTab — Autonomous agent overview + team execution
 *
 * Upper section: Blueprint cards (active/available agents)
 * Lower section: Embedded TeamsTab for ad-hoc team execution
 *
 * Phase 143
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import axios from 'axios';
import { logError } from '../../utils/errors';
import type { AIContext } from '../ContextSwitcher';
import type { AgentBlueprint } from './types';
import { TeamsTab } from './TeamsTab';
import { RatingPromptToast, parseOriginalBlueprintId } from './RatingPromptToast';
import { PublishConfirmModal } from './PublishConfirmModal';

interface MyAgentsTabProps {
  context: AIContext;
  showAnalytics: boolean;
  analytics: {
    totals: { executions: number; successful: number; failed: number; tokens: number; successRate: number };
    byStrategy: Array<{ strategy: string; count: number; successful: number; avgExecutionTime: number; avgTokens: number }>;
    dailyTrend: Array<{ date: string; executions: number; successful: number; avgTime: number }>;
  } | null;
}

export function MyAgentsTab({ context, showAnalytics, analytics }: MyAgentsTabProps) {
  const [blueprints, setBlueprints] = useState<AgentBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [ratingForId, setRatingForId] = useState<string | null>(null);
  const [publishForId, setPublishForId] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [unpublishInFlight, setUnpublishInFlight] = useState<string | null>(null);

  const loadBlueprints = useCallback(async () => {
    try {
      const res = await axios.get('/api/agents/blueprints');
      if (res.data?.data) {
        setBlueprints(res.data.data);
      }
    } catch (err) {
      logError('MyAgentsTab:loadBlueprints', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlueprints();
  }, [loadBlueprints]);

  const handleActivate = async (bp: AgentBlueprint) => {
    setActivating(bp.id);
    try {
      await axios.post(`/api/agents/blueprints/${bp.id}/activate`, { context });
      await loadBlueprints();
    } catch (err) {
      logError('MyAgentsTab:activate', err);
    } finally {
      setActivating(null);
    }
  };

  const handleDeactivate = async (bp: AgentBlueprint) => {
    setActivating(bp.id);
    try {
      await axios.post(`/api/agents/blueprints/${bp.id}/deactivate`, { context });
      await loadBlueprints();
    } catch (err) {
      logError('MyAgentsTab:deactivate', err);
    } finally {
      setActivating(null);
    }
  };

  const handleUnpublish = async (bp: AgentBlueprint) => {
    if (!confirm(`"${bp.name}" aus der Community zurückziehen?`)) return;
    setUnpublishInFlight(bp.id);
    try {
      await axios.delete(`/api/marketplace/blueprints/${bp.id}/publish`);
      setPublishNotice('Agent wurde aus der Community zurückgezogen.');
      await loadBlueprints();
    } catch (err) {
      logError('MyAgentsTab:unpublish', err);
    } finally {
      setUnpublishInFlight(null);
    }
  };

  const builtIn = blueprints.filter(bp => bp.source === 'built_in');
  const userAgents = blueprints.filter(bp => bp.source !== 'built_in');

  return (
    <div className="my-agents-tab">
      {/* Autonomous Agents Section */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item mb-6">
        <h3 className="m-0 mb-4 text-lg">
          Autonome Agents ({builtIn.length + userAgents.length})
        </h3>

        {loading ? (
          <div className="text-center p-8 opacity-60">Lade Agents...</div>
        ) : (
          <>
            {/* Built-in agents */}
            {builtIn.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 mb-4">
                {builtIn.map(bp => (
                  <div
                    key={bp.id}
                    className="liquid-glass neuro-hover-lift p-4 rounded-xl flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{bp.icon}</span>
                      <div className="flex-1">
                        <div className="font-semibold">{bp.name}</div>
                        <div className="text-xs opacity-60">{bp.category}</div>
                      </div>
                      <span
                        className="text-[0.7rem] px-2 py-px rounded-xl bg-[var(--sc-bg)] text-[var(--sc)]"
                        style={{
                          '--sc-bg': bp.usageCount > 0 ? 'var(--accent-green, #22c55e)' : 'var(--glass-bg)',
                          '--sc': bp.usageCount > 0 ? '#fff' : 'inherit',
                        } as CSSProperties}
                      >
                        {bp.usageCount > 0 ? 'Aktiv' : 'Verfügbar'}
                      </span>
                    </div>
                    <div className="text-[0.8rem] opacity-70 leading-relaxed">
                      {bp.description}
                    </div>
                    <div className="flex gap-2 text-[0.7rem] opacity-50">
                      <span>Max {bp.maxActionsPerDay}/Tag</span>
                      <span>{bp.approvalRequired ? 'Genehmigung nötig' : 'Auto'}</span>
                    </div>
                    <button
                      type="button"
                      className={`neuro-hover-lift mt-auto px-3 py-1.5 rounded-lg text-[0.8rem] border border-[var(--glass-border)] [cursor:var(--cur)] bg-[var(--bg)] ${bp.usageCount > 0 ? 'bg-transparent text-inherit' : 'text-white'}`}
                      disabled={activating === bp.id}
                      onClick={() => bp.usageCount > 0 ? handleDeactivate(bp) : handleActivate(bp)}
                      style={{
                        '--bg': !bp.usageCount ? 'var(--accent-primary, #3b82f6)' : 'transparent',
                        '--cur': activating === bp.id ? 'wait' : 'pointer',
                      } as CSSProperties}
                    >
                      {activating === bp.id ? '...' : bp.usageCount > 0 ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* User agents */}
            {userAgents.length > 0 && (
              <>
                <h4 className="mt-4 mb-2 text-[0.9rem] opacity-70">Eigene Agents</h4>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                  {userAgents.map(bp => {
                    const origin = parseOriginalBlueprintId(bp.id);
                    return (
                      <div
                        key={bp.id}
                        className="liquid-glass neuro-hover-lift p-4 rounded-xl"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{bp.icon}</span>
                          <span className="font-semibold">{bp.name}</span>
                          <span className="text-[0.65rem] opacity-50 ml-auto">{bp.source}</span>
                        </div>
                        <div className="text-[0.8rem] opacity-70">{bp.description}</div>
                        <div className="mt-3 flex flex-wrap gap-3 items-center">
                          {origin && (
                            <button
                              type="button"
                              onClick={() => setRatingForId(origin)}
                              data-testid={`rate-btn-${bp.id}`}
                              className="text-xs underline opacity-60 hover:opacity-100 text-left cursor-pointer"
                            >
                              Diesen Agent bewerten
                            </button>
                          )}
                          {bp.source === 'user_created' && (
                            <button
                              type="button"
                              onClick={() => setPublishForId(bp.id)}
                              data-testid={`publish-btn-${bp.id}`}
                              className="text-xs underline opacity-60 hover:opacity-100 text-left cursor-pointer"
                            >
                              Als Community-Agent teilen
                            </button>
                          )}
                          {bp.source === 'community' && (
                            <button
                              type="button"
                              disabled={unpublishInFlight === bp.id}
                              onClick={() => handleUnpublish(bp)}
                              data-testid={`unpublish-btn-${bp.id}`}
                              className="text-xs underline opacity-60 hover:opacity-100 text-left cursor-pointer disabled:opacity-30"
                            >
                              {unpublishInFlight === bp.id ? 'Entferne...' : 'Aus Community zurückziehen'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {blueprints.length === 0 && (
              <div className="text-center p-8 opacity-50">
                Keine Agents vorhanden. Erstelle einen im "Erstellen"-Tab.
              </div>
            )}
          </>
        )}
      </div>

      {/* Team Execution Section */}
      <TeamsTab context={context} showAnalytics={showAnalytics} analytics={analytics} />

      {ratingForId && (
        <RatingPromptToast
          blueprintId={ratingForId}
          onClose={() => setRatingForId(null)}
        />
      )}

      {publishForId && (
        <PublishConfirmModal
          blueprintId={publishForId}
          onClose={() => setPublishForId(null)}
          onPublished={() => {
            setPublishForId(null);
            setPublishNotice('Agent eingereicht – wartet auf Moderation.');
            loadBlueprints();
          }}
        />
      )}

      {publishNotice && (
        <div
          role="status"
          data-testid="publish-notice"
          className="fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm shadow-lg"
          onClick={() => setPublishNotice(null)}
        >
          {publishNotice}
        </div>
      )}
    </div>
  );
}
