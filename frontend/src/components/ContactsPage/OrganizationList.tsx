/**
 * Organization List Component - Phase 3
 */

import { useState } from 'react';
import type { Organization } from './types';

interface OrganizationListProps {
  organizations: Organization[];
  total: number;
  loading: boolean;
  onSelect: (org: Organization) => void;
  onSearch: (query: string) => void;
  onDelete: (id: string) => void;
}

export function OrganizationList({
  organizations,
  total,
  loading,
  onSelect,
  onSearch,
  onDelete,
}: OrganizationListProps) {
  const [searchValue, setSearchValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleSearch = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

  return (
    <div className="org-list">
      <div className="contacts-search">
        <input
          type="text"
          placeholder="Organisationen suchen..."
          value={searchValue}
          onChange={e => handleSearch(e.target.value)}
          className="contacts-search-input"
        />
        <span className="contacts-count">{total} Organisationen</span>
      </div>

      {loading ? (
        <div className="contacts-loading">Lade Organisationen...</div>
      ) : organizations.length === 0 ? (
        <div className="contacts-empty">
          <span className="contacts-empty-icon">🏢</span>
          <p>Keine Organisationen gefunden</p>
        </div>
      ) : (
        <div className="contacts-items">
          {organizations.map(org => (
            <div
              key={org.id}
              className="contact-item org-item"
              onClick={() => onSelect(org)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect(org)}
            >
              <div className="contact-avatar org-avatar">
                <span className="contact-initials">🏢</span>
              </div>

              <div className="contact-info">
                <div className="contact-name-row">
                  <span className="contact-name">{org.name}</span>
                  {org.industry && <span className="contact-relationship">{org.industry}</span>}
                </div>
                <div className="contact-meta">
                  {org.website && <span className="contact-email">{org.website}</span>}
                  {org.city && <span className="contact-phone">{org.city}</span>}
                  <span className="org-contact-count">
                    {org.contact_count || 0} Kontakte
                  </span>
                </div>
              </div>

              <div className="contact-actions">
                {deleteConfirm === org.id ? (
                  <div className="contact-buttons">
                    <button
                      type="button"
                      className="contact-action-btn danger"
                      onClick={e => { e.stopPropagation(); onDelete(org.id); setDeleteConfirm(null); }}
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
                  </div>
                ) : (
                  <button
                    type="button"
                    className="contact-action-btn"
                    title="Loeschen"
                    onClick={e => { e.stopPropagation(); setDeleteConfirm(org.id); }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
