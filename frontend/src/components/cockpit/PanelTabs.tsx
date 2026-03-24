import { memo } from 'react';
import './PanelTabs.css';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface PanelTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const PanelTabs = memo(function PanelTabs({ tabs, activeTab, onTabChange }: PanelTabsProps) {
  return (
    <div className="panel-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className="panel-tab"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon && <span className="panel-tab__icon">{tab.icon}</span>}
          {tab.label}
          {tab.badge != null && tab.badge > 0 && (
            <span className="panel-tab__badge">{tab.badge > 99 ? '99+' : tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
});
