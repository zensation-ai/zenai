/**
 * EmailPage - Phase 38 Email Integration
 *
 * Tab container for email management: Inbox, Sent, Drafts, Archived.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { useEmailData } from './useEmailData';
import { EmailList } from './EmailList';
import { EmailDetail } from './EmailDetail';
import { EmailCompose } from './EmailCompose';
import { ImapAccountSetup } from './ImapAccountSetup';
import type { EmailTab, Email } from './types';
import './EmailPage.css';

const TABS: Array<{ id: EmailTab; label: string; icon: string }> = [
  { id: 'inbox', label: 'Posteingang', icon: '📥' },
  { id: 'sent', label: 'Gesendet', icon: '📤' },
  { id: 'drafts', label: 'Entwuerfe', icon: '📝' },
  { id: 'archived', label: 'Archiv', icon: '📦' },
];

interface EmailPageProps {
  context: AIContext;
  initialTab?: EmailTab;
}

export function EmailPage({ context, initialTab = 'inbox' }: EmailPageProps) {
  const { activeTab, handleTabChange } = useTabNavigation<EmailTab>({
    initialTab,
    validTabs: TABS.map(t => t.id),
    defaultTab: 'inbox',
    basePath: '/email',
    rootTab: 'inbox',
  });

  const data = useEmailData(context);
  const [composing, setComposing] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Email | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showImapSetup, setShowImapSetup] = useState(false);

  // Load emails when tab or context changes
  useEffect(() => {
    data.fetchEmails(activeTab, { search: searchQuery || undefined });
    data.fetchStats();
    data.fetchAccounts();
  }, [activeTab, context]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);

    // Debounce API calls (300ms) to avoid firing on every keystroke
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      data.fetchEmails(activeTab, { search: query || undefined });
    }, 300);
  }, [activeTab, data.fetchEmails]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectEmail = useCallback(async (email: Email) => {
    await data.fetchEmail(email.id);
    await data.fetchThread(email.id);
  }, [data.fetchEmail, data.fetchThread]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = useCallback(() => {
    data.setSelectedEmail(null);
    setReplyingTo(null);
  }, [data.setSelectedEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReply = useCallback((email: Email) => {
    setReplyingTo(email);
    setComposing(true);
  }, []);

  const handleComposeDone = useCallback(() => {
    setComposing(false);
    setReplyingTo(null);
    data.fetchEmails(activeTab, { search: searchQuery || undefined });
    data.fetchStats();
  }, [activeTab, searchQuery, data.fetchEmails, data.fetchStats]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compose mode
  if (composing) {
    return (
      <div className="email-page">
        <EmailCompose
          context={context}
          accounts={data.accounts}
          replyTo={replyingTo}
          onSend={async (emailData) => {
            if (replyingTo) {
              await data.replyToEmail(replyingTo.id, emailData);
            } else {
              await data.sendEmail(emailData);
            }
            handleComposeDone();
          }}
          onCancel={() => { setComposing(false); setReplyingTo(null); }}
        />
      </div>
    );
  }

  // Detail view
  if (data.selectedEmail) {
    return (
      <div className="email-page">
        <EmailDetail
          email={data.selectedEmail}
          thread={data.thread}
          onBack={handleBack}
          onReply={handleReply}
          onStar={() => data.toggleStar(data.selectedEmail!.id)}
          onArchive={() => { data.updateStatus(data.selectedEmail!.id, 'archived'); handleBack(); }}
          onDelete={() => { data.deleteEmail(data.selectedEmail!.id); handleBack(); }}
          onGetReplySuggestions={() => data.getReplySuggestions(data.selectedEmail!.id)}
          onAIProcess={() => data.triggerAIProcess(data.selectedEmail!.id)}
        />
      </div>
    );
  }

  // List view with tabs
  return (
    <div className="email-page">
      {/* Header */}
      <div className="email-header">
        <div className="email-header-left">
          <h1 className="email-title">E-Mail</h1>
          {data.stats && data.stats.unread > 0 && (
            <span className="email-unread-badge">{data.stats.unread}</span>
          )}
        </div>
        <div className="email-header-actions">
          <button className="email-imap-btn" onClick={() => setShowImapSetup(true)}>
            IMAP-Konto
          </button>
          <button className="email-compose-btn" onClick={() => setComposing(true)}>
            Verfassen
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="email-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`email-tab ${activeTab === tab.id ? 'email-tab--active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            <span className="email-tab-icon">{tab.icon}</span>
            <span className="email-tab-label">{tab.label}</span>
            {tab.id === 'inbox' && data.stats && data.stats.unread > 0 && (
              <span className="email-tab-badge">{data.stats.unread}</span>
            )}
          </button>
        ))}
      </div>

      {/* Email List */}
      <EmailList
        emails={data.emails}
        loading={data.loading}
        error={data.error}
        total={data.total}
        searchQuery={searchQuery}
        onSearch={handleSearch}
        onSelect={handleSelectEmail}
        onStar={(id) => data.toggleStar(id)}
        onDelete={(id) => data.deleteEmail(id)}
        onBatchAction={data.batchUpdate}
      />

      {/* IMAP Setup Modal */}
      {showImapSetup && (
        <ImapAccountSetup
          context={context}
          accounts={data.accounts}
          onCreateAccount={async (accountData) => {
            await data.createImapAccount(accountData);
          }}
          onTestConnection={data.testImapConnection}
          onSync={async (accountId) => {
            const result = await data.triggerImapSync(accountId);
            // Refresh email list after sync
            data.fetchEmails(activeTab, { search: searchQuery || undefined });
            data.fetchStats();
            return result;
          }}
          onClose={() => setShowImapSetup(false)}
        />
      )}
    </div>
  );
}
