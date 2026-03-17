/**
 * EmailPage - Premium Split-Pane Email Client
 *
 * Features:
 * - Split-pane layout (list + detail side by side on desktop)
 * - Keyboard shortcuts (j/k navigate, e archive, r reply, s star, / search)
 * - Filter chips (folders, categories, unread, starred)
 * - Undo toast for destructive actions
 * - Auto-refresh every 30s
 * - Floating compose modal
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { useEmailData } from './useEmailData';
import { EmailList } from './EmailList';
import { EmailDetail } from './EmailDetail';
import { EmailCompose } from './EmailCompose';
import { ImapAccountSetup } from './ImapAccountSetup';
import { PullToRefresh } from '../ui';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import type { EmailTab, ComposeState, Email, EmailCategory } from './types';
import { FOLDER_CONFIG, CATEGORY_LABELS } from './types';
import './EmailPage.css';

const MAIN_FOLDERS: EmailTab[] = ['inbox', 'sent', 'drafts', 'archived', 'starred', 'trash'];

interface EmailPageProps {
  context: AIContext;
  initialTab?: EmailTab;
}

export function EmailPage({ context, initialTab = 'inbox' }: EmailPageProps) {
  // ── State ─────────────────────────────────────────────────
  const [activeFolder, setActiveFolder] = useState<EmailTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<EmailCategory | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [showImapSetup, setShowImapSetup] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const data = useEmailData(context);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isMobile } = useBreakpoint();

  const handlePullToRefresh = useCallback(async () => {
    await data.refetchCurrent();
    data.fetchStats();
  }, [data]);

  // ── Data loading ──────────────────────────────────────────

  useEffect(() => {
    const filters = {
      search: searchQuery || undefined,
      category: activeCategory || undefined,
      unread: showUnreadOnly || undefined,
    };
    data.fetchEmails(activeFolder, filters);
    data.fetchStats();
    data.fetchAccounts();
    data.startAutoRefresh();
    return () => {
      data.stopAutoRefresh();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [activeFolder, context, activeCategory, showUnreadOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search with debounce ──────────────────────────────────

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      data.fetchEmails(activeFolder, {
        search: query || undefined,
        category: activeCategory || undefined,
        unread: showUnreadOnly || undefined,
      });
    }, 300);
  }, [activeFolder, activeCategory, showUnreadOnly, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ────────────────────────────────────────────

  const handleFolderChange = useCallback((folder: EmailTab) => {
    setActiveFolder(folder);
    setActiveCategory(null);
    setShowUnreadOnly(false);
    setSearchQuery('');
    data.setSelectedEmail(null);
    setFocusedIndex(0);
    setMobileShowDetail(false);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectEmail = useCallback(async (email: Email) => {
    data.setError(null);
    await data.fetchEmail(email.id);
    await data.fetchThread(email.id);
    setFocusedIndex(data.emails.findIndex(e => e.id === email.id));
    setMobileShowDetail(true);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = useCallback(() => {
    data.setSelectedEmail(null);
    data.setError(null);
    setMobileShowDetail(false);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Compose handlers ──────────────────────────────────────

  const handleCompose = useCallback(() => {
    setCompose({ mode: 'new' });
  }, []);

  const handleReply = useCallback((email: Email, prefillBody?: string) => {
    setCompose({ mode: 'reply', replyTo: email, prefillBody });
  }, []);

  const handleReplyAll = useCallback((email: Email) => {
    setCompose({ mode: 'reply-all', replyTo: email });
  }, []);

  const handleForward = useCallback((email: Email) => {
    setCompose({ mode: 'forward', replyTo: email });
  }, []);

  const handleComposeSend = useCallback(async (emailData: {
    to_addresses: Array<{ email: string; name?: string }>;
    cc_addresses?: Array<{ email: string; name?: string }>;
    subject?: string;
    body_html?: string;
    body_text?: string;
    account_id?: string;
  }) => {
    if ((compose?.mode === 'reply' || compose?.mode === 'reply-all') && compose.replyTo) {
      await data.replyToEmail(compose.replyTo.id, emailData);
    } else if (compose?.mode === 'forward' && compose.replyTo) {
      await data.forwardEmail(compose.replyTo.id, emailData.to_addresses, emailData);
    } else {
      await data.sendEmail(emailData);
    }
    setCompose(null);
    data.refetchCurrent();
    data.fetchStats();
  }, [compose, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draft editing ─────────────────────────────────────────

  const handleSelectEmailOrDraft = useCallback(async (email: Email) => {
    // If in drafts folder, open draft in compose mode
    if (activeFolder === 'drafts' && email.status === 'draft') {
      setCompose({
        mode: 'new',
        replyTo: undefined,
        prefillBody: email.body_text || '',
        prefillSubject: email.subject || '',
        // Store draft ID so we can update instead of creating new
        draftId: email.id,
        prefillTo: (email.to_addresses ?? []).map(a => a.email).join(', '),
        prefillCc: (email.cc_addresses ?? []).map(a => a.email).join(', '),
        prefillAccountId: email.account_id || undefined,
      } as ComposeState & { draftId?: string; prefillTo?: string; prefillCc?: string; prefillAccountId?: string });
      return;
    }
    handleSelectEmail(email);
  }, [activeFolder, handleSelectEmail]);

  // ── Keyboard shortcuts ────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Always allow Escape
      if (e.key === 'Escape') {
        if (compose) { setCompose(null); return; }
        if (showImapSetup) { setShowImapSetup(false); return; }
        if (data.selectedEmail) { handleBack(); return; }
        if (searchQuery) { handleSearch(''); searchInputRef.current?.blur(); return; }
        return;
      }

      if (isInput) return;

      switch (e.key) {
        case 'j': // Next email
          e.preventDefault();
          setFocusedIndex(prev => {
            const next = Math.min(prev + 1, data.emails.length - 1);
            if (data.emails[next]) handleSelectEmail(data.emails[next]);
            return next;
          });
          break;
        case 'k': // Previous email
          e.preventDefault();
          setFocusedIndex(prev => {
            const next = Math.max(prev - 1, 0);
            if (data.emails[next]) handleSelectEmail(data.emails[next]);
            return next;
          });
          break;
        case 'Enter': // Open focused email
          if (!data.selectedEmail && data.emails[focusedIndex]) {
            e.preventDefault();
            handleSelectEmail(data.emails[focusedIndex]);
          }
          break;
        case 'c': // Compose
          e.preventDefault();
          handleCompose();
          break;
        case 'r': // Reply
          if (data.selectedEmail) {
            e.preventDefault();
            handleReply(data.selectedEmail);
          }
          break;
        case 'a': // Reply all
          if (data.selectedEmail) {
            e.preventDefault();
            handleReplyAll(data.selectedEmail);
          }
          break;
        case 'f': // Forward
          if (data.selectedEmail) {
            e.preventDefault();
            handleForward(data.selectedEmail);
          }
          break;
        case 'e': // Archive
          if (data.selectedEmail) {
            e.preventDefault();
            data.archiveEmail(data.selectedEmail.id);
            handleBack();
          }
          break;
        case 's': // Star
          if (data.selectedEmail) {
            e.preventDefault();
            data.toggleStar(data.selectedEmail.id);
          }
          break;
        case '#': // Delete
          if (data.selectedEmail) {
            e.preventDefault();
            data.deleteEmail(data.selectedEmail.id);
            handleBack();
          }
          break;
        case '/': // Focus search
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'z': // Undo
          if (e.ctrlKey || e.metaKey) {
            if (data.undoAction) {
              e.preventDefault();
              data.executeUndo();
            }
          }
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [compose, showImapSetup, data.selectedEmail, data.emails, focusedIndex, searchQuery, data.undoAction, handleBack, handleCompose, handleReply, handleReplyAll, handleForward, handleSelectEmail, handleSearch, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Category filter toggle ────────────────────────────────

  const toggleCategory = useCallback((cat: EmailCategory) => {
    setActiveCategory(prev => prev === cat ? null : cat);
  }, []);

  // ── Sync handler ──────────────────────────────────────────

  const handleSync = useCallback(async () => {
    const imapAccounts = data.accounts.filter(a => a.imap_enabled);
    for (const account of imapAccounts) {
      try {
        await data.triggerImapSync(account.id);
      } catch { /* silent */ }
    }
    data.refetchCurrent();
    data.fetchStats();
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasImapAccounts = data.accounts.some(a => a.imap_enabled);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="email-page">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="ep-header">
        <div className="ep-header-left">
          <h1 className="ep-title">E-Mail</h1>
          {data.stats && data.stats.unread > 0 && (
            <span className="ep-unread-badge">{data.stats.unread}</span>
          )}
        </div>
        <div className="ep-header-right">
          {hasImapAccounts && (
            <button className="ep-btn ep-btn--ghost" onClick={handleSync} title="E-Mails synchronisieren">
              <span className="ep-btn-icon">↻</span>
              <span className="ep-btn-label">Sync</span>
            </button>
          )}
          <button className="ep-btn ep-btn--ghost" onClick={() => setShowImapSetup(true)}>
            <span className="ep-btn-icon">⚙</span>
            <span className="ep-btn-label">Konten</span>
          </button>
          <button className="ep-btn ep-btn--primary" onClick={handleCompose}>
            <span className="ep-btn-icon">✏</span>
            <span className="ep-btn-label">Verfassen</span>
          </button>
        </div>
      </div>

      {/* ── Folder tabs ────────────────────────────────────── */}
      <div className="ep-folders">
        {MAIN_FOLDERS.map(folder => {
          const cfg = FOLDER_CONFIG[folder];
          const isActive = activeFolder === folder;
          const count = folder === 'inbox' ? data.stats?.unread :
                        folder === 'starred' ? data.stats?.starred : undefined;
          return (
            <button
              key={folder}
              className={`ep-folder ${isActive ? 'ep-folder--active' : ''}`}
              onClick={() => handleFolderChange(folder)}
            >
              <span className="ep-folder-icon">{cfg.icon}</span>
              <span className="ep-folder-label">{cfg.label}</span>
              {isActive && count != null && count > 0 && (
                <span className="ep-folder-count">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Filter chips ───────────────────────────────────── */}
      {activeFolder === 'inbox' && (
        <div className="ep-filters">
          <button
            className={`ep-chip ${showUnreadOnly ? 'ep-chip--active' : ''}`}
            onClick={() => setShowUnreadOnly(prev => !prev)}
          >
            Ungelesen
          </button>
          {(Object.entries(CATEGORY_LABELS) as [EmailCategory, { label: string; color: string; icon: string }][]).map(([cat, cfg]) => (
            <button
              key={cat}
              className={`ep-chip ${activeCategory === cat ? 'ep-chip--active' : ''}`}
              onClick={() => toggleCategory(cat)}
              style={activeCategory === cat ? { backgroundColor: cfg.color + '25', color: cfg.color, borderColor: cfg.color + '40' } : undefined}
            >
              <span className="ep-chip-icon">{cfg.icon}</span>
              {cfg.label}
              {data.stats?.by_category[cat] != null && data.stats.by_category[cat] > 0 && (
                <span className="ep-chip-count">{data.stats.by_category[cat]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Split pane ─────────────────────────────────────── */}
      <div className={`ep-split ${mobileShowDetail ? 'ep-split--detail-active' : ''}`}>
        {/* Left: Email List */}
        <PullToRefresh onRefresh={handlePullToRefresh} enabled={isMobile}>
        <div className="ep-split-list">
          <EmailList
            emails={data.emails}
            loading={data.loading}
            error={data.error}
            total={data.total}
            searchQuery={searchQuery}
            onSearch={handleSearch}
            onSelect={handleSelectEmailOrDraft}
            onStar={(id) => data.toggleStar(id)}
            onArchive={(id) => data.archiveEmail(id)}
            onDelete={(id) => data.deleteEmail(id)}
            onBatchAction={data.batchUpdate}
            selectedId={data.selectedEmail?.id ?? null}
            focusedIndex={focusedIndex}
            searchInputRef={searchInputRef}
            activeFolder={activeFolder}
          />
          {/* Pagination: Load More */}
          {data.emails.length < data.total && !data.loading && (
            <button
              className="ep-load-more"
              onClick={() => data.loadMore(activeFolder, {
                search: searchQuery || undefined,
                category: activeCategory || undefined,
                unread: showUnreadOnly || undefined,
              })}
            >
              Weitere laden ({data.emails.length} von {data.total})
            </button>
          )}
        </div>
        </PullToRefresh>

        {/* Right: Email Detail */}
        <div className="ep-split-detail">
          {data.selectedEmail ? (
            <EmailDetail
              email={data.selectedEmail}
              thread={data.thread}
              onBack={handleBack}
              onReply={(email, prefill) => handleReply(email, prefill)}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              onStar={() => data.toggleStar(data.selectedEmail!.id)}
              onArchive={() => { data.archiveEmail(data.selectedEmail!.id); handleBack(); }}
              onDelete={() => { data.deleteEmail(data.selectedEmail!.id); handleBack(); }}
              onGetReplySuggestions={() => data.getReplySuggestions(data.selectedEmail!.id)}
              onAIProcess={() => data.triggerAIProcess(data.selectedEmail!.id)}
              onGetThreadSummary={() => data.getThreadSummary(data.selectedEmail!.id)}
              onInlineReply={async (body) => {
                if (data.selectedEmail) {
                  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  const html = escaped.split('\n').filter(Boolean).map(l => `<p>${l}</p>`).join('');
                  await data.replyToEmail(data.selectedEmail.id, { body_text: body, body_html: html });
                  data.fetchThread(data.selectedEmail.id);
                  data.fetchStats();
                }
              }}
            />
          ) : (
            <div className="ep-empty-detail">
              <div className="ep-empty-detail-icon">✉</div>
              <p className="ep-empty-detail-text">Waehle eine E-Mail aus</p>
              <p className="ep-empty-detail-hint">
                <kbd>j</kbd><kbd>k</kbd> navigieren &middot; <kbd>c</kbd> verfassen &middot; <kbd>/</kbd> suchen
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Undo Toast ─────────────────────────────────────── */}
      {data.undoAction && (
        <div className="ep-undo-toast">
          <span>{data.undoAction.label}</span>
          <button className="ep-undo-btn" onClick={data.executeUndo}>Rueckgaengig</button>
          <button className="ep-undo-close" onClick={data.dismissUndo}>&times;</button>
        </div>
      )}

      {/* ── Compose Modal ──────────────────────────────────── */}
      {compose && (
        <EmailCompose
          accounts={data.accounts}
          mode={compose.mode}
          replyTo={compose.replyTo}
          prefillBody={compose.prefillBody}
          prefillSubject={compose.prefillSubject}
          prefillTo={compose.prefillTo}
          prefillCc={compose.prefillCc}
          prefillAccountId={compose.prefillAccountId}
          draftId={compose.draftId}
          onSend={handleComposeSend}
          onCancel={() => setCompose(null)}
          onSaveDraft={data.saveDraft}
          onUpdateDraft={data.updateDraft}
          onAICompose={data.aiCompose}
          onAIImprove={data.aiImprove}
        />
      )}

      {/* ── IMAP Setup ─────────────────────────────────────── */}
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
            data.refetchCurrent();
            data.fetchStats();
            return result;
          }}
          onClose={() => setShowImapSetup(false)}
        />
      )}
    </div>
  );
}
