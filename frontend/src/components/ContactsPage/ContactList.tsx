/**
 * Contact List Component - Phase 3
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Users } from 'lucide-react';
import type { Contact } from './types';
import { RELATIONSHIP_LABELS } from './types';
import type { RelationshipType } from './types';
import { staggerContainer, staggerItem } from '../../utils/animations';
import { ListSkeleton } from '../skeletons/PageSkeletons';
import { EmptyStateWithDemoSeed } from '../shared/EmptyStateWithDemoSeed';

const VIRTUALIZATION_THRESHOLD = 50;
const ROW_HEIGHT = 72;

interface ContactListProps {
  contacts: Contact[];
  total: number;
  loading: boolean;
  onSelect: (contact: Contact) => void;
  onSearch: (query: string) => void;
  onFilterRelationship: (type: string | undefined) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onDelete: (id: string) => void;
  onAdd?: () => void;
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

interface ContactRowProps {
  contact: Contact;
  deleteConfirm: string | null;
  onSelect: (contact: Contact) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onDelete: (id: string) => void;
  setDeleteConfirm: (id: string | null) => void;
}

function ContactRow({ contact, deleteConfirm, onToggleFavorite, onDelete, setDeleteConfirm }: ContactRowProps) {
  return (
    <>
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
              title="Löschen"
              aria-label="Löschen"
              onClick={e => { e.stopPropagation(); setDeleteConfirm(contact.id); }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>
    </>
  );
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
  onAdd,
}: ContactListProps) {
  const [searchValue, setSearchValue] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    enabled: contacts.length >= VIRTUALIZATION_THRESHOLD,
  });

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
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
            <ListSkeleton rows={5} />
          </motion.div>
        ) : contacts.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EmptyStateWithDemoSeed
              icon={<Users size={40} strokeWidth={1.5} />}
              title="Keine Kontakte"
              description="Füge Kontakte hinzu oder lade Demo-Daten, um den Contact-Flow auszuprobieren."
              createLabel={onAdd ? 'Kontakt erstellen' : null}
              onCreate={onAdd}
            />
          </motion.div>
        ) : contacts.length >= VIRTUALIZATION_THRESHOLD ? (
          /* Virtualized list for large contact lists */
          <div
            ref={listRef}
            className="contacts-items overflow-auto"
            style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}
          >
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const contact = contacts[virtualRow.index];
                return (
                  <div
                    key={contact.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="contact-item absolute w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onClick={() => onSelect(contact)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(contact); } }}
                  >
                    <ContactRow
                      contact={contact}
                      deleteConfirm={deleteConfirm}
                      onSelect={onSelect}
                      onToggleFavorite={onToggleFavorite}
                      onDelete={onDelete}
                      setDeleteConfirm={setDeleteConfirm}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <motion.div
            key="content"
            className="contacts-items"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {contacts.map(contact => (
              <motion.div
                key={contact.id}
                variants={staggerItem}
                className="contact-item"
                onClick={() => onSelect(contact)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(contact); } }}
              >
                <ContactRow
                  contact={contact}
                  deleteConfirm={deleteConfirm}
                  onSelect={onSelect}
                  onToggleFavorite={onToggleFavorite}
                  onDelete={onDelete}
                  setDeleteConfirm={setDeleteConfirm}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
