/**
 * AgentIdentityPanel Component
 *
 * Rich UI for managing Agent Identities with card grid, create/edit modal,
 * persona configuration, permissions checklist, and trust level selector.
 *
 * Phase 64 - Enhanced Identity Management
 */

import { useState, useEffect, useCallback, type KeyboardEvent } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { logError } from '../utils/errors';
import './AgentIdentityPanel.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentIdentity {
  id: string;
  name: string;
  role: string;
  description?: string;
  enabled: boolean;
  trust_level: 'low' | 'medium' | 'high';
  persona?: {
    tone?: string;
    expertise?: string[];
    style?: string;
    language?: string;
  };
  permissions?: string[];
  rate_limit?: number;
  created_at: string;
  updated_at: string;
}

interface IdentityFormState {
  name: string;
  role: string;
  description: string;
  trust_level: 'low' | 'medium' | 'high';
  enabled: boolean;
  tone: string;
  expertise: string[];
  style: string;
  language: string;
  permissions: string[];
  rate_limit: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: string; label: string; icon: string; color: string }[] = [
  { value: 'researcher', label: 'Researcher', icon: '🔍', color: '#3b82f6' },
  { value: 'writer', label: 'Writer', icon: '✍️', color: '#8b5cf6' },
  { value: 'reviewer', label: 'Reviewer', icon: '📋', color: '#22c55e' },
  { value: 'coder', label: 'Coder', icon: '💻', color: '#f59e0b' },
  { value: 'custom', label: 'Benutzerdefiniert', icon: '🤖', color: '#ec4899' },
];

const TONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'professional', label: 'Professionell' },
  { value: 'casual', label: 'Locker' },
  { value: 'academic', label: 'Akademisch' },
  { value: 'creative', label: 'Kreativ' },
];

const TRUST_LEVELS: { value: 'low' | 'medium' | 'high'; label: string; color: string; desc: string }[] = [
  { value: 'low', label: 'Niedrig', color: '#ef4444', desc: 'Eingeschraenkte Aktionen' },
  { value: 'medium', label: 'Mittel', color: '#f59e0b', desc: 'Standard-Zugriff' },
  { value: 'high', label: 'Hoch', color: '#22c55e', desc: 'Voller Zugriff' },
];

const PERMISSION_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'tools.*', label: 'Alle Tools', desc: 'Zugriff auf alle Werkzeuge' },
  { value: 'data.ideas', label: 'Gedanken', desc: 'Lesen/Schreiben von Ideen' },
  { value: 'data.emails', label: 'E-Mails', desc: 'Zugriff auf E-Mail-Daten' },
  { value: 'data.contacts', label: 'Kontakte', desc: 'Zugriff auf Kontaktdaten' },
  { value: 'data.tasks', label: 'Aufgaben', desc: 'Zugriff auf Aufgaben' },
  { value: 'data.documents', label: 'Dokumente', desc: 'Zugriff auf Dokumente' },
];

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Francais' },
  { value: 'es', label: 'Espanol' },
];

