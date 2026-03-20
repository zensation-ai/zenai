/**
 * SystemNav - Grouped sidebar navigation for System settings
 * 5 sections with 2 tabs each
 */
import React from 'react';
import type { SystemTab } from './types';
import { SYSTEM_SECTIONS } from './types';
import './SystemNav.css';

interface SystemNavProps {
  value: SystemTab;
  onChange: (tab: SystemTab) => void;
}

export const SystemNav: React.FC<SystemNavProps> = ({ value, onChange }) => (
  <nav className="system-nav" aria-label="System-Navigation">
    {SYSTEM_SECTIONS.map(section => (
      <div key={section.id} className="system-nav__section">
        <h3 className="system-nav__heading">{section.label}</h3>
        <ul className="system-nav__list" role="list">
          {section.tabs.map(tab => (
            <li key={tab.id}>
              <button
                className={`system-nav__item ${value === tab.id ? 'system-nav__item--active' : ''}`}
                onClick={() => onChange(tab.id)}
                aria-current={value === tab.id ? 'page' : undefined}
                type="button"
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </nav>
);
