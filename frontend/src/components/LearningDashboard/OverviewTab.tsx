import React from 'react';
import { GraduationCap } from 'lucide-react';
import { DashboardData } from './types';
import { getSuggestionIcon, formatDate, getActivityStatusLabel } from './helpers';

interface OverviewTabProps {
  data: DashboardData;
  handleRespondToSuggestion: (id: string, response: 'accepted' | 'dismissed') => void;
  handleViewResearch: (id: string) => void;
  onExploreTopic?: () => void;
}

export function OverviewTab({ data, handleRespondToSuggestion, handleViewResearch, onExploreTopic }: OverviewTabProps) {
  const hasContent = data.focus.stats.active_focus_areas > 0
    || data.suggestions.active.length > 0
    || data.learning.recent_logs.length > 0;
  return (
    <div className="overview-tab">
      <div className="stats-grid neuro-flow-list">
        <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
          <div className="stat-icon">🎯</div>
          <div className="stat-value">{data.focus.stats.active_focus_areas}</div>
          <div className="stat-label">Aktive Fokus-Themen</div>
        </div>
        <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
          <div className="stat-icon">💡</div>
          <div className="stat-value">{data.suggestions.active.length}</div>
          <div className="stat-label">Offene Vorschläge</div>
        </div>
        <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
          <div className="stat-icon">🔍</div>
          <div className="stat-value">{data.research.pending.length}</div>
          <div className="stat-label">Vorbereitete Recherchen</div>
        </div>
        <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
          <div className="stat-icon">⭐</div>
          <div className="stat-value">{(data.feedback.stats.average_rating ?? 0).toFixed(1)}</div>
          <div className="stat-label">Durchschnittliche Bewertung</div>
        </div>
      </div>

      {/* Learning Progress Chart */}
      {data.learning.recent_logs.length > 0 && (
        <div className="section learning-progress-section">
          <h2>Lernfortschritt (letzte 7 Tage)</h2>
          <div className="learning-progress-chart">
            {data.learning.recent_logs.slice(0, 7).reverse().map((log) => {
              const maxIdeas = Math.max(...data.learning.recent_logs.map(l => l.ideas_analyzed), 1);
              const heightPercent = (log.ideas_analyzed / maxIdeas) * 100;
              return (
                <div key={log.id} className="chart-bar-container">
                  <div
                    className={`chart-bar ${log.status === 'completed' ? 'completed' : 'partial'}`}
                    style={{ '--bar-height': `${Math.max(heightPercent, 5)}%` } as React.CSSProperties}
                    title={`${log.ideas_analyzed} Ideen analysiert, ${log.patterns_found} Muster, ${log.suggestions_generated} Vorschläge`}
                  >
                    <span className="bar-value">{log.ideas_analyzed}</span>
                  </div>
                  <span className="chart-label">
                    {log.learning_date ? new Date(log.learning_date).toLocaleDateString('de-DE', { weekday: 'short' }) : '–'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-color completed"></span>
              Ideen analysiert
            </span>
          </div>
        </div>
      )}

      {data.suggestions.active.length > 0 && (
        <div className="section">
          <h2>Aktuelle Vorschläge</h2>
          <div className="suggestions-preview">
            {data.suggestions.active.slice(0, 3).map((suggestion) => (
              <div key={suggestion.id} className="suggestion-card-mini">
                <span className="suggestion-type">{getSuggestionIcon(suggestion.suggestion_type)}</span>
                <span className="suggestion-title">{suggestion.title}</span>
                <div className="suggestion-actions">
                  <button
                    type="button"
                    className="accept-btn neuro-hover-lift"
                    onClick={() => handleRespondToSuggestion(suggestion.id, 'accepted')}
                    aria-label="Vorschlag annehmen"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="dismiss-btn neuro-hover-lift"
                    onClick={() => handleRespondToSuggestion(suggestion.id, 'dismissed')}
                    aria-label="Vorschlag ablehnen"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.research.pending.length > 0 && (
        <div className="section">
          <h2>Vorbereitete Recherchen</h2>
          <div className="research-preview">
            {data.research.pending.slice(0, 2).map((research) => (
              <div
                key={research.id}
                className="research-card-mini"
                onClick={() => handleViewResearch(research.id)}
              >
                <div className="research-query">{research.teaser_title || research.research_query}</div>
                {research.teaser_text && (
                  <div className="research-teaser">{research.teaser_text}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.learning.recent_logs.length > 0 && (
        <div className="section">
          <h2>Letzte Lernaktivitäten</h2>
          <div className="learning-logs">
            {data.learning.recent_logs.slice(0, 5).map((log) => (
              <div key={log.id} className="learning-log">
                <span className="log-date">{formatDate(log.learning_date)}</span>
                <span className="log-stats">
                  {log.ideas_analyzed} Ideen • {log.patterns_found} Muster • {log.suggestions_generated} Vorschläge
                </span>
                <span className={`log-status status-${log.status}`}>{getActivityStatusLabel(log.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasContent && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <GraduationCap size={40} strokeWidth={1.5} style={{ marginBottom: '16px', opacity: 0.6 }} />
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--text-primary)' }}>Lernreise beginnen</h3>
          <p style={{ margin: '0 0 16px', fontSize: '14px', maxWidth: '360px' }}>Die KI erkennt Wissenslucken und schlaegt Lernpfade vor.</p>
          {onExploreTopic && (
            <button className="ds-button ds-button--primary ds-button--sm" type="button" onClick={onExploreTopic}>
              Thema erkunden
            </button>
          )}
        </div>
      )}
    </div>
  );
}