const EMPTY_FORM: IdentityFormState = {
  name: '',
  role: 'researcher',
  description: '',
  trust_level: 'medium',
  enabled: true,
  tone: 'professional',
  expertise: [],
  style: '',
  language: 'de',
  permissions: ['tools.*', 'data.ideas'],
  rate_limit: 100,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function AgentIdentityPanel() {
  const [identities, setIdentities] = useState<AgentIdentity[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<IdentityFormState>({ ...EMPTY_FORM });
  const [expertiseInput, setExpertiseInput] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadIdentities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/agent-identities');
      if (res.data.success) {
        setIdentities(res.data.data || res.data.identities || []);
      }
    } catch (err) {
      logError('AgentIdentityPanel:load', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  // ─── Form Helpers ─────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setExpertiseInput('');
    setShowModal(true);
  };

  const openEditModal = (identity: AgentIdentity) => {
    setEditingId(identity.id);
    setForm({
      name: identity.name,
      role: identity.role,
      description: identity.description || '',
      trust_level: identity.trust_level,
      enabled: identity.enabled,
      tone: identity.persona?.tone || 'professional',
      expertise: identity.persona?.expertise || [],
      style: identity.persona?.style || '',
      language: identity.persona?.language || 'de',
      permissions: identity.permissions || [],
      rate_limit: identity.rate_limit || 100,
    });
    setExpertiseInput('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setExpertiseInput('');
  };

  const addExpertise = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !form.expertise.includes(trimmed)) {
      setForm(f => ({ ...f, expertise: [...f.expertise, trimmed] }));
    }
    setExpertiseInput('');
  };

  const removeExpertise = (tag: string) => {
    setForm(f => ({ ...f, expertise: f.expertise.filter(t => t !== tag) }));
  };

  const handleExpertiseKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addExpertise(expertiseInput);
    } else if (e.key === 'Backspace' && !expertiseInput && form.expertise.length > 0) {
      removeExpertise(form.expertise[form.expertise.length - 1]);
    }
  };

  const togglePermission = (perm: string) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm],
    }));
  };

  // ─── CRUD Operations ─────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        role: form.role,
        description: form.description || undefined,
        trust_level: form.trust_level,
        enabled: form.enabled,
        persona: {
          tone: form.tone || undefined,
          expertise: form.expertise.length > 0 ? form.expertise : undefined,
          style: form.style || undefined,
          language: form.language || undefined,
        },
        permissions: form.permissions.length > 0 ? form.permissions : undefined,
        rate_limit: form.rate_limit,
      };

      if (editingId) {
        await axios.put(`/api/agent-identities/${editingId}`, payload);
        showToast('Agent aktualisiert', 'success');
      } else {
        await axios.post('/api/agent-identities', payload);
        showToast('Agent erstellt', 'success');
      }
      closeModal();
      await loadIdentities();
    } catch (err) {
      logError('AgentIdentityPanel:save', err);
      showToast('Fehler beim Speichern', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/agent-identities/${id}`);
      showToast('Agent geloescht', 'success');
      setDeleteConfirmId(null);
      await loadIdentities();
    } catch (err) {
      logError('AgentIdentityPanel:delete', err);
      showToast('Fehler beim Loeschen', 'error');
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const getRoleConfig = (role: string) =>
    ROLE_OPTIONS.find(r => r.value === role) || ROLE_OPTIONS[4]; // fallback to custom

  const getTrustConfig = (level: string) =>
    TRUST_LEVELS.find(t => t.value === level) || TRUST_LEVELS[1];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="identity-section-header">
        <h3 className="identity-section-title">Agenten-Profile</h3>
        <button type="button" className="identity-create-btn" onClick={openCreateModal}>
          + Neuer Agent
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="progress-init" style={{ justifyContent: 'center', padding: '2rem 0' }}>
          <span className="loading-spinner" />
          <span>Lade Agenten...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && identities.length === 0 && (
        <div className="identity-empty-state">
          <div className="identity-empty-icon">🤖</div>
          <p className="identity-empty-text">
            Noch keine Agenten-Profile erstellt. Erstelle deinen ersten Agenten mit individueller Persoenlichkeit und Berechtigungen.
          </p>
          <button type="button" className="identity-empty-btn" onClick={openCreateModal}>
            Ersten Agenten erstellen
          </button>
        </div>
      )}

      {/* Identity Grid */}
      {!loading && identities.length > 0 && (
        <div className="identity-grid">
          {identities.map((identity) => {
            const role = getRoleConfig(identity.role);
            const trust = getTrustConfig(identity.trust_level);

            return (
              <div
                key={identity.id}
                className={`identity-card ${!identity.enabled ? 'disabled' : ''}`}
              >
                <div className="identity-card-top">
                  <div className={`identity-avatar role-${role.value === 'custom' || !['researcher', 'writer', 'reviewer', 'coder'].includes(role.value) ? 'custom' : role.value}`}>
                    {role.icon}
                    <span className={`identity-status-dot ${identity.enabled ? 'active' : 'inactive'}`} />
                  </div>
                  <div className="identity-card-info">
                    <h4 className="identity-card-name">{identity.name}</h4>
                    <div className="identity-card-badges">
                      <span
                        className="identity-role-badge"
                        style={{ background: `${role.color}18`, color: role.color }}
                      >
                        {role.label}
                      </span>
                      <span
                        className="identity-trust-badge"
                        style={{ background: `${trust.color}18`, color: trust.color }}
                      >
                        <span className="trust-dot" style={{ background: trust.color }} />
                        {trust.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="identity-card-details">
                  {identity.description && (
                    <div className="identity-detail-row">
                      <span className="identity-detail-value" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {identity.description}
                      </span>
                    </div>
                  )}
                  {identity.persona?.tone && (
                    <div className="identity-detail-row">
                      <span className="identity-detail-label">Ton</span>
                      <span className="identity-detail-value" style={{ textTransform: 'capitalize' }}>
                        {TONE_OPTIONS.find(t => t.value === identity.persona?.tone)?.label || identity.persona.tone}
                      </span>
                    </div>
                  )}
                  {identity.persona?.expertise && identity.persona.expertise.length > 0 && (
                    <div className="identity-detail-row" style={{ flexDirection: 'column', gap: '4px' }}>
                      <span className="identity-detail-label">Expertise</span>
                      <div className="identity-expertise-tags">
                        {identity.persona.expertise.map(tag => (
                          <span key={tag} className="expertise-tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {identity.permissions && identity.permissions.length > 0 && (
                    <div className="identity-detail-row">
                      <span className="identity-detail-label">Rechte</span>
                      <span className="identity-detail-value">
                        {identity.permissions.length} Berechtigung{identity.permissions.length !== 1 ? 'en' : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="identity-card-actions">
                  <button
                    type="button"
                    className="identity-action-btn"
                    onClick={() => openEditModal(identity)}
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="identity-action-btn delete-btn"
                    onClick={() => setDeleteConfirmId(identity.id)}
                  >
                    Loeschen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Create/Edit Modal ───────────────────────────────────────────────── */}
      {showModal && (
        <div className="identity-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="identity-modal">
            <div className="identity-modal-header">
              <h2>{editingId ? 'Agent bearbeiten' : 'Neuen Agenten erstellen'}</h2>
              <button type="button" className="identity-modal-close" onClick={closeModal}>
                ✕
              </button>
            </div>

            <div className="identity-modal-body">
              {/* Name */}
              <div className="identity-form-group">
                <label className="identity-form-label">Name</label>
                <input
                  className="identity-form-input"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. Research-Spezialist"
                  autoFocus
                />
              </div>

              {/* Role + Language */}
              <div className="identity-form-row">
                <div className="identity-form-group">
                  <label className="identity-form-label">Rolle</label>
                  <select
                    className="identity-form-select"
                    value={form.role}
                    onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.icon} {r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="identity-form-group">
                  <label className="identity-form-label">Sprache</label>
                  <select
                    className="identity-form-select"
                    value={form.language}
                    onChange={(e) => setForm(f => ({ ...f, language: e.target.value }))}
                  >
                    {LANGUAGE_OPTIONS.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="identity-form-group">
                <label className="identity-form-label">Beschreibung</label>
                <textarea
                  className="identity-form-textarea"
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Kurze Beschreibung des Agenten..."
                  rows={2}
                />
              </div>

              {/* Trust Level */}
              <div className="identity-form-group">
                <label className="identity-form-label">Vertrauensstufe</label>
                <div className="trust-level-selector">
                  {TRUST_LEVELS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      className={`trust-level-option ${form.trust_level === t.value ? 'selected' : ''}`}
                      style={{ '--trust-color': t.color } as React.CSSProperties}
                      onClick={() => setForm(f => ({ ...f, trust_level: t.value }))}
                    >
                      <span className="trust-level-dot" style={{ background: t.color }} />
                      <span className="trust-level-label">{t.label}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Persona: Tone */}
              <div className="identity-form-group">
                <label className="identity-form-label">Tonfall</label>
                <select
                  className="identity-form-select"
                  value={form.tone}
                  onChange={(e) => setForm(f => ({ ...f, tone: e.target.value }))}
                >
                  {TONE_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Persona: Expertise Tags */}
              <div className="identity-form-group">
                <label className="identity-form-label">Expertise</label>
                <div className="expertise-input-container">
                  {form.expertise.map(tag => (
                    <span key={tag} className="expertise-tag-item">
                      {tag}
                      <button
                        type="button"
                        className="expertise-tag-remove"
                        onClick={() => removeExpertise(tag)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className="expertise-tag-input"
                    value={expertiseInput}
                    onChange={(e) => setExpertiseInput(e.target.value)}
                    onKeyDown={handleExpertiseKeyDown}
                    onBlur={() => { if (expertiseInput.trim()) addExpertise(expertiseInput); }}
                    placeholder={form.expertise.length === 0 ? 'TypeScript, React, ... (Enter zum Hinzufuegen)' : 'Weitere...'}
                  />
                </div>
              </div>

              {/* Persona: Style */}
              <div className="identity-form-group">
                <label className="identity-form-label">Stil</label>
                <textarea
                  className="identity-form-textarea"
                  value={form.style}
                  onChange={(e) => setForm(f => ({ ...f, style: e.target.value }))}
                  placeholder="Beschreibe den Kommunikationsstil, z.B. 'Praezise und faktenbasiert, nutzt Aufzaehlungen, vermeidet Fachjargon...'"
                  rows={2}
                />
              </div>

              {/* Permissions */}
              <div className="identity-form-group">
                <label className="identity-form-label">Berechtigungen</label>
                <div className="permissions-grid">
                  {PERMISSION_OPTIONS.map(p => (
                    <label
                      key={p.value}
                      className={`permission-item ${form.permissions.includes(p.value) ? 'checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(p.value)}
                        onChange={() => togglePermission(p.value)}
                      />
                      <div>
                        <div className="permission-label">{p.label}</div>
                        <div className="permission-desc">{p.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Enable Toggle */}
              <div className="identity-toggle-row">
                <span className="identity-toggle-label">Agent aktiviert</span>
                <button
                  type="button"
                  className={`identity-toggle ${form.enabled ? 'on' : ''}`}
                  onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                  aria-label={form.enabled ? 'Agent deaktivieren' : 'Agent aktivieren'}
                >
                  <span className="identity-toggle-knob" />
                </button>
              </div>
            </div>

            <div className="identity-modal-footer">
              <button type="button" className="identity-btn-cancel" onClick={closeModal}>
                Abbrechen
              </button>
              <button
                type="button"
                className="identity-btn-save"
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
              >
                {saving ? 'Speichert...' : editingId ? 'Aktualisieren' : 'Erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ───────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="identity-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirmId(null); }}>
          <div className="identity-modal" style={{ maxWidth: '400px' }}>
            <div className="identity-modal-header">
              <h2>Agent loeschen</h2>
              <button type="button" className="identity-modal-close" onClick={() => setDeleteConfirmId(null)}>
                ✕
              </button>
            </div>
            <div className="identity-modal-body">
              <div className="identity-delete-confirm">
                <p>
                  Moechtest du den Agenten{' '}
                  <strong>{identities.find(i => i.id === deleteConfirmId)?.name}</strong>{' '}
                  wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.
                </p>
                <div className="identity-delete-actions">
                  <button type="button" className="identity-btn-cancel" onClick={() => setDeleteConfirmId(null)}>
                    Abbrechen
                  </button>
                  <button type="button" className="identity-btn-delete" onClick={() => handleDelete(deleteConfirmId)}>
                    Endgueltig loeschen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
