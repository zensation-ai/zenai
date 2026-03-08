/**
 * ContactsPage - Kontaktverwaltung
 *
 * Tabs: Alle Kontakte, Favoriten, Organisationen
 */

import { useState, useCallback, useMemo } from 'react';
import { useContactsData } from './useContactsData';
import { ContactList } from './ContactList';
import { OrganizationList } from './OrganizationList';
import { ContactForm } from './ContactForm';
import { HubPage, type TabDef } from '../HubPage';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import type { Contact, Organization } from './types';
import './ContactsPage.css';

type ContactTab = 'all' | 'favorites' | 'organizations';

interface ContactsPageProps {
  context: string;
  initialTab?: ContactTab;
  onBack: () => void;
}

const TABS: TabDef<ContactTab>[] = [
  { id: 'all', label: 'Alle Kontakte', icon: '👥' },
  { id: 'favorites', label: 'Favoriten', icon: '⭐' },
  { id: 'organizations', label: 'Organisationen', icon: '🏢' },
];

export function ContactsPage({ context, initialTab = 'all', onBack }: ContactsPageProps) {
  const { activeTab, handleTabChange: rawTabChange } = useTabNavigation<ContactTab>({
    initialTab,
    validTabs: ['all', 'favorites', 'organizations'],
    defaultTab: 'all',
    basePath: '/contacts',
    rootTab: 'all',
  });
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const {
    contacts, organizations, stats, followUps,
    totalContacts, totalOrganizations, loading,
    fetchContacts, fetchOrganizations,
    createContact, updateContact, deleteContact,
    createOrganization, deleteOrganization,
  } = useContactsData({ context });

  // Tab change with data fetch for favorites
  const handleTabChange = useCallback((tab: ContactTab) => {
    rawTabChange(tab);
    if (tab === 'favorites') fetchContacts({ is_favorite: true });
  }, [rawTabChange, fetchContacts]);

  // Tabs with dynamic badge
  const tabsWithBadge = useMemo(() =>
    TABS.map(tab => {
      if (tab.id === 'favorites' && stats?.favorites) return { ...tab, badge: stats.favorites };
      return tab;
    }), [stats?.favorites]
  );

  // Contact handlers
  const handleSearchContacts = useCallback((query: string) => {
    fetchContacts({ search: query || undefined });
  }, [fetchContacts]);

  const handleFilterRelationship = useCallback((type: string | undefined) => {
    fetchContacts({ relationship_type: type });
  }, [fetchContacts]);

  const handleSelectContact = useCallback((contact: Contact) => {
    setEditingContact(contact);
    setShowForm(true);
  }, []);

  const handleToggleFavorite = useCallback(async (id: string, isFavorite: boolean) => {
    await updateContact(id, { is_favorite: isFavorite } as Partial<Contact>);
  }, [updateContact]);

  const handleSubmitContact = useCallback(async (data: Partial<Contact>) => {
    if (editingContact) {
      await updateContact(editingContact.id, data);
    } else {
      await createContact(data);
    }
    setShowForm(false);
    setEditingContact(null);
  }, [editingContact, updateContact, createContact]);

  const handleSubmitOrg = useCallback(async () => {
    const name = prompt('Name der Organisation:');
    if (!name?.trim()) return;
    const industry = prompt('Branche (optional):');
    await createOrganization({
      name: name.trim(),
      industry: industry?.trim() || undefined,
    } as Partial<Organization>);
  }, [createOrganization]);

  const headerActions = (
    <>
      {activeTab === 'organizations' ? (
        <button type="button" className="btn-primary" onClick={handleSubmitOrg}>
          + Organisation
        </button>
      ) : (
        <button type="button" className="btn-primary" onClick={() => { setEditingContact(null); setShowForm(true); }}>
          + Kontakt
        </button>
      )}
    </>
  );

  return (
    <>
      <HubPage
        title="Kontakte"
        icon="👥"
        subtitle={stats ? `${stats.total_contacts} Kontakte | ${stats.total_organizations} Organisationen` : undefined}
        tabs={tabsWithBadge}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onBack={onBack}
        context={context as 'personal' | 'work' | 'learning' | 'creative'}
        headerActions={headerActions}
      >
        {/* Follow-up Suggestions */}
        {followUps.length > 0 && activeTab !== 'organizations' && (
          <div className="contacts-follow-ups">
            <h3>Follow-up Vorschlaege</h3>
            <div className="follow-up-list">
              {followUps.slice(0, 5).map(contact => (
                <button
                  key={contact.id}
                  type="button"
                  className="follow-up-chip"
                  onClick={() => handleSelectContact(contact)}
                >
                  <span className="follow-up-name">{contact.display_name}</span>
                  <span className="follow-up-info">
                    {contact.last_interaction_at
                      ? `Seit ${Math.floor((Date.now() - new Date(contact.last_interaction_at).getTime()) / 86400000)} Tagen`
                      : 'Kein Kontakt'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="contacts-content">
          {activeTab === 'organizations' ? (
            <OrganizationList
              organizations={organizations}
              total={totalOrganizations}
              loading={loading}
              onSelect={(org) => {
                fetchContacts({ organization_id: org.id });
                handleTabChange('all');
              }}
              onSearch={(q: string) => fetchOrganizations(q || undefined)}
              onDelete={deleteOrganization}
            />
          ) : (
            <ContactList
              contacts={activeTab === 'favorites' ? contacts.filter(c => c.is_favorite) : contacts}
              total={activeTab === 'favorites' ? (stats?.favorites || 0) : totalContacts}
              loading={loading}
              onSelect={handleSelectContact}
              onSearch={handleSearchContacts}
              onFilterRelationship={handleFilterRelationship}
              onToggleFavorite={handleToggleFavorite}
              onDelete={deleteContact}
            />
          )}
        </div>
      </HubPage>

      {showForm && (
        <ContactForm
          contact={editingContact}
          organizations={organizations}
          onSubmit={handleSubmitContact}
          onCancel={() => { setShowForm(false); setEditingContact(null); }}
        />
      )}
    </>
  );
}
