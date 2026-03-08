/**
 * Contact List Component - Phase 3
 */

import { useState } from 'react';
import type { Contact } from './types';
import { RELATIONSHIP_LABELS } from './types';
import type { RelationshipType } from './types';

interface ContactListProps {
  contacts: Contact[];
  total: number;
  loading: boolean;
  onSelect: (contact: Contact) => void;
  onSearch: (query: string) => void;
  onFilterRelationship: (type: string | undefined) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onDelete: (id: string) => void;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Nie';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Heute';
  if (days === 1) return 'Gestern';
  if (days < 7) return `Vor ${days} Tagen`;
  if (days < 30) return `Vor ${Math.floor(days / 7)} Wochen`;
  if (days < 365) return `Vor ${Math.floor(days / 30)} Monaten`;
  return `Vor ${Math.floor(days / 365)} Jahren`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ContactList({
  contacts,
  total,
  loading,
  onSelect,
  onSearch,
  onFilterRelationship,
  onToggleFavorite,
  onDelete,
}: ContactListProps) {
  const [searchValue, setSearchValue] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleSearch = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

  const handleFilter = (type: string | undefined) => {
    setActiveFilter(type === activeFilter ? undefined : type);
    onFilterRelationship(type === activeFilter ? undefined : type);
  };

  return (
    <div className="contacts-list">
      {/* Search */}
      <div className="contacts-search">
        <input
          type="text"
          placeholder="Kontakte suchen..."
          value={searchValue}
          onChange={e => handleSearch(e.target.value)}
          className="contacts-search-input"
        />
        <span className="contacts-count">{total} Kontakte</span>
      </div>

      {/* Relationship Filter */}
      <div className="contacts-filters">
        {Object.entries(RELATIONSHIP_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`contacts-filter-chip ${activeFilter === key ? 'active' : ''}`}
            onClick={() => handleFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="contacts-loading">Lade Kontakte...</div>
      ) : contacts.length === 0 ? (
        <div className="contacts-empty">
          <span className="contacts-empty-icon">👥</span>
          <p>Keine Kontakte gefunden</p>
          <p className="contacts-empty-sub">Erstelle deinen ersten Kontakt</p>
        </div>
      ) : (
        <div className="contacts-items">
          {contacts.map(contact => (
            <div
              key={contact.id}
              className="contact-item"
              onClick={() => onSelect(contact)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect(contact)}
            >
              <div className="contact-avatar">
                {contact.avatar_url ? (
                  <img src={contact.avatar_url} alt={contact.display_name} />
                ) : (
                  <span className="contact-initials">{getInitials(contact.display_name)}</span>
                )}
              </div>

              <div className="contact-info">
                <div className="contact-name-row">
                  <span className="contact-name">{contact.display_name}</span>
                  {contact.is_favorite && <span className="contact-star" title="Favorit">⭐</span>}
                  <span className="contact-relationship">
                    {RELATIONSHIP_LABELS[contact.relationship_type as RelationshipType] || contact.relationship_type}
                  </span>
                </div>
                {(contact.role || contact.organization_name) && (
                  <div className="contact-subtitle">
                    {contact.role && <span>{contact.role}</span>}
                    {contact.role && contact.organization_name && <span> @ </span>}
                    {contact.organization_name && <span className="contact-org">{contact.organization_name}</span>}
                  </div>
                )}
                <div className="contact-meta">
                  {contact.email?.[0] && <span className="contact-email">{contact.email[0]}</span>}
                  {contact.phone?.[0] && <span className="contact-phone">{contact.phone[0]}</span>}
                </div>
              </div>

              <div className="contact-actions">
                <span className="contact-last-interaction">
                  {formatRelativeTime(contact.last_interaction_at)}
                </span>
                <div className="contact-buttons">
                  <button
                    type="button"
                    className="contact-action-btn"
                    title={contact.is_favorite ? 'Von Favoriten entfernen' : 'Zu Favoriten'}
                    onClick={e => { e.stopPropagation(); onToggleFavorite(contact.id, !contact.is_favorite); }}
                  >
                    {contact.is_favorite ? '⭐' : '☆'}
                  </button>
                  {deleteConfirm === contact.id ? (
                    <>
                      <button
                        type="button"
                        className="contact-action-btn danger"
                        onClick={e => { e.stopPropagation(); onDelete(contact.id); setDeleteConfirm(null); }}
                      >
                        Ja
                      </button>
                      <button
                        type="button"
                        className="contact-action-btn"
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(null); }}
                      >
                        Nein
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="contact-action-btn"
                      title="Loeschen"
                      onClick={e => { e.stopPropagation(); setDeleteConfirm(contact.id); }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
