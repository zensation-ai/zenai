import { Plus, X } from 'lucide-react';
import './ChatSessionTabs.css';

interface SessionTab {
  sessionId: string;
  title: string;
}

interface ChatSessionTabsProps {
  tabs: SessionTab[];
  activeSessionId: string;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onNewTab: () => void;
}

export function ChatSessionTabs({
  tabs, activeSessionId, onSelectTab, onCloseTab, onNewTab,
}: ChatSessionTabsProps) {
  return (
    <div className="session-tabs" role="tablist">
      {tabs.map(tab => (
        <div
          key={tab.sessionId}
          role="tab"
          tabIndex={0}
          aria-selected={tab.sessionId === activeSessionId}
          className={`session-tabs__tab ${tab.sessionId === activeSessionId ? 'session-tabs__tab--active' : ''}`}
          onClick={() => onSelectTab(tab.sessionId)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectTab(tab.sessionId); } }}
        >
          <span className="session-tabs__title">{tab.title}</span>
          <button
            type="button"
            className="session-tabs__close"
            aria-label="Tab schliessen"
            onClick={(e) => { e.stopPropagation(); onCloseTab(tab.sessionId); }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        className="session-tabs__new"
        onClick={onNewTab}
        aria-label="Neuer Chat"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
