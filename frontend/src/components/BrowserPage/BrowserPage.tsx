/**
 * BrowserPage - Eingebetteter Browser
 *
 * 3 Tabs:
 * - Browse: URL-Leiste + iframe/webview fuer Webseiten
 * - History: Browsing-Verlauf mit Suche + Filtern
 * - Bookmarks: Lesezeichen-Verwaltung mit Ordnern
 *
 * Uses HubPage for unified layout.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { HubPage, type TabDef } from '../HubPage';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { useBrowserData } from './useBrowserData';
import { BrowserHistory } from './BrowserHistory';
import { BrowserBookmarks } from './BrowserBookmarks';
import type { BrowserTab, BrowserTabState } from './types';
import './BrowserPage.css';

interface BrowserPageProps {
  context: AIContext;
  initialTab?: BrowserTab;
  onBack: () => void;
}

const TABS: readonly TabDef<BrowserTab>[] = [
  { id: 'browse', label: 'Browser', icon: '🌐' },
  { id: 'history', label: 'Verlauf', icon: '🕐' },
  { id: 'bookmarks', label: 'Lesezeichen', icon: '⭐' },
];

const VALID_TABS = TABS.map(t => t.id);

export function BrowserPage({ context, initialTab = 'browse', onBack }: BrowserPageProps) {
  const { activeTab, handleTabChange } = useTabNavigation<BrowserTab>({
    initialTab,
    validTabs: VALID_TABS,
    defaultTab: 'browse',
    basePath: '/browser',
  });

  const [urlInput, setUrlInput] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [browserTabs, setBrowserTabs] = useState<BrowserTabState[]>([
    { id: '1', url: '', title: 'Neuer Tab', loading: false },
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const data = useBrowserData(context);

  // Load initial data based on tab
  useEffect(() => {
    if (activeTab === 'history') {
      data.fetchHistory();
      data.fetchDomainStats();
    } else if (activeTab === 'bookmarks') {
      data.fetchBookmarks();
      data.fetchFolders();
    }
  // Intentionally omit data.fetch* — stable methods, only re-fetch on tab/context change
  }, [activeTab, context]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to URL
  const navigateToUrl = useCallback((url: string) => {
    if (!url.trim()) return;

    let fullUrl = url.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      if (fullUrl.includes('.') && !fullUrl.includes(' ')) {
        fullUrl = 'https://' + fullUrl;
      } else {
        fullUrl = `https://duckduckgo.com/?q=${encodeURIComponent(fullUrl)}`;
      }
    }

    setCurrentUrl(fullUrl);
    setUrlInput(fullUrl);
    setIsLoading(true);

    setBrowserTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, url: fullUrl, loading: true }
        : tab
    ));
  }, [activeTabId]);

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    setBrowserTabs(prev => prev.map(tab =>
      tab.id === activeTabId ? { ...tab, loading: false } : tab
    ));

    try {
      const iframe = iframeRef.current;
      if (iframe?.contentDocument?.title) {
        const title = iframe.contentDocument.title;
        setPageTitle(title);
        setBrowserTabs(prev => prev.map(tab =>
          tab.id === activeTabId ? { ...tab, title } : tab
        ));
      }
    } catch {
      // Cross-origin - can't access title
    }
  }, [activeTabId]);

  const handleUrlSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    navigateToUrl(urlInput);
  }, [urlInput, navigateToUrl]);

  const addBrowserTab = useCallback(() => {
    const id = String(Date.now());
    setBrowserTabs(prev => [...prev, { id, url: '', title: 'Neuer Tab', loading: false }]);
    setActiveTabId(id);
    setCurrentUrl('');
    setUrlInput('');
    setPageTitle('');
    urlInputRef.current?.focus();
  }, []);

  const closeBrowserTab = useCallback((tabId: string) => {
    setBrowserTabs(prev => {
      if (prev.length <= 1) {
        const newId = String(Date.now());
        setActiveTabId(newId);
        setCurrentUrl('');
        setUrlInput('');
        return [{ id: newId, url: '', title: 'Neuer Tab', loading: false }];
      }

      const idx = prev.findIndex(t => t.id === tabId);
      const updated = prev.filter(t => t.id !== tabId);

      if (activeTabId === tabId) {
        const newActive = updated[Math.min(idx, updated.length - 1)] || updated[0];
        setActiveTabId(newActive.id);
        setCurrentUrl(newActive.url);
        setUrlInput(newActive.url);
      }

      return updated;
    });
  }, [activeTabId]);

  const switchBrowserTab = useCallback((tabId: string) => {
    const tab = browserTabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      setCurrentUrl(tab.url);
      setUrlInput(tab.url);
      setPageTitle(tab.title);
    }
  }, [browserTabs]);

  const bookmarkCurrentPage = useCallback(async () => {
    if (!currentUrl) return;
    const domain = (() => {
      try { return new URL(currentUrl).hostname; } catch { return currentUrl; }
    })();
    await data.addBookmark({
      url: currentUrl,
      title: pageTitle || domain,
    });
  }, [currentUrl, pageTitle, data]);

  const handleOpenUrl = useCallback((url: string) => {
    handleTabChange('browse');
    navigateToUrl(url);
  }, [handleTabChange, navigateToUrl]);

  return (
    <HubPage
      title="Browser"
      icon="🌐"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      ariaLabel="Browser Navigation"
    >
      {activeTab === 'browse' && (
        <div className="browser-view">
          {/* Browser Tabs */}
          <div className="browser-tab-bar">
            {browserTabs.map(tab => (
              <button
                type="button"
                key={tab.id}
                className={`browser-tab ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => switchBrowserTab(tab.id)}
                aria-selected={tab.id === activeTabId}
              >
                <span className="browser-tab-favicon">
                  {tab.loading ? (
                    <span className="browser-tab-spinner" />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/><ellipse cx="8" cy="8" rx="6.5" ry="3" stroke="currentColor" strokeWidth="1"/><line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1"/></svg>
                  )}
                </span>
                <span className="browser-tab-title">
                  {tab.title || 'Neuer Tab'}
                </span>
                {browserTabs.length > 1 && (
                  <button
                    type="button"
                    className="browser-tab-close"
                    onClick={(e) => { e.stopPropagation(); closeBrowserTab(tab.id); }}
                    aria-label="Tab schliessen"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                )}
              </button>
            ))}
            <button
              type="button"
              className="browser-tab-add"
              onClick={addBrowserTab}
              aria-label="Neuer Tab"
              title="Neuer Tab"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>

          {/* Navigation Bar */}
          <div className="browser-nav-bar">
            <div className="browser-nav-controls">
              <button
                type="button"
                className={`browser-nav-btn ${isLoading ? 'loading' : ''}`}
                onClick={() => iframeRef.current?.contentWindow?.location.reload()}
                title="Neu laden"
                aria-label="Neu laden"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.1-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M13.5 3v2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>

            <form className="browser-url-form" onSubmit={handleUrlSubmit}>
              <div className="browser-url-wrapper">
                <span className="browser-url-icon">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </span>
                <input
                  ref={urlInputRef}
                  type="text"
                  className="browser-url-input"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="URL oder Suchbegriff eingeben..."
                  aria-label="URL-Eingabe"
                />
              </div>
              {isLoading && <div className="browser-loading-bar" />}
            </form>

            <button
              type="button"
              className="browser-nav-btn browser-bookmark-btn"
              onClick={bookmarkCurrentPage}
              title="Lesezeichen hinzufuegen"
              aria-label="Lesezeichen hinzufuegen"
              disabled={!currentUrl}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h8a1 1 0 0 1 1 1v11.5l-5-3-5 3V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            </button>
          </div>

          {/* Web Content */}
          <div className="browser-content-area">
            {currentUrl ? (
              <iframe
                ref={iframeRef}
                src={currentUrl}
                className="browser-iframe"
                title="Browser"
                onLoad={handleIframeLoad}
                sandbox="allow-scripts allow-forms allow-popups"
              />
            ) : (
              <div className="browser-empty-state">
                <div className="browser-empty-hero">
                  <div className="browser-empty-globe">
                    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                      <circle cx="28" cy="28" r="22" stroke="url(#globe-gradient)" strokeWidth="2"/>
                      <ellipse cx="28" cy="28" rx="22" ry="9" stroke="url(#globe-gradient)" strokeWidth="1.5"/>
                      <ellipse cx="28" cy="28" rx="9" ry="22" stroke="url(#globe-gradient)" strokeWidth="1.5"/>
                      <line x1="6" y1="28" x2="50" y2="28" stroke="url(#globe-gradient)" strokeWidth="1"/>
                      <defs>
                        <linearGradient id="globe-gradient" x1="0" y1="0" x2="56" y2="56">
                          <stop stopColor="var(--accent-color, #ff6b2b)"/>
                          <stop offset="1" stopColor="#ff9a5c"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <h2>Wohin soll es gehen?</h2>
                  <p>URL eingeben oder im Web suchen</p>
                </div>
                <div className="browser-quick-section">
                  <span className="browser-quick-label">Schnellzugriff</span>
                  <div className="browser-quick-links">
                    <button type="button" className="browser-quick-link" onClick={() => navigateToUrl('https://duckduckgo.com')}>
                      <span className="browser-quick-link-icon">🔍</span>
                      <span className="browser-quick-link-text">Websuche</span>
                    </button>
                    <button type="button" className="browser-quick-link" onClick={() => navigateToUrl('https://wikipedia.org')}>
                      <span className="browser-quick-link-icon">📖</span>
                      <span className="browser-quick-link-text">Wikipedia</span>
                    </button>
                    <button type="button" className="browser-quick-link" onClick={() => navigateToUrl('https://translate.google.com')}>
                      <span className="browser-quick-link-icon">🌍</span>
                      <span className="browser-quick-link-text">Uebersetzer</span>
                    </button>
                    <button type="button" className="browser-quick-link" onClick={() => navigateToUrl('https://news.ycombinator.com')}>
                      <span className="browser-quick-link-icon">📰</span>
                      <span className="browser-quick-link-text">Tech News</span>
                    </button>
                  </div>
                </div>
                <p className="browser-empty-hint">
                  Tipp: Einfach Text eingeben fuer eine Websuche, oder eine Domain wie example.com
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <BrowserHistory
          entries={data.history}
          total={data.historyTotal}
          domainStats={data.domainStats}
          loading={data.loading}
          onSearch={(search) => data.fetchHistory({ search })}
          onFilterDomain={(domain) => data.fetchHistory({ domain })}
          onDelete={data.deleteHistoryEntry}
          onClear={data.clearAllHistory}
          onOpen={handleOpenUrl}
        />
      )}

      {activeTab === 'bookmarks' && (
        <BrowserBookmarks
          bookmarks={data.bookmarks}
          total={data.bookmarksTotal}
          folders={data.folders}
          loading={data.loading}
          onSearch={(search) => data.fetchBookmarks({ search })}
          onFilterFolder={(folder) => data.fetchBookmarks({ folder })}
          onDelete={data.removeBookmark}
          onOpen={handleOpenUrl}
          onAdd={data.addBookmark}
        />
      )}
    </HubPage>
  );
}
