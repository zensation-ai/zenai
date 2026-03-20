/**
 * ViewToggle - Segmented control for Wissen view modes
 * Dokumente | Canvas | Medien | Verbindungen | Lernen
 */
import React from 'react';
import type { WissenViewMode } from './types';
import { WISSEN_VIEWS } from './types';
import './ViewToggle.css';

interface ViewToggleProps {
  value: WissenViewMode;
  onChange: (mode: WissenViewMode) => void;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange }) => (
  <div className="wissen-view-toggle" role="tablist" aria-label="Ansicht wechseln">
    {WISSEN_VIEWS.map(view => (
      <button
        key={view.id}
        className={`wissen-view-toggle__btn ${value === view.id ? 'wissen-view-toggle__btn--active' : ''}`}
        onClick={() => onChange(view.id)}
        role="tab"
        aria-selected={value === view.id}
        aria-label={view.label}
        type="button"
      >
        <span className="wissen-view-toggle__label">{view.label}</span>
      </button>
    ))}
  </div>
);
