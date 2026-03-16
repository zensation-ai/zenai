/**
 * DigitalTwinPage - "Dein AI Ich"
 *
 * Dashboard showing the AI's aggregated knowledge about the user:
 * personality radar, editable profile sections, evolution timeline,
 * corrections, and export.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { RadarChart, type RadarScores } from './RadarChart';
import './DigitalTwinPage.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

interface ProfileEntry {
  id: string;
  section: string;
  data: Record<string, unknown>;
  confidence: number;
  source: string | null;
  updated_at: string;
}

interface ProfileSnapshot {
  id: string;
  radar_scores: RadarScores | null;
  created_at: string;
}

interface DigitalTwinProfile {
  sections: ProfileEntry[];
  radar: RadarScores;
  lastUpdated: string | null;
}

interface DigitalTwinPageProps {
  context: AIContext;
}

const SECTION_META: Record<string, { icon: string; label: string }> = {
  personality: { icon: '\uD83E\uDDE0', label: 'Persoenlichkeit' },
  expertise: { icon: '\uD83C\uDF93', label: 'Expertise' },
  work_patterns: { icon: '\u23F0', label: 'Arbeitsmuster' },
  interests: { icon: '\u2B50', label: 'Interessen' },
  goals: { icon: '\uD83C\uDFAF', label: 'Ziele' },
  preferences: { icon: '\u2699\uFE0F', label: 'Praeferenzen' },
};

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...options.headers,
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

export const DigitalTwinPage: React.FC<DigitalTwinPageProps> = ({ context }) => {
  const [profile, setProfile] = useState<DigitalTwinProfile | null>(null);
  const [evolution, setEvolution] = useState<ProfileSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [correctionSection, setCorrectionSection] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      const [profileData, evolutionData] = await Promise.all([
        apiRequest<DigitalTwinProfile>(`/api/${context}/digital-twin/profile`),
        apiRequest<ProfileSnapshot[]>(`/api/${context}/digital-twin/evolution?limit=8`),
      ]);
      setProfile(profileData);
      setEvolution(evolutionData);
    } catch {
      // Profile may not exist yet - that's ok
      setProfile({ sections: [], radar: { analytical: 50, creative: 50, organized: 50, social: 50, technical: 50 }, lastUpdated: null });
      setEvolution([]);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    setLoading(true);
    loadProfile();
  }, [loadProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await apiRequest(`/api/${context}/digital-twin/refresh`, { method: 'POST' });
      await loadProfile();
    } catch {
      // Silently fail
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await apiRequest<Record<string, unknown>>(`/api/${context}/digital-twin/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `digital-twin-${context}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail
    }
  };

  const handleSubmitCorrection = async () => {
    if (!correctionSection || !correctionText.trim()) return;

    try {
      await apiRequest(`/api/${context}/digital-twin/correction`, {
        method: 'POST',
        body: JSON.stringify({
          section: correctionSection,
          corrected_value: { user_note: correctionText.trim() },
          reason: correctionReason.trim() || undefined,
        }),
      });
      setCorrectionSection(null);
      setCorrectionText('');
      setCorrectionReason('');
      await loadProfile();
    } catch {
      // Silently fail
    }
  };

  if (loading) {
    return <div className="dt-loading">Profil wird geladen...</div>;
  }

  if (!profile) {
    return (
      <div className="digital-twin-page">
        <div className="dt-empty">
          <div className="dt-empty-icon">{'\uD83E\uDD16'}</div>
          <h3>Dein Digital Twin</h3>
          <p>Noch keine Profildaten vorhanden. Starte die Aggregation, um dein KI-Profil zu erstellen.</p>
          <button className="dt-btn dt-btn--primary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Wird erstellt...' : 'Profil erstellen'}
          </button>
        </div>
      </div>
    );
  }

  const hasSections = profile.sections.length > 0;

  return (
    <div className="digital-twin-page">
      {/* Header */}
      <div className="dt-header">
        <div className="dt-header-info">
          <h2>Dein Digital Twin</h2>
          <p>
            {profile.lastUpdated
              ? `Zuletzt aktualisiert: ${new Date(profile.lastUpdated).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : 'Noch keine Daten aggregiert'}
          </p>
        </div>
        <div className="dt-header-actions">
          <button className="dt-btn" onClick={handleExport} title="Profil exportieren">
            Export
          </button>
          <button
            className="dt-btn dt-btn--primary"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Profil neu aggregieren"
          >
            {refreshing ? 'Aktualisiere...' : 'Aktualisieren'}
          </button>
        </div>
      </div>

      {/* Radar Chart */}
      <div className="dt-radar-section">
        <RadarChart scores={profile.radar} size={280} />
      </div>

      {/* Profile Sections */}
      {hasSections ? (
        <div className="dt-sections-grid">
          {profile.sections.map((entry) => {
            const meta = SECTION_META[entry.section] ?? { icon: '\uD83D\uDCCB', label: entry.section };
            return (
              <div key={entry.id} className="dt-section-card">
                <div className="dt-section-header">
                  <span className="dt-section-title">
                    {meta.icon} {meta.label}
                  </span>
                  <span className="dt-section-confidence">
                    {Math.round(entry.confidence * 100)}%
                  </span>
                </div>
                <div className="dt-section-body">
                  {renderSectionContent(entry)}
                </div>
                <button
                  className="dt-correction-btn"
                  onClick={() => setCorrectionSection(entry.section)}
                  title="KI korrigieren"
                >
                  Korrigieren
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dt-empty">
          <p>Klicke auf "Aktualisieren", um dein Profil aus deinen Daten zu aggregieren.</p>
        </div>
      )}

      {/* Evolution Timeline */}
      {evolution.length > 0 && (
        <div className="dt-evolution-section">
          <h3>Profil-Entwicklung</h3>
          <div className="dt-evolution-list">
            {evolution.map((snap) => (
              <div key={snap.id} className="dt-evolution-item">
                <div className="dt-evolution-date">
                  {new Date(snap.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                </div>
                {snap.radar_scores && (
                  <div className="dt-evolution-scores">
                    {Object.entries(snap.radar_scores).map(([key, value]) => (
                      <div key={key} className="dt-evolution-score">
                        <span className="dt-evolution-score-label">
                          {key.slice(0, 3).toUpperCase()}
                        </span>
                        <span className="dt-evolution-score-value">{value as number}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correction Modal */}
      {correctionSection && (
        <div className="dt-correction-overlay" onClick={() => setCorrectionSection(null)}>
          <div className="dt-correction-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Korrektur: {SECTION_META[correctionSection]?.label ?? correctionSection}</h3>
            <textarea
              placeholder="Was stimmt nicht? Beschreibe die korrekte Information..."
              value={correctionText}
              onChange={(e) => setCorrectionText(e.target.value)}
              autoFocus
            />
            <textarea
              placeholder="Grund fuer die Korrektur (optional)"
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              style={{ minHeight: '48px' }}
            />
            <div className="dt-correction-actions">
              <button className="dt-btn" onClick={() => setCorrectionSection(null)}>
                Abbrechen
              </button>
              <button
                className="dt-btn dt-btn--primary"
                onClick={handleSubmitCorrection}
                disabled={!correctionText.trim()}
              >
                Korrektur senden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function renderSectionContent(entry: ProfileEntry): React.ReactNode {
  const data = entry.data;

  switch (entry.section) {
    case 'personality': {
      const comm = data.communication as Record<string, unknown> | undefined;
      if (comm) {
        return (
          <div>
            <p>Kommunikationsstil: <strong>{String(comm.style ?? 'unbekannt')}</strong></p>
            <p>Nachrichten: {String(comm.message_count ?? 0)}, Durchschn. Laenge: {String(comm.average_length ?? 0)} Zeichen</p>
          </div>
        );
      }
      if (data.user_note) return <p>{String(data.user_note)}</p>;
      return <p>Noch keine Daten</p>;
    }

    case 'expertise': {
      const areas = Array.isArray(data.areas) ? data.areas as string[] : [];
      if (areas.length === 0 && data.user_note) return <p>{String(data.user_note)}</p>;
      if (areas.length === 0) return <p>Noch keine Expertise erkannt</p>;
      return (
        <div className="dt-tag-list">
          {areas.slice(0, 10).map((area) => (
            <span key={area} className="dt-tag">{area}</span>
          ))}
        </div>
      );
    }

    case 'work_patterns': {
      const peakHours = Array.isArray(data.peak_hours) ? data.peak_hours as { hour: number; count: number }[] : [];
      if (peakHours.length === 0 && data.user_note) return <p>{String(data.user_note)}</p>;
      if (peakHours.length === 0) return <p>Noch keine Muster erkannt</p>;
      return (
        <div>
          <p>Aktivste Stunden:</p>
          <ul>
            {peakHours.slice(0, 3).map((h) => (
              <li key={h.hour}>{h.hour}:00 Uhr ({h.count} Interaktionen)</li>
            ))}
          </ul>
        </div>
      );
    }

    case 'interests': {
      const topics = Array.isArray(data.topics) ? data.topics as string[] : [];
      if (topics.length === 0 && data.user_note) return <p>{String(data.user_note)}</p>;
      if (topics.length === 0) return <p>Noch keine Interessen erkannt</p>;
      return (
        <div className="dt-tag-list">
          {topics.slice(0, 12).map((topic) => (
            <span key={topic} className="dt-tag">{topic}</span>
          ))}
        </div>
      );
    }

    case 'goals': {
      const items = Array.isArray(data.items) ? data.items as string[] : [];
      if (items.length === 0 && data.user_note) return <p>{String(data.user_note)}</p>;
      if (items.length === 0) return <p>Noch keine Ziele erkannt</p>;
      return (
        <ul>
          {items.slice(0, 6).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    }

    case 'preferences': {
      const prefs = Array.isArray(data.learned_preferences) ? data.learned_preferences as string[] : [];
      if (prefs.length === 0 && data.user_note) return <p>{String(data.user_note)}</p>;
      if (prefs.length === 0) return <p>Noch keine Praeferenzen erkannt</p>;
      return (
        <ul>
          {prefs.slice(0, 6).map((pref, i) => (
            <li key={i}>{pref}</li>
          ))}
        </ul>
      );
    }

    default: {
      if (data.user_note) return <p>{String(data.user_note)}</p>;
      return <p>Keine Daten</p>;
    }
  }
}
