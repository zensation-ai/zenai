import React from 'react';
import { ProfileStats, ProfileData } from './types';
import { formatDate } from './helpers';

interface ProfileTabProps {
  profileStats?: ProfileStats;
  showEditProfile: boolean;
  profileData: ProfileData;
  savingProfile: boolean;
  onOpenEditProfile: () => void;
  onAnalyzeProfile: () => void;
  onSaveProfile: () => void;
  onSetShowEditProfile: (show: boolean) => void;
  onSetProfileData: (data: ProfileData) => void;
}

export function ProfileTab({
  profileStats,
  showEditProfile,
  profileData,
  savingProfile,
  onOpenEditProfile,
  onAnalyzeProfile,
  onSaveProfile,
  onSetShowEditProfile,
  onSetProfileData,
}: ProfileTabProps) {
  return (
    <div className="profile-tab">
      <div className="profile-header">
        <h2>Dein Profil</h2>
        <div className="profile-actions">
          <button type="button" className="edit-profile-button neuro-hover-lift" onClick={onOpenEditProfile} aria-label="Profil bearbeiten">
            Bearbeiten
          </button>
          <button type="button" className="analyze-button neuro-button" onClick={onAnalyzeProfile} aria-label="Profil analysieren">
            Analysieren
          </button>
        </div>
      </div>

      {showEditProfile && (
        <div className="edit-profile-modal">
          <div className="edit-profile-content">
            <h3>Profil bearbeiten</h3>
            <div className="form-group">
              <label htmlFor="company_name">Unternehmen / Kontext</label>
              <input
                id="company_name"
                type="text"
                value={profileData.company_name || ''}
                onChange={(e) => onSetProfileData({ ...profileData, company_name: e.target.value })}
                placeholder="z.B. Mein Startup, Freiberuflich, Privat"
              />
            </div>
            <div className="form-group">
              <label htmlFor="industry">Branche / Bereich</label>
              <input
                id="industry"
                type="text"
                value={profileData.industry || ''}
                onChange={(e) => onSetProfileData({ ...profileData, industry: e.target.value })}
                placeholder="z.B. Software, Marketing, Design"
              />
            </div>
            <div className="form-group">
              <label htmlFor="role">Rolle</label>
              <input
                id="role"
                type="text"
                value={profileData.role || ''}
                onChange={(e) => onSetProfileData({ ...profileData, role: e.target.value })}
                placeholder="z.B. Entwickler, Projektmanager, CEO"
              />
            </div>
            <div className="form-group">
              <label htmlFor="tech_stack">Technologien (kommagetrennt)</label>
              <input
                id="tech_stack"
                type="text"
                value={(profileData.tech_stack || []).join(', ')}
                onChange={(e) => onSetProfileData({
                  ...profileData,
                  tech_stack: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                })}
                placeholder="z.B. React, Node.js, Python"
              />
            </div>
            <div className="form-group">
              <label htmlFor="goals">Ziele (kommagetrennt)</label>
              <input
                id="goals"
                type="text"
                value={(profileData.goals || []).join(', ')}
                onChange={(e) => onSetProfileData({
                  ...profileData,
                  goals: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                })}
                placeholder="z.B. Produktivität steigern, Neues lernen"
              />
            </div>
            <div className="form-group">
              <label htmlFor="pain_points">Herausforderungen (kommagetrennt)</label>
              <input
                id="pain_points"
                type="text"
                value={(profileData.pain_points || []).join(', ')}
                onChange={(e) => onSetProfileData({
                  ...profileData,
                  pain_points: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                })}
                placeholder="z.B. Zeitmanagement, Fokus halten"
              />
            </div>
            <div className="form-actions">
              <button type="button" className="cancel-btn neuro-hover-lift" onClick={() => onSetShowEditProfile(false)} aria-label="Abbrechen">
                Abbrechen
              </button>
              <button type="button" className="save-btn neuro-button" onClick={onSaveProfile} disabled={savingProfile} aria-label="Profil speichern">
                {savingProfile ? 'Speichere...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileStats ? (
        <>
          <div className="profile-stats">
            <div className="stat-card">
              <div className="stat-value">{profileStats.profile_completeness}%</div>
              <div className="stat-label">Profil-Vollständigkeit</div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ '--progress-width': `${profileStats.profile_completeness}%` } as React.CSSProperties}
                />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{profileStats.topics_tracked}</div>
              <div className="stat-label">Erfasste Themen</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{profileStats.tech_stack_count}</div>
              <div className="stat-label">Technologien</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{profileStats.insights_count}</div>
              <div className="stat-label">Erkenntnisse</div>
            </div>
          </div>

          {profileStats.top_topics.length > 0 && (
            <div className="section">
              <h3>Häufigste Themen</h3>
              <div className="topics-cloud">
                {profileStats.top_topics.map((topic, i) => (
                  <span
                    key={i}
                    className={`topic-badge topic-size-${Math.min(Math.floor(topic.count / 2), 5)}`}
                  >
                    {topic.topic} ({topic.count})
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="profile-info">
            <p>
              Die KI lernt automatisch aus deinen Ideen und Aufgaben.
              Je mehr du die App nutzt, desto besser versteht die KI deinen Kontext.
            </p>
            {profileStats.last_updated && (
              <p className="last-updated">
                Letzte Aktualisierung: {formatDate(profileStats.last_updated)}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="empty-state neuro-empty-state">
          <span className="neuro-empty-icon">👤</span>
          <h3 className="neuro-empty-title">Noch kein Profil erstellt</h3>
          <p className="neuro-empty-description">Starte die Profil-Analyse, um die KI über dich lernen zu lassen.</p>
          <button type="button" className="primary-button neuro-button" onClick={onAnalyzeProfile} aria-label="Profil jetzt analysieren">
            Jetzt analysieren
          </button>
        </div>
      )}
    </div>
  );
}
