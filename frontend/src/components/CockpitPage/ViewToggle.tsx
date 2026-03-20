/**
 * ViewToggle - Segmented control for Cockpit view modes
 * Übersicht | Business | Finanzen | Trends
 */
import React from 'react';
import type { CockpitViewMode } from './types';
import { COCKPIT_VIEWS } from './types';
import './ViewToggle.css';

interface ViewToggleProps {
  value: CockpitViewMode;
  onChange: (mode: CockpitViewMode) => void;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange }) => (
  <div className="cockpit-view-toggle" role="tablist" aria-label="Ansicht wechseln">
    {COCKPIT_VIEWS.map(view => (
      <button
        key={view.id}
        className={`cockpit-view-toggle__btn ${value === view.id ? 'cockpit-view-toggle__btn--active' : ''}`}
        onClick={() => onChange(view.id)}
        role="tab"
        aria-selected={value === view.id}
        aria-label={view.label}
        type="button"
      >
        <span className="cockpit-view-toggle__label">{view.label}</span>
      </button>
    ))}
  </div>
);
