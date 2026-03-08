/**
 * Contact Form Component - Phase 3
 *
 * Modal form for creating/editing contacts.
 */

import React, { useState } from 'react';
import type { Contact, Organization, RelationshipType } from './types';
import { RELATIONSHIP_LABELS } from './types';

interface ContactFormProps {
  contact?: Contact | null;
  organizations: Organization[];
  onSubmit: (data: Partial<Contact>) => void;
  onCancel: () => void;
}

export function ContactForm({ contact, organizations, onSubmit, onCancel }: ContactFormProps) {
  const [displayName, setDisplayName] = useState(contact?.display_name || '');
  const [firstName, setFirstName] = useState(contact?.first_name || '');
  const [lastName, setLastName] = useState(contact?.last_name || '');
  const [email, setEmail] = useState(contact?.email?.[0] || '');
  const [phone, setPhone] = useState(contact?.phone?.[0] || '');
  const [organizationId, setOrganizationId] = useState(contact?.organization_id || '');
  const [role, setRole] = useState(contact?.role || '');
  const [relationshipType, setRelationshipType] = useState<RelationshipType>(contact?.relationship_type || 'other');
  const [notes, setNotes] = useState(contact?.notes || '');
  const [tags, setTags] = useState(contact?.tags?.join(', ') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    onSubmit({
      display_name: displayName.trim(),
      first_name: firstName.trim() || undefined,
      last_name: lastName.trim() || undefined,
      email: email.trim() ? [email.trim()] : [],
      phone: phone.trim() ? [phone.trim()] : [],
      organization_id: organizationId || undefined,
      role: role.trim() || undefined,
      relationship_type: relationshipType,
      notes: notes.trim() || undefined,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    } as Partial<Contact>);
  };

  return (
    <div className="contact-form-overlay" onClick={onCancel}>
      <div className="contact-form-modal" onClick={e => e.stopPropagation()}>
        <div className="contact-form-header">
          <h2>{contact ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</h2>
          <button type="button" className="contact-form-close" onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="contact-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cf-displayName">Anzeigename *</label>
              <input
                id="cf-displayName"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Max Mustermann"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-row two-col">
            <div className="form-group">
              <label htmlFor="cf-firstName">Vorname</label>
              <input
                id="cf-firstName"
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Max"
              />
            </div>
            <div className="form-group">
              <label htmlFor="cf-lastName">Nachname</label>
              <input
                id="cf-lastName"
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Mustermann"
              />
            </div>
          </div>

          <div className="form-row two-col">
            <div className="form-group">
              <label htmlFor="cf-email">E-Mail</label>
              <input
                id="cf-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="max@example.com"
              />
            </div>
            <div className="form-group">
              <label htmlFor="cf-phone">Telefon</label>
              <input
                id="cf-phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+49 123 456789"
              />
            </div>
          </div>

          <div className="form-row two-col">
            <div className="form-group">
              <label htmlFor="cf-org">Organisation</label>
              <select
                id="cf-org"
                value={organizationId}
                onChange={e => setOrganizationId(e.target.value)}
              >
                <option value="">-- Keine --</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="cf-role">Rolle / Position</label>
              <input
                id="cf-role"
                type="text"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="Geschaeftsfuehrer"
              />
            </div>
          </div>

          <div className="form-row two-col">
            <div className="form-group">
              <label htmlFor="cf-relationship">Beziehung</label>
              <select
                id="cf-relationship"
                value={relationshipType}
                onChange={e => setRelationshipType(e.target.value as RelationshipType)}
              >
                {Object.entries(RELATIONSHIP_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="cf-tags">Tags (kommagetrennt)</label>
              <input
                id="cf-tags"
                type="text"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="wichtig, projekt-x"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cf-notes">Notizen</label>
              <textarea
                id="cf-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notizen zum Kontakt..."
                rows={3}
              />
            </div>
          </div>

          <div className="contact-form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
            <button type="submit" className="btn-primary" disabled={!displayName.trim()}>
              {contact ? 'Speichern' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
