/**
 * ContactsPage - Kontaktverwaltung
 *
 * Tabs: Alle Kontakte, Favoriten, Organisationen
 *
 * Migrated to React Query for caching + deduplication (Phase 4.1c).
 */

import { useState, useCallback, useMemo } from 'react';
import {
  useContactsQuery,
  useContactStatsQuery,
  useContactFollowUpsQuery,
  useOrganizationsQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useDeleteContactMutation,
  useCreateOrganizationMutation,
  useDeleteOrganizationMutation,
} from '../../hooks/queries/useContacts';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { ContactList } from './ContactList';
import { OrganizationList } from './OrganizationList';
import { useEscapeKey } from '../../hooks/useClickOutside';
import { ContactForm } from './ContactForm';
import { HubPage, type TabDef } from '../HubPage';
import { PullToRefresh } from '../ui';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import type { AIContext } from '../ContextSwitcher';
import type { Contact, Organization } from './types';
import './ContactsPage.css';

type ContactTab = 'all' | 'favorites' | 'organizations';

interface ContactsPageProps {
  context: AIContext;
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

  // Filter state — drives the contacts query reactively
  const [contactFilters, setContactFilters] = useState<Record<string, unknown>>({});
  const [orgSearch, setOrgSearch] = useState<string | undefined>(undefined);

  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showOrgForm, setShowOrgForm] = useState(false);
  useEscapeKey(() => setShowOrgForm(false), showOrgForm);
  const [orgName, setOrgName] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('');

  // React Query hooks — replaces useContactsData
  const contactsQuery = useContactsQuery(context, contactFilters);
  const orgsQuery = useOrganizationsQuery(context, orgSearch ? { search: orgSearch } : undefined);
  const statsQuery = useContactStatsQuery(context);
  const followUpsQuery = useContactFollowUpsQuery(context);

  const createContactMutation = useCreateContactMutation(context);
  const updateContactMutation = useUpdateContactMutation(context);
  const deleteContactMutation = useDeleteContactMutation(context);
  const createOrgMutation = useCreateOrganizationMutation(context);
  const deleteOrgMutation = useDeleteOrganizationMutation(context);

  const queryClient = useQueryClient();
  const { isMobile } = useBreakpoint();

  const handlePullToRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all(context) });
  }, [queryClient, context]);

  // Derived data
  const contacts = (contactsQuery.data ?? []) as Contact[];
  const organizations = (orgsQuery.data ?? []) as Organization[];
  const stats = statsQuery.data as { total_contacts?: number; total_organizations?: number; favorites?: number } | null;
  const followUps = (followUpsQuery.data ?? []) as Contact[];
  const loading = contactsQuery.isLoading || orgsQuery.isLoading;
  const totalContacts = stats?.total_contacts ?? contacts.length;
  const totalOrganizations = stats?.total_organizations ?? organizations.length;

  // Tab change with filter for favorites
  const handleTabChange = useCallback((tab: ContactTab) => {
    rawTabChange(tab);
    if (tab === 'favorites') {
      setContactFilters({ is_favorite: true });
    } else if (tab === 'all') {
      setContactFilters({});
    }
  }, [rawTabChange]);

  // Tabs with dynamic badge
  const tabsWithBadge = useMemo(() =>
    TABS.map(tab => {
      if (tab.id === 'favorites' && stats?.favorites) return { ...tab, badge: stats.favorites };
      return tab;
    }), [stats?.favorites]
  );

  // Contact handlers
  const handleSearchContacts = useCallback((query: string) => {
    setContactFilters(query ? { search: query } : {});
  }, []);

  const handleFilterRelationship = useCallback((type: string | undefined) => {
    setContactFilters(prev => type ? { ...prev, relationship_type: type } : {});
  }, []);

  const handleSelectContact = useCallback((contact: Contact) => {
    setEditingContact(contact);
    setShowForm(true);
  }, []);

  const handleToggleFavorite = useCallback(async (id: string, isFavorite: boolean) => {
    await updateContactMutation.mutateAsync({ id, is_favorite: isFavorite });
  }, [updateContactMutation]);

  const handleSubmitContact = useCallback(async (data: Partial<Contact>) => {
    if (editingContact) {
      await updateContactMutation.mutateAsync({ id: editingContact.id, ...data });
    } else {
      await createContactMutation.mutateAsync(data as Record<string, unknown>);
    }
    setShowForm(false);
    setEditingContact(null);
  }, [editingContact, updateContactMutation, createContactMutation]);

  const handleDeleteContact = useCallback(async (id: string) => {
    await deleteContactMutation.mutateAsync(id);
    return true;
  }, [deleteContactMutation]);

  const handleSubmitOrg = useCallback(async () => {
    if (!orgName.trim()) return;
    await createOrgMutation.mutateAsync({
      name: orgName.trim(),
      industry: orgIndustry.trim() || undefined,
    });
    setShowOrgForm(false);
    setOrgName('');
    setOrgIndustry('');
  }, [orgName, orgIndustry, createOrgMutation]);

  const handleDeleteOrg = useCallback(async (id: string) => {
    await deleteOrgMutation.mutateAsync(id);
    return true;
  }, [deleteOrgMutation]);

  const headerActions = (
    <>
      {activeTab === 'organizations' ? (
        <button type="button" className="btn-primary" onClick={() => setShowOrgForm(true)}>
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
        <PullToRefresh onRefresh={handlePullToRefresh} enabled={isMobile}>
        <div className="contacts-content">
          {activeTab === 'organizations' ? (
            <OrganizationList
              organizations={organizations}
              total={totalOrganizations}
              loading={loading}
              onSelect={(org) => {
                setContactFilters({ organization_id: org.id });
                handleTabChange('all');
              }}
              onSearch={(q: string) => setOrgSearch(q || undefined)}
              onDelete={handleDeleteOrg}
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
              onDelete={handleDeleteContact}
            />
          )}
        </div>
        </PullToRefresh>
      </HubPage>

      {showForm && (
        <ContactForm
          contact={editingContact}
          organizations={organizations}
          onSubmit={handleSubmitContact}
          onCancel={() => { setShowForm(false); setEditingContact(null); }}
        />
      )}

      {showOrgForm && (
        <div className="modal-overlay" onClick={() => setShowOrgForm(false)} role="presentation">
          <div className="modal-content org-form-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Neue Organisation">
            <h3>Neue Organisation</h3>
            <label>
              Name *
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="Name der Organisation"
                autoFocus
              />
            </label>
            <label>
              Branche (optional)
              <input
                type="text"
                value={orgIndustry}
                onChange={e => setOrgIndustry(e.target.value)}
                placeholder="z.B. IT, Beratung, Handel"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => { setShowOrgForm(false); setOrgName(''); setOrgIndustry(''); }}>
                Abbrechen
              </button>
              <button type="button" className="btn-primary" onClick={handleSubmitOrg} disabled={!orgName.trim()}>
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
