/**
 * GraphRAGPanel - Knowledge Graph Entity & Community Explorer
 *
 * Phase 58: GraphRAG Hybrid Retrieval
 * - Entity list with type filter and search
 * - Entity detail view with relations
 * - Community summaries
 * - Batch indexing trigger + status
 * - Hybrid retrieval test
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import axios from 'axios';

const ENTITY_TYPES = [
  'person',
  'organization',
  'concept',
  'technology',
  'location',
  'event',
  'product',
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

interface Entity {
  id: string;
  name: string;
  type: EntityType;
  description: string | null;
  properties: Record<string, unknown> | null;
  mention_count: number;
  created_at: string;
  updated_at: string;
}

interface EntityRelation {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  weight: number;
  source_name?: string;
  target_name?: string;
}

interface EntityDetail extends Entity {
  relations: EntityRelation[];
}

interface Community {
  id: string;
  name: string;
  summary: string;
  entity_count: number;
  level: number;
  created_at: string;
}

interface RetrievalResult {
  id: string;
  content: string;
  score: number;
  source: string;
  metadata?: Record<string, unknown>;
}

interface IndexStatus {
  status: string;
  indexed: number;
  total: number;
  last_run: string | null;
}

interface GraphRAGPanelProps {
  context: string;
}

const TYPE_COLORS: Record<EntityType, string> = {
  person: '#3b82f6',
  organization: '#1a6b7a',
  concept: '#06b6d4',
  technology: '#22c55e',
  location: '#f59e0b',
  event: '#ef4444',
  product: '#ec4899',
};

export function GraphRAGPanel({ context }: GraphRAGPanelProps) {
  const [activeTab, setActiveTab] = useState<'entities' | 'communities' | 'retrieval' | 'indexing'>('entities');

  // Entity state
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitySearch, setEntitySearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityType | ''>('');
  const [selectedEntity, setSelectedEntity] = useState<EntityDetail | null>(null);
  const [entityDetailLoading, setEntityDetailLoading] = useState(false);

  // Community state
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [refreshingCommunities, setRefreshingCommunities] = useState(false);

  // Retrieval state
  const [retrievalQuery, setRetrievalQuery] = useState('');
  const [retrievalStrategy, setRetrievalStrategy] = useState<string>('hybrid');
  const [retrievalResults, setRetrievalResults] = useState<RetrievalResult[]>([]);
  const [retrievalLoading, setRetrievalLoading] = useState(false);

  // Indexing state
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexing, setIndexing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadEntities = useCallback(async () => {
    setEntitiesLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (entitySearch) params.search = entitySearch;
      if (entityTypeFilter) params.type = entityTypeFilter;
      const res = await axios.get(`/api/${context}/graphrag/entities`, { params });
      setEntities(res.data.data || res.data.entities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Entities');
    } finally {
      setEntitiesLoading(false);
    }
  }, [context, entitySearch, entityTypeFilter]);

  const loadEntityDetail = useCallback(async (id: string) => {
    setEntityDetailLoading(true);
    try {
      const res = await axios.get(`/api/${context}/graphrag/entities/${id}`);
      setSelectedEntity(res.data.data || res.data.entity || res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Entity-Details');
    } finally {
      setEntityDetailLoading(false);
    }
  }, [context]);

  const deleteEntity = useCallback(async (id: string) => {
    if (!confirm('Entity wirklich löschen?')) return;
    try {
      await axios.delete(`/api/${context}/graphrag/entities/${id}`);
      setEntities(prev => prev.filter(e => e.id !== id));
      if (selectedEntity?.id === id) setSelectedEntity(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen');
    }
  }, [context, selectedEntity]);

  const loadCommunities = useCallback(async () => {
    setCommunitiesLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/${context}/graphrag/communities`);
      setCommunities(res.data.data || res.data.communities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Communities');
    } finally {
      setCommunitiesLoading(false);
    }
  }, [context]);

  const refreshCommunities = useCallback(async () => {
    setRefreshingCommunities(true);
    try {
      await axios.post(`/api/${context}/graphrag/communities/refresh`);
      await loadCommunities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren');
    } finally {
      setRefreshingCommunities(false);
    }
  }, [context, loadCommunities]);

  const runRetrieval = useCallback(async () => {
    if (!retrievalQuery.trim()) return;
    setRetrievalLoading(true);
    setError(null);
    try {
      const res = await axios.post(`/api/${context}/graphrag/retrieve`, {
        query: retrievalQuery,
        strategy: retrievalStrategy,
        limit: 10,
      });
      setRetrievalResults(res.data.data || res.data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler bei Retrieval');
    } finally {
      setRetrievalLoading(false);
    }
  }, [context, retrievalQuery, retrievalStrategy]);

  const loadIndexStatus = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/graphrag/index/status`);
      setIndexStatus(res.data.data || res.data);
    } catch {
      // silent - status may not be available
    }
  }, [context]);

  const triggerIndex = useCallback(async () => {
    setIndexing(true);
    try {
      await axios.post(`/api/${context}/graphrag/index`);
      setTimeout(() => loadIndexStatus(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Indexieren');
    } finally {
      setIndexing(false);
    }
  }, [context, loadIndexStatus]);

  // Load data on tab change
  useEffect(() => {
    if (activeTab === 'entities') loadEntities();
    else if (activeTab === 'communities') loadCommunities();
    else if (activeTab === 'indexing') loadIndexStatus();
  }, [activeTab, context]);

  // Reload entities on filter change
  useEffect(() => {
    if (activeTab === 'entities') {
      const timer = setTimeout(loadEntities, 300);
      return () => clearTimeout(timer);
    }
  }, [entitySearch, entityTypeFilter]);

  return (
    <div className="p-4">
      <h2 className="m-0 mb-4 text-xl font-semibold">
        Knowledge Graph (GraphRAG)
      </h2>

      {error && (
        <div className="py-3 px-4 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right bg-transparent border-0 text-red-500 cursor-pointer"
          >
            x
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-white/10">
        {([
          ['entities', 'Entities'],
          ['communities', 'Communities'],
          ['retrieval', 'Retrieval'],
          ['indexing', 'Indexing'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 border-0 cursor-pointer text-sm ${
              activeTab === key
                ? 'bg-blue-500/15 border-b-2 border-b-blue-500 text-blue-500 font-semibold'
                : 'bg-transparent border-b-2 border-b-transparent text-inherit font-normal'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Entities Tab */}
      {activeTab === 'entities' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            <input
              type="text"
              placeholder="Entities suchen..."
              value={entitySearch}
              onChange={e => setEntitySearch(e.target.value)}
              className="flex-1 min-w-[200px] py-2 px-3 rounded-md border border-white/15 bg-white/5 text-inherit text-sm"
            />
            <select
              value={entityTypeFilter}
              onChange={e => setEntityTypeFilter(e.target.value as EntityType | '')}
              className="py-2 px-3 rounded-md border border-white/15 bg-white/5 text-inherit text-sm"
            >
              <option value="">Alle Typen</option>
              {ENTITY_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {entitiesLoading ? (
            <div className="text-center p-8 opacity-50">Laden...</div>
          ) : (
            <div className="flex gap-4">
              {/* Entity list */}
              <div className="flex-1 max-h-[500px] overflow-y-auto">
                {entities.length === 0 ? (
                  <div className="text-center p-8 opacity-50">
                    Keine Entities gefunden
                  </div>
                ) : (
                  entities.map(entity => (
                    <div
                      key={entity.id}
                      onClick={() => loadEntityDetail(entity.id)}
                      className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors duration-150 ${
                        selectedEntity?.id === entity.id
                          ? 'border border-blue-500 bg-blue-500/[0.08]'
                          : 'border border-white/[0.08] bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[0.7rem] py-[0.1rem] px-[0.4rem] rounded font-semibold uppercase bg-[var(--tc-bg)] text-[var(--tc)]"
                          style={{
                            '--tc': TYPE_COLORS[entity.type],
                            '--tc-bg': TYPE_COLORS[entity.type] + '22',
                          } as CSSProperties}
                        >
                          {entity.type}
                        </span>
                        <span className="font-medium text-[0.9rem]">{entity.name}</span>
                      </div>
                      {entity.description && (
                        <div className="text-[0.8rem] opacity-60 mt-1">
                          {entity.description.slice(0, 100)}
                          {entity.description.length > 100 ? '...' : ''}
                        </div>
                      )}
                      <div className="text-xs opacity-40 mt-1">
                        {entity.mention_count} Erwähnung{entity.mention_count !== 1 ? 'en' : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Entity detail */}
              {selectedEntity && (
                <div className="flex-1 p-4 rounded-lg border border-white/10 bg-white/[0.03] max-h-[500px] overflow-y-auto">
                  {entityDetailLoading ? (
                    <div className="text-center p-8 opacity-50">Laden...</div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="m-0 text-[1.1rem]">{selectedEntity.name}</h3>
                          <span
                            className="text-[0.7rem] py-[0.1rem] px-[0.4rem] rounded font-semibold uppercase bg-[var(--tc-bg)] text-[var(--tc)]"
                            style={{
                              '--tc': TYPE_COLORS[selectedEntity.type],
                              '--tc-bg': TYPE_COLORS[selectedEntity.type] + '22',
                            } as CSSProperties}
                          >
                            {selectedEntity.type}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteEntity(selectedEntity.id)}
                          className="py-1 px-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 cursor-pointer text-xs"
                        >
                          Löschen
                        </button>
                      </div>

                      {selectedEntity.description && (
                        <p className="text-sm opacity-80 m-0 mb-4">
                          {selectedEntity.description}
                        </p>
                      )}

                      <h4 className="m-0 mb-2 text-[0.9rem] opacity-70">
                        Relationen ({selectedEntity.relations?.length || 0})
                      </h4>
                      {(!selectedEntity.relations || selectedEntity.relations.length === 0) ? (
                        <div className="text-[0.8rem] opacity-40">Keine Relationen</div>
                      ) : (
                        selectedEntity.relations.map(rel => (
                          <div
                            key={rel.id}
                            className="p-2 mb-[0.375rem] rounded-md bg-white/[0.04] text-[0.8rem]"
                          >
                            <span className="opacity-60">
                              {rel.source_name || rel.source_id}
                            </span>
                            <span className="mx-2 text-blue-500 font-medium">
                              {rel.relation_type}
                            </span>
                            <span className="opacity-60">
                              {rel.target_name || rel.target_id}
                            </span>
                            <span className="float-right opacity-40">
                              w: {rel.weight?.toFixed(2) || '1.00'}
                            </span>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Communities Tab */}
      {activeTab === 'communities' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm opacity-60">
              {communities.length} Communities
            </span>
            <button
              onClick={refreshCommunities}
              disabled={refreshingCommunities}
              className={`py-[0.4rem] px-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-500 text-[0.8rem] ${
                refreshingCommunities ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'
              }`}
            >
              {refreshingCommunities ? 'Aktualisiere...' : 'Aktualisieren'}
            </button>
          </div>

          {communitiesLoading ? (
            <div className="text-center p-8 opacity-50">Laden...</div>
          ) : communities.length === 0 ? (
            <div className="text-center p-8 opacity-50">
              Keine Communities gefunden. Indexierung starten um Communities zu generieren.
            </div>
          ) : (
            communities.map(community => (
              <div
                key={community.id}
                className="p-4 mb-3 rounded-lg border border-white/[0.08] bg-white/[0.03]"
              >
                <div className="flex justify-between items-center mb-2">
                  <h4 className="m-0 text-[0.95rem]">{community.name}</h4>
                  <span className="text-xs opacity-50">
                    {community.entity_count} Entities | Level {community.level}
                  </span>
                </div>
                <p className="m-0 text-[0.85rem] opacity-70 leading-normal">
                  {community.summary}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Retrieval Tab */}
      {activeTab === 'retrieval' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Suchanfrage eingeben..."
              value={retrievalQuery}
              onChange={e => setRetrievalQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runRetrieval()}
              className="flex-1 py-2 px-3 rounded-md border border-white/15 bg-white/5 text-inherit text-sm"
            />
            <select
              value={retrievalStrategy}
              onChange={e => setRetrievalStrategy(e.target.value)}
              className="py-2 px-3 rounded-md border border-white/15 bg-white/5 text-inherit text-sm"
            >
              <option value="hybrid">Hybrid</option>
              <option value="vector">Vector</option>
              <option value="graph">Graph</option>
              <option value="community">Community</option>
              <option value="bm25">BM25</option>
            </select>
            <button
              onClick={runRetrieval}
              disabled={retrievalLoading || !retrievalQuery.trim()}
              className={`py-2 px-4 rounded-md border-0 bg-blue-500 text-white text-sm ${
                retrievalLoading || !retrievalQuery.trim() ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'
              }`}
            >
              {retrievalLoading ? 'Suche...' : 'Suchen'}
            </button>
          </div>

          {retrievalResults.length > 0 && (
            <div>
              <div className="text-[0.8rem] opacity-50 mb-3">
                {retrievalResults.length} Ergebnis{retrievalResults.length !== 1 ? 'se' : ''}
              </div>
              {retrievalResults.map((result, idx) => (
                <div
                  key={result.id || idx}
                  className="p-3 mb-2 rounded-lg border border-white/[0.08] bg-white/[0.03]"
                >
                  <div className="flex justify-between mb-[0.375rem]">
                    <span className="text-xs opacity-50 uppercase">
                      {result.source}
                    </span>
                    <span className="text-xs py-[0.1rem] px-[0.4rem] rounded bg-green-500/15 text-green-500">
                      Score: {result.score?.toFixed(3) || 'N/A'}
                    </span>
                  </div>
                  <p className="m-0 text-[0.85rem] leading-normal">
                    {result.content?.slice(0, 300)}
                    {(result.content?.length || 0) > 300 ? '...' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!retrievalLoading && retrievalResults.length === 0 && retrievalQuery && (
            <div className="text-center p-8 opacity-40 text-sm">
              Enter drucken oder Suchen klicken um Ergebnisse zu laden
            </div>
          )}
        </div>
      )}

      {/* Indexing Tab */}
      {activeTab === 'indexing' && (
        <div>
          <div className="p-4 rounded-lg border border-white/[0.08] bg-white/[0.03] mb-4">
            <h4 className="m-0 mb-3 text-[0.95rem]">Index-Status</h4>
            {indexStatus ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs opacity-50">Status</div>
                  <div className="text-[0.9rem] font-medium">
                    {indexStatus.status}
                  </div>
                </div>
                <div>
                  <div className="text-xs opacity-50">Indexiert</div>
                  <div className="text-[0.9rem] font-medium">
                    {indexStatus.indexed} / {indexStatus.total}
                  </div>
                </div>
                <div className="col-span-full">
                  <div className="text-xs opacity-50">Letzter Lauf</div>
                  <div className="text-[0.9rem]">
                    {indexStatus.last_run
                      ? new Date(indexStatus.last_run).toLocaleString('de-DE')
                      : 'Noch nie'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[0.85rem] opacity-50">Status nicht verfügbar</div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={triggerIndex}
              disabled={indexing}
              className={`py-2 px-5 rounded-md border-0 bg-green-500 text-white text-sm font-medium ${
                indexing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'
              }`}
            >
              {indexing ? 'Wird indexiert...' : 'Indexierung starten'}
            </button>
            <button
              onClick={loadIndexStatus}
              className="py-2 px-4 rounded-md border border-white/15 bg-transparent text-inherit cursor-pointer text-sm"
            >
              Status aktualisieren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
