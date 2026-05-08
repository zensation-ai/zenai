/**
 * MarketplaceTab — Browse and install community agent blueprints
 *
 * Phase 143
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { logError } from '../../utils/errors';
import type { AgentBlueprint } from './types';
import { BlueprintDetailModal } from './BlueprintDetailModal';
import { InstallConfirmModal } from './InstallConfirmModal';

const CATEGORIES = [
  { id: '', label: 'Alle' },
  { id: 'productivity', label: 'Produktivität' },
  { id: 'communication', label: 'Kommunikation' },
  { id: 'research', label: 'Recherche' },
  { id: 'finance', label: 'Finanzen' },
  { id: 'knowledge', label: 'Wissen' },
  { id: 'development', label: 'Entwicklung' },
];

const SORT_OPTIONS = [
  { id: 'popular', label: 'Beliebt' },
  { id: 'rating', label: 'Bewertung' },
  { id: 'newest', label: 'Neueste' },
];

const VALID_SORTS = new Set(SORT_OPTIONS.map(s => s.id));
const VALID_CATEGORIES = new Set(CATEGORIES.map(c => c.id).filter(Boolean));

export function MarketplaceTab() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialCategory = (() => {
    const v = searchParams.get('category') ?? '';
    return VALID_CATEGORIES.has(v) ? v : '';
  })();
  const initialSort = (() => {
    const v = searchParams.get('sort') ?? 'popular';
    return VALID_SORTS.has(v) ? v : 'popular';
  })();
  const initialSearch = searchParams.get('q') ?? '';

  const [blueprints, setBlueprints] = useState<AgentBlueprint[]>([]);
  const [featured, setFeatured] = useState<AgentBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState(initialSort);
  const [search, setSearch] = useState(initialSearch);
  const [installing, setInstalling] = useState<string | null>(null);
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [installConfirmId, setInstallConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (category) next.set('category', category); else next.delete('category');
    if (sort && sort !== 'popular') next.set('sort', sort); else next.delete('sort');
    if (search) next.set('q', search); else next.delete('q');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sort, search]);

  const load = useCallback(async () => {
    try {
      const params: Record<string, string> = { sort };
      if (category) params.category = category;
      if (search) params.search = search;

      const [bpRes, featRes] = await Promise.all([
        axios.get('/api/marketplace/blueprints', { params }),
        axios.get('/api/marketplace/featured'),
      ]);
      setBlueprints(bpRes.data?.data || []);
      setFeatured(featRes.data?.data || []);
    } catch (err) {
      logError('MarketplaceTab:load', err);
    } finally {
      setLoading(false);
    }
  }, [category, sort, search]);

  useEffect(() => { load(); }, [load]);

  const handleRequestInstall = (id: string) => {
    setInstallConfirmId(id);
  };

  const handleInstalled = async () => {
    setInstallConfirmId(null);
    setOpenDetailId(null);
    setInstalling(null);
    await load();
  };

  const renderCard = (bp: AgentBlueprint, showInstall = true) => (
    <div
      key={bp.id}
      data-testid={`bp-card-${bp.id}`}
      role="button"
      tabIndex={0}
      onClick={() => setOpenDetailId(bp.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpenDetailId(bp.id);
        }
      }}
      className="liquid-glass neuro-hover-lift p-4 rounded-xl flex flex-col gap-2 cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl">{bp.icon}</span>
        <div className="flex-1">
          <div className="font-semibold text-[0.9rem]">{bp.name}</div>
          <div className="text-[0.7rem] opacity-50">{bp.category}</div>
        </div>
        {bp.rating != null && (
          <span className="text-xs text-amber-500">
            {'★'.repeat(Math.round(bp.rating))} {bp.rating.toFixed(1)}
          </span>
        )}
      </div>
      <div className="text-[0.8rem] opacity-70 leading-relaxed flex-1">
        {bp.description}
      </div>
      <div className="flex flex-wrap gap-1">
        {bp.tags?.slice(0, 4).map(tag => (
          <span key={tag} className="text-[0.65rem] px-1.5 py-px rounded bg-[var(--glass-bg)]">
            {tag}
          </span>
        ))}
      </div>
      <div className="flex justify-between items-center mt-auto">
        <span className="text-[0.7rem] opacity-50">{bp.usageCount} Installationen</span>
        {showInstall && (
          <button
            type="button"
            className="neuro-hover-lift px-3 py-1 rounded-md text-white text-xs border border-[var(--glass-border)] bg-[var(--accent-primary,#3b82f6)] cursor-[var(--cur)]"
            disabled={installing === bp.id}
            onClick={e => {
              e.stopPropagation();
              handleRequestInstall(bp.id);
            }}
            style={{ '--cur': installing === bp.id ? 'wait' : 'pointer' } as React.CSSProperties}
          >
            {installing === bp.id ? '...' : 'Installieren'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="marketplace-tab">
      {/* Search & Filters */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item mb-4">
        <div className="flex gap-3 flex-wrap items-center">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Agents suchen..."
            className="flex-[1_1_200px] px-3 py-2 rounded-lg text-inherit text-[0.85rem] border border-[var(--glass-border)] bg-[var(--glass-bg)]"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="p-2 rounded-lg text-inherit text-[0.85rem] border border-[var(--glass-border)] bg-[var(--glass-bg)]"
          >
            {CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {SORT_OPTIONS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSort(s.id)}
                className={`px-2.5 py-1.5 rounded-md cursor-pointer text-xs border border-[var(--glass-border)] ${sort === s.id ? 'text-white bg-[var(--accent-primary,#3b82f6)]' : 'bg-transparent text-inherit'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center p-12 opacity-60">Lade Marketplace...</div>
      ) : (
        <>
          {/* Featured */}
          {featured.length > 0 && !search && !category && (
            <div className="agent-teams-section liquid-glass neuro-stagger-item mb-6">
              <h3 className="m-0 mb-3 text-base">Empfohlen</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                {featured.map(bp => renderCard(bp))}
              </div>
            </div>
          )}

          {/* All Results */}
          <div className="agent-teams-section liquid-glass neuro-stagger-item">
            <h3 className="m-0 mb-3 text-base">
              Community Agents ({blueprints.length})
            </h3>
            {blueprints.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                {blueprints.map(bp => renderCard(bp))}
              </div>
            ) : (
              <div className="text-center p-8 opacity-50">
                Keine Community Agents gefunden.
              </div>
            )}
          </div>
        </>
      )}

      {openDetailId && (
        <BlueprintDetailModal
          blueprintId={openDetailId}
          onClose={() => setOpenDetailId(null)}
          onInstall={detail => {
            setOpenDetailId(null);
            handleRequestInstall(detail.id);
          }}
        />
      )}

      {installConfirmId && (
        <InstallConfirmModal
          blueprintId={installConfirmId}
          onClose={() => setInstallConfirmId(null)}
          onInstalled={handleInstalled}
        />
      )}
    </div>
  );
}
