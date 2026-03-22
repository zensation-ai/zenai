import type { PanelType } from '../../contexts/PanelContext';
import './ChatEnhancements.css';

interface PanelTriggerLinkProps {
  label: string;
  panel: PanelType;
  filter?: string;
  onOpenPanel: (panel: PanelType, filter?: string) => void;
}

export function PanelTriggerLink({ label, panel, filter, onOpenPanel }: PanelTriggerLinkProps) {
  return (
    <button
      className="panel-trigger-link"
      onClick={() => onOpenPanel(panel, filter)}
      aria-label={`${label} anzeigen`}
    >
      {label} →
    </button>
  );
}
