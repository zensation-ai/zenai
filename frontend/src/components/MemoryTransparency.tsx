/**
 * MemoryTransparency - Shows what the AI has learned about the user
 *
 * Makes the HiMeS memory system visible:
 * - Learned facts with confidence
 * - Detected patterns
 * - Memory health metrics
 * - Recent learnings timeline
 *
 * VentureBeat 2026: Memory-enabled AI delivers 116-446% ROI,
 * but users must SEE that the AI is learning.
 *
 * @module components/MemoryTransparency
 */

import React, { memo } from 'react';
import axios from 'axios';
import { AIContext } from './ContextSwitcher';
import { useAsyncData } from '../hooks/useAsyncData';
import { SkeletonLoader } from './SkeletonLoader';
import { logError } from '../utils/errors';
import '../neurodesign.css';
import './MemoryTransparency.css';

// ===========================================
// Types
// ===========================================

interface RecentLearning {
  type: 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context';
  content: string;
  confidence: number;
  source: 'explicit' | 'inferred' | 'consolidated';
  learnedAt: string;
  lastConfirmed: string;
  occurrences: number;
}

interface PatternInfo {
  type: 'topic' | 'action' | 'time' | 'style';
  pattern: string;
  frequency: number;
  confidence: number;
}

interface MemoryHealth {
  avgConfidence: number;
  highConfidenceFacts: number;
  totalFacts: number;
  totalPatterns: number;
  totalEpisodes: number;
  avgEpisodicStrength: number;
  recentEpisodes: number;
  hasProfileEmbedding: boolean;
}

interface TransparencyData {
  factsLearned: number;
  patternsDetected: number;
  episodesStored: number;
  lastConsolidation: string | null;
  recentLearnings: RecentLearning[];
  memoryHealth: MemoryHealth;
  topPatterns: PatternInfo[];
}

interface MemoryTransparencyProps {
  context: AIContext;
  /** Compact mode for dashboard widget */
  compact?: boolean;
}

// ===========================================
// Helpers
// ===========================================

const TYPE_LABELS: Record<string, string> = {
  preference: 'Vorliebe',
  behavior: 'Verhalten',
  knowledge: 'Wissen',
  goal: 'Ziel',
  context: 'Kontext',
  topic: 'Thema',
  action: 'Aktion',
  time: 'Zeitverhalten',
  style: 'Stil',
};

const SOURCE_LABELS: Record<string, string> = {
  explicit: 'Direkt gesagt',
  inferred: 'Erkannt',
  consolidated: 'Aus Interaktionen',
};

