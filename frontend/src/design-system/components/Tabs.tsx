import { useRef, useCallback } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';
import './Tabs.css';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const enabledTabs = tabs.filter((t) => !t.disabled);
      const currentIndex = enabledTabs.findIndex((t) => t.id === activeTab);
      if (currentIndex === -1) return;

      let nextIndex: number | null = null;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % enabledTabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = enabledTabs.length - 1;
      }

      if (nextIndex !== null) {
        const next = enabledTabs[nextIndex];
        onChange(next.id);
        // Focus the corresponding button
        const btn = tabListRef.current?.querySelector<HTMLButtonElement>(
          `[data-tab-id="${next.id}"]`
        );
        btn?.focus();
      }
    },
    [tabs, activeTab, onChange]
  );

  const activePanel = tabs.find((t) => t.id === activeTab);

  const classes = ['ds-tabs', className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div
        ref={tabListRef}
        className="ds-tabs__list"
        role="tablist"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-id={tab.id}
            className={`ds-tabs__tab ${tab.id === activeTab ? 'ds-tabs__tab--active' : ''}`}
            aria-selected={tab.id === activeTab}
            aria-controls={`ds-tabpanel-${tab.id}`}
            id={`ds-tab-${tab.id}`}
            tabIndex={tab.id === activeTab ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activePanel && (
        <div
          className="ds-tabs__panel"
          role="tabpanel"
          id={`ds-tabpanel-${activePanel.id}`}
          aria-labelledby={`ds-tab-${activePanel.id}`}
          tabIndex={0}
        >
          {activePanel.content}
        </div>
      )}
    </div>
  );
}
