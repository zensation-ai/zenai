import { memo, type ReactNode } from 'react';
import './PanelEmptyState.css';

interface PanelEmptyStateAction {
  label: string;
  onClick: () => void;
}

interface PanelEmptyStateProps {
  variant: 'welcome' | 'no-results' | 'error';
  illustration?: ReactNode;
  title: string;
  description: string;
  action?: PanelEmptyStateAction;
  secondaryAction?: PanelEmptyStateAction;
}

export const PanelEmptyState = memo(function PanelEmptyState({
  illustration,
  title,
  description,
  action,
  secondaryAction,
}: PanelEmptyStateProps) {
  return (
    <div className="panel-empty-state">
      {illustration && (
        <div className="panel-empty-state__illustration">{illustration}</div>
      )}
      <h3 className="panel-empty-state__title">{title}</h3>
      <p className="panel-empty-state__description">{description}</p>
      {(action || secondaryAction) && (
        <div className="panel-empty-state__actions">
          {action && (
            <button
              className="panel-empty-state__primary-action"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              className="panel-empty-state__secondary-action"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
