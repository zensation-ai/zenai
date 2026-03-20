/**
 * ViewToggle - Segmented control for inbox view modes
 * Liste | Kacheln | Konversation
 */
import React from 'react';
import type { InboxViewMode } from './types';
import './ViewToggle.css';

interface ViewToggleProps {
  value: InboxViewMode;
  onChange: (mode: InboxViewMode) => void;
}

const VIEW_OPTIONS: { mode: InboxViewMode; label: string; icon: string }[] = [
  { mode: 'list', label: 'Liste', icon: '☰' },
  { mode: 'grid', label: 'Kacheln', icon: '▦' },
  { mode: 'conversation', label: 'Konversation', icon: '💬' },
];

export const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange }) => (
  <div className="inbox-view-toggle" role="radiogroup" aria-label="Ansicht wechseln">
    {VIEW_OPTIONS.map(opt => (
      <button
        key={opt.mode}
        className={`inbox-view-toggle__btn ${value === opt.mode ? 'inbox-view-toggle__btn--active' : ''}`}
        onClick={() => onChange(opt.mode)}
        role="radio"
        aria-checked={value === opt.mode}
        aria-label={opt.label}
        type="button"
      >
        <span className="inbox-view-toggle__icon" aria-hidden="true">{opt.icon}</span>
        <span className="inbox-view-toggle__label">{opt.label}</span>
      </button>
    ))}
  </div>
);
