/**
 * ViewToggle - Segmented control for Meine KI view modes
 * Persona | Wissen | Prozeduren | Stimme
 */
import React from 'react';
import type { MeineKIViewMode } from './types';
import { MEINE_KI_VIEWS } from './types';
import './ViewToggle.css';

interface ViewToggleProps {
  value: MeineKIViewMode;
  onChange: (mode: MeineKIViewMode) => void;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange }) => (
  <div className="meine-ki-view-toggle" role="tablist" aria-label="Ansicht wechseln">
    {MEINE_KI_VIEWS.map(view => (
      <button
        key={view.id}
        className={`meine-ki-view-toggle__btn ${value === view.id ? 'meine-ki-view-toggle__btn--active' : ''}`}
        onClick={() => onChange(view.id)}
        role="tab"
        aria-selected={value === view.id}
        aria-label={view.label}
        type="button"
      >
        <span className="meine-ki-view-toggle__label">{view.label}</span>
      </button>
    ))}
  </div>
);
