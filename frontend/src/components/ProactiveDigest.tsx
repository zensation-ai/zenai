/**
 * ProactiveDigest - AI-generated daily/weekly digest cards
 *
 * Fetches from:
 * - GET /api/proactive/digest/latest  (latest digest)
 * - GET /api/proactive/digest/recent  (last N digests)
 * - POST /api/proactive/digest/:id/viewed  (mark as viewed)
 *
 * Embedded in Dashboard after Quick Start grid.
 */

import { useState, useEffect, useCallback, memo } from 'react';
import axios from 'axios';
import type { Page } from '../types';
import type { AIContext } from './ContextSwitcher';
import { logError } from '../utils/errors';
import './ProactiveDigest.css';

// ============================================
// Types
// ============================================

interface DigestSection {
  title: string;
  content: string;
  relevanceScore: number;
}

interface Digest {
  id: string;
  type: 'daily' | 'weekly';
  title: string;
  summary: string;
  sections: DigestSection[];
  created_at: string;
  viewed: boolean;
}

interface ProactiveDigestProps {
  context: AIContext;
  onNavigate: (page: Page) => void;
}

// ============================================
// Component
// ============================================

const ProactiveDigestComponent: React.FC<ProactiveDigestProps> = ({
  context,
  onNavigate,
}) => {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchDigest = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/proactive/digest/latest', {
          params: { context },
        });
        if (!cancelled && res.data?.success && res.data.digest) {
          setDigest(res.data.digest);
        }
      } catch (err) {
        logError('ProactiveDigest:fetch', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDigest();
    return () => { cancelled = true; };
  }, [context]);

  const markViewed = useCallback(async (id: string) => {
    try {
      await axios.post(`/api/proactive/digest/${id}/viewed`, null, { params: { context } });
    } catch (err) {
      logError('ProactiveDigest:markViewed', err);
    }
  }, [context]);

  const handleExpand = useCallback(() => {
    setExpanded(true);
    if (digest && !digest.viewed) {
      setDigest(prev => prev ? { ...prev, viewed: true } : prev);
      markViewed(digest.id);
    }
  }, [digest, markViewed]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    if (digest && !digest.viewed) {
      setDigest(prev => prev ? { ...prev, viewed: true } : prev);
      markViewed(digest.id);
    }
  }, [digest, markViewed]);

  if (loading || !digest || dismissed) return null;

  const relevantSections = digest.sections
    .filter(s => s.relevanceScore > 0.3)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const typeLabel = digest.type === 'daily' ? 'Tagesrückblick' : 'Wochenrückblick';
  const typeIcon = digest.type === 'daily' ? '📋' : '📊';

  return (
    <section className={`digest-card ${!digest.viewed ? 'unread' : ''}`} aria-label="KI-Digest">
      <div className="digest-header">
        <div className="digest-header-left">
          <span className="digest-icon" aria-hidden="true">{typeIcon}</span>
          <div className="digest-header-text">
            <h3 className="digest-title">{digest.title || typeLabel}</h3>
            <span className="digest-type-badge">{typeLabel}</span>
          </div>
        </div>
        <div className="digest-header-right">
          {!digest.viewed && <span className="digest-new-badge">Neu</span>}
          <button
            type="button"
            className="digest-dismiss neuro-focus-ring"
            onClick={handleDismiss}
            title="Digest ausblenden"
            aria-label="Digest ausblenden"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <p className="digest-summary">{digest.summary}</p>

      {!expanded && relevantSections.length > 0 && (
        <button
          type="button"
          className="digest-expand neuro-focus-ring"
          onClick={handleExpand}
        >
          {relevantSections.length} Einblick{relevantSections.length !== 1 ? 'e' : ''} anzeigen
        </button>
      )}

      {expanded && (
        <div className="digest-sections">
          {relevantSections.map((section, idx) => (
            <div key={idx} className="digest-section">
              <div className="digest-section-header">
                <span className="digest-section-title">{section.title}</span>
                <span
                  className="digest-section-relevance"
                  title={`Relevanz: ${Math.round(section.relevanceScore * 100)}%`}
                >
                  {section.relevanceScore >= 0.8 ? '🔥' : section.relevanceScore >= 0.6 ? '⭐' : '💡'}
                </span>
              </div>
              <p className="digest-section-content">{section.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="digest-footer">
        <button
          type="button"
          className="digest-action neuro-focus-ring"
          onClick={() => onNavigate('insights')}
        >
          Alle Insights anzeigen
        </button>
      </div>
    </section>
  );
};

export const ProactiveDigest = memo(ProactiveDigestComponent);
ProactiveDigest.displayName = 'ProactiveDigest';
export default ProactiveDigest;
