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

import { useState, useEffect, useCallback } from 'react';
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
  organization: '#8b5cf6',
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
    if (!confirm('Entity wirklich loeschen?')) return;
    try {
      await axios.delete(`/api/${context}/graphrag/entities/${id}`);
      setEntities(prev => prev.filter(e => e.id !== id));
      if (selectedEntity?.id === id) setSelectedEntity(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Loeschen');
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
    <div style={{ padding: '1rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: 600 }}>
        Knowledge Graph (GraphRAG)
      </h2>

      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '0.875rem',
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ float: 'right', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
          >
            x
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {([
          ['entities', 'Entities'],
          ['communities', 'Communities'],
          ['retrieval', 'Retrieval'],
          ['indexing', 'Indexing'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '0.5rem 1rem',
              background: activeTab === key ? 'rgba(59,130,246,0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === key ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === key ? '#3b82f6' : 'inherit',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: activeTab === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Entities Tab */}
      {activeTab === 'entities' && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Entities suchen..."
              value={entitySearch}
              onChange={e => setEntitySearch(e.target.value)}
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: 'inherit',
                fontSize: '0.875rem',
              }}
            />
            <select
              value={entityTypeFilter}
              onChange={e => setEntityTypeFilter(e.target.value as EntityType | '')}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: 'inherit',
                fontSize: '0.875rem',
              }}
            >
              <option value="">Alle Typen</option>
              {ENTITY_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {entitiesLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>Laden...</div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem' }}>
              {/* Entity list */}
              <div style={{ flex: 1, maxHeight: '500px', overflowY: 'auto' }}>
                {entities.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                    Keine Entities gefunden
                  </div>
                ) : (
                  entities.map(entity => (
                    <div
                      key={entity.id}
                      onClick={() => loadEntityDetail(entity.id)}
                      style={{
                        padding: '0.75rem',
                        marginBottom: '0.5rem',
                        borderRadius: '8px',
                        border: selectedEntity?.id === entity.id
                          ? '1px solid #3b82f6'
                          : '1px solid rgba(255,255,255,0.08)',
                        background: selectedEntity?.id === entity.id
                          ? 'rgba(59,130,246,0.08)'
                          : 'rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            background: TYPE_COLORS[entity.type] + '22',
                            color: TYPE_COLORS[entity.type],
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {entity.type}
                        </span>
                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{entity.name}</span>
                      </div>
                      {entity.description && (
                        <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '0.25rem' }}>
                          {entity.description.slice(0, 100)}
                          {entity.description.length > 100 ? '...' : ''}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', opacity: 0.4, marginTop: '0.25rem' }}>
                        {entity.mention_count} Erwaehnung{entity.mention_count !== 1 ? 'en' : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Entity detail */}
              {selectedEntity && (
                <div style={{
                  flex: 1,
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.03)',
                  maxHeight: '500px',
                  overflowY: 'auto',
                }}>
                  {entityDetailLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>Laden...</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedEntity.name}</h3>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              background: TYPE_COLORS[selectedEntity.type] + '22',
                              color: TYPE_COLORS[selectedEntity.type],
                              fontWeight: 600,
                              textTransform: 'uppercase',
                            }}
                          >
                            {selectedEntity.type}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteEntity(selectedEntity.id)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '4px',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          Loeschen
                        </button>
                      </div>

                      {selectedEntity.description && (
                        <p style={{ fontSize: '0.875rem', opacity: 0.8, margin: '0 0 1rem' }}>
                          {selectedEntity.description}
                        </p>
                      )}

                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', opacity: 0.7 }}>
                        Relationen ({selectedEntity.relations?.length || 0})
                      </h4>
                      {(!selectedEntity.relations || selectedEntity.relations.length === 0) ? (
                        <div style={{ fontSize: '0.8rem', opacity: 0.4 }}>Keine Relationen</div>
                      ) : (
                        selectedEntity.relations.map(rel => (
                          <div
                            key={rel.id}
                            style={{
                              padding: '0.5rem',
                              marginBottom: '0.375rem',
                              borderRadius: '6px',
                              background: 'rgba(255,255,255,0.04)',
                              fontSize: '0.8rem',
                            }}
                          >
                            <span style={{ opacity: 0.6 }}>
                              {rel.source_name || rel.source_id}
                            </span>
                            <span style={{ margin: '0 0.5rem', color: '#3b82f6', fontWeight: 500 }}>
                              {rel.relation_type}
                            </span>
                            <span style={{ opacity: 0.6 }}>
                              {rel.target_name || rel.target_id}
                            </span>
                            <span style={{ float: 'right', opacity: 0.4 }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.875rem', opacity: 0.6 }}>
              {communities.length} Communities
            </span>
            <button
              onClick={refreshCommunities}
              disabled={refreshingCommunities}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(59,130,246,0.3)',
                background: 'rgba(59,130,246,0.1)',
                color: '#3b82f6',
                cursor: refreshingCommunities ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
                opacity: refreshingCommunities ? 0.5 : 1,
              }}
            >
              {refreshingCommunities ? 'Aktualisiere...' : 'Aktualisieren'}
            </button>
          </div>

          {communitiesLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>Laden...</div>
          ) : communities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
              Keine Communities gefunden. Indexierung starten um Communities zu generieren.
            </div>
          ) : (
            communities.map(community => (
              <div
                key={community.id}
                style={{
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{community.name}</h4>
                  <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                    {community.entity_count} Entities | Level {community.level}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7, lineHeight: 1.5 }}>
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
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Suchanfrage eingeben..."
              value={retrievalQuery}
              onChange={e => setRetrievalQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runRetrieval()}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: 'inherit',
                fontSize: '0.875rem',
              }}
            />
            <select
              value={retrievalStrategy}
              onChange={e => setRetrievalStrategy(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: 'inherit',
                fontSize: '0.875rem',
              }}
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
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: '#3b82f6',
                color: '#fff',
                cursor: retrievalLoading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                opacity: retrievalLoading || !retrievalQuery.trim() ? 0.5 : 1,
              }}
            >
              {retrievalLoading ? 'Suche...' : 'Suchen'}
            </button>
          </div>

          {retrievalResults.length > 0 && (
            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '0.75rem' }}>
                {retrievalResults.length} Ergebnis{retrievalResults.length !== 1 ? 'se' : ''}
              </div>
              {retrievalResults.map((result, idx) => (
                <div
                  key={result.id || idx}
                  style={{
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase' }}>
                      {result.source}
                    </span>
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      background: 'rgba(34,197,94,0.15)',
                      color: '#22c55e',
                    }}>
                      Score: {result.score?.toFixed(3) || 'N/A'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
                    {result.content?.slice(0, 300)}
                    {(result.content?.length || 0) > 300 ? '...' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!retrievalLoading && retrievalResults.length === 0 && retrievalQuery && (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.4, fontSize: '0.875rem' }}>
              Enter drucken oder Suchen klicken um Ergebnisse zu laden
            </div>
          )}
        </div>
      )}

      {/* Indexing Tab */}
      {activeTab === 'indexing' && (
        <div>
          <div style={{
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            marginBottom: '1rem',
          }}>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>Index-Status</h4>
            {indexStatus ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Status</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                    {indexStatus.status}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Indexiert</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                    {indexStatus.indexed} / {indexStatus.total}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Letzter Lauf</div>
                  <div style={{ fontSize: '0.9rem' }}>
                    {indexStatus.last_run
                      ? new Date(indexStatus.last_run).toLocaleString('de-DE')
                      : 'Noch nie'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', opacity: 0.5 }}>Status nicht verfuegbar</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={triggerIndex}
              disabled={indexing}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                border: 'none',
                background: '#22c55e',
                color: '#fff',
                cursor: indexing ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                opacity: indexing ? 0.5 : 1,
              }}
            >
              {indexing ? 'Wird indexiert...' : 'Indexierung starten'}
            </button>
            <button
              onClick={loadIndexStatus}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Status aktualisieren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