function confidenceBar(value: number): string {
  if (value >= 0.8) return 'confidence-high';
  if (value >= 0.5) return 'confidence-medium';
  return 'confidence-low';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

// ===========================================
// Sub-Components
// ===========================================

const MemoryStats: React.FC<{ health: MemoryHealth }> = ({ health }) => (
  <div className="mem-stats">
    <div className="mem-stat">
      <span className="mem-stat-value">{health.totalFacts}</span>
      <span className="mem-stat-label">Fakten</span>
    </div>
    <div className="mem-stat">
      <span className="mem-stat-value">{health.totalPatterns}</span>
      <span className="mem-stat-label">Muster</span>
    </div>
    <div className="mem-stat">
      <span className="mem-stat-value">{health.totalEpisodes}</span>
      <span className="mem-stat-label">Episoden</span>
    </div>
    <div className="mem-stat">
      <span className="mem-stat-value">{Math.round(health.avgConfidence * 100)}%</span>
      <span className="mem-stat-label">Konfidenz</span>
    </div>
  </div>
);

const LearningItem: React.FC<{ learning: RecentLearning }> = ({ learning }) => (
  <div className="mem-learning-item">
    <div className="mem-learning-header">
      <span className={`mem-learning-type ${learning.type}`}>
        {TYPE_LABELS[learning.type] || learning.type}
      </span>
      <span className="mem-learning-date">{formatDate(learning.lastConfirmed)}</span>
    </div>
    <p className="mem-learning-content">{learning.content}</p>
    <div className="mem-learning-meta">
      <span className={`mem-confidence-dot ${confidenceBar(learning.confidence)}`} />
      <span className="mem-learning-source">{SOURCE_LABELS[learning.source] || learning.source}</span>
      {learning.occurrences > 1 && (
        <span className="mem-learning-occurrences">{learning.occurrences}x bestätigt</span>
      )}
    </div>
  </div>
);

const PatternItem: React.FC<{ pattern: PatternInfo }> = ({ pattern }) => (
  <div className="mem-pattern-item">
    <span className="mem-pattern-type">{TYPE_LABELS[pattern.type] || pattern.type}</span>
    <span className="mem-pattern-text">{pattern.pattern}</span>
    <span className={`mem-confidence-dot ${confidenceBar(pattern.confidence)}`} />
  </div>
);

// ===========================================
// Main Component
// ===========================================

const MemoryTransparencyComponent: React.FC<MemoryTransparencyProps> = ({ context, compact = false }) => {
  const { data, loading, error, refresh } = useAsyncData<{ success: boolean; data: TransparencyData }>(
    async (signal) => {
      const res = await axios.get(`/api/memory/transparency/${context}`, { signal });
      return res.data;
    },
    [context]
  );

  if (loading) {
    return (
      <div className="mem-transparency">
        <SkeletonLoader type="card" count={compact ? 1 : 3} />
      </div>
    );
  }

  if (error || !data?.data) {
    logError('MemoryTransparency', error);
    return (
      <div className="mem-transparency">
        <div className="mem-error">
          <p>Memory-Daten nicht verfügbar.</p>
          <button className="mem-retry-btn" onClick={refresh}>Erneut laden</button>
        </div>
      </div>
    );
  }

  const transparency = data.data;

  // Compact mode: just stats + top learnings
  if (compact) {
    return (
      <div className="mem-transparency mem-compact">
        <div className="mem-compact-header">
          <h4 className="mem-compact-title">Deine AI kennt dich</h4>
          <span className="mem-compact-count">{transparency.factsLearned} gelernte Fakten</span>
        </div>
        <MemoryStats health={transparency.memoryHealth} />
        {transparency.recentLearnings.slice(0, 2).map((learning, i) => (
          <LearningItem key={i} learning={learning} />
        ))}
      </div>
    );
  }

  return (
    <div className="mem-transparency">
      <h3 className="mem-section-title">Deine AI kennt dich</h3>
      <p className="mem-section-subtitle">
        Was deine AI über dich gelernt hat - transparent und korrigierbar.
      </p>

      <MemoryStats health={transparency.memoryHealth} />

      {/* Recent Learnings */}
      {transparency.recentLearnings.length > 0 && (
        <div className="mem-section">
          <h4 className="mem-subsection-title">Kürzlich gelernt</h4>
          <div className="mem-learnings-list">
            {transparency.recentLearnings.map((learning, i) => (
              <LearningItem key={i} learning={learning} />
            ))}
          </div>
        </div>
      )}

      {/* Detected Patterns */}
      {transparency.topPatterns.length > 0 && (
        <div className="mem-section">
          <h4 className="mem-subsection-title">Erkannte Muster</h4>
          <div className="mem-patterns-list">
            {transparency.topPatterns.map((pattern, i) => (
              <PatternItem key={i} pattern={pattern} />
            ))}
          </div>
        </div>
      )}

      {/* Memory Health */}
      <div className="mem-section">
        <h4 className="mem-subsection-title">Speicher-Status</h4>
        <div className="mem-health-grid">
          <div className="mem-health-item">
            <span className="mem-health-label">Hochsichere Fakten</span>
            <span className="mem-health-value">
              {transparency.memoryHealth.highConfidenceFacts} / {transparency.memoryHealth.totalFacts}
            </span>
          </div>
          <div className="mem-health-item">
            <span className="mem-health-label">Episodenstärke</span>
            <span className="mem-health-value">
              {Math.round(transparency.memoryHealth.avgEpisodicStrength * 100)}%
            </span>
          </div>
          <div className="mem-health-item">
            <span className="mem-health-label">Aktive Episoden (7 Tage)</span>
            <span className="mem-health-value">{transparency.memoryHealth.recentEpisodes}</span>
          </div>
          {transparency.lastConsolidation && (
            <div className="mem-health-item">
              <span className="mem-health-label">Letzte Konsolidierung</span>
              <span className="mem-health-value">{formatDate(transparency.lastConsolidation)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const MemoryTransparency = memo(MemoryTransparencyComponent);
export default MemoryTransparency;
