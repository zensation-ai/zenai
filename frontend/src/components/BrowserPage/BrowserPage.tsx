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
      const updated = prev.filter(t => t.id !== tabId);
      if (updated.length === 0) {
        return [{ id: String(Date.now()), url: '', title: 'Neuer Tab', loading: false }];
      }
      return updated;
    });

    if (activeTabId === tabId) {
      setBrowserTabs(prev => {
        const idx = prev.findIndex(t => t.id === tabId);
        const newActive = prev[idx - 1] || prev[idx + 1] || prev[0];
        if (newActive) {
          setActiveTabId(newActive.id);
          setCurrentUrl(newActive.url);
          setUrlInput(newActive.url);
        }
        return prev;
      });
    }
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
              <div
                key={tab.id}
                className={`browser-tab ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => switchBrowserTab(tab.id)}
              >
                <span className="browser-tab-title">
                  {tab.loading ? '...' : (tab.title || 'Neuer Tab')}
                </span>
                {browserTabs.length > 1 && (
                  <button
                    type="button"
                    className="browser-tab-close"
                    onClick={(e) => { e.stopPropagation(); closeBrowserTab(tab.id); }}
                    aria-label="Tab schliessen"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="browser-tab-add"
              onClick={addBrowserTab}
              aria-label="Neuer Tab"
            >
              +
            </button>
          </div>

          {/* Navigation Bar */}
          <div className="browser-nav-bar">
            <button
              type="button"
              className="browser-nav-btn"
              onClick={() => { /* In Electron: webview.goBack() */ }}
              title="Zurueck"
              disabled
            >
              ←
            </button>
            <button
              type="button"
              className="browser-nav-btn"
              onClick={() => { /* In Electron: webview.goForward() */ }}
              title="Vorwaerts"
              disabled
            >
              →
            </button>
            <button
              type="button"
              className="browser-nav-btn"
              onClick={() => iframeRef.current?.contentWindow?.location.reload()}
              title="Neu laden"
            >
              {isLoading ? '◻' : '↻'}
            </button>

            <form className="browser-url-form" onSubmit={handleUrlSubmit}>
              <input
                ref={urlInputRef}
                type="text"
                className="browser-url-input"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="URL eingeben oder suchen..."
                aria-label="URL-Eingabe"
              />
            </form>

            <button
              type="button"
              className="browser-nav-btn browser-bookmark-btn"
              onClick={bookmarkCurrentPage}
              title="Lesezeichen hinzufuegen"
              disabled={!currentUrl}
            >
              ⭐
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
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            ) : (
              <div className="browser-empty-state">
                <div className="browser-empty-icon">🌐</div>
                <h2>Willkommen im My Brain Browser</h2>
                <p>Gib eine URL ein oder suche im Web</p>
                <div className="browser-quick-links">
                  <button type="button" onClick={() => navigateToUrl('https://duckduckgo.com')}>DuckDuckGo</button>
                  <button type="button" onClick={() => navigateToUrl('https://wikipedia.org')}>Wikipedia</button>
                  <button type="button" onClick={() => navigateToUrl('https://news.ycombinator.com')}>Hacker News</button>
                </div>
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
