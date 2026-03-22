import './ChatEnhancements.css';

interface ActionButtonDef {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  action: () => void;
}

interface ActionButtonsProps {
  actions: ActionButtonDef[];
}

export function ActionButtons({ actions }: ActionButtonsProps) {
  return (
    <div className="action-buttons">
      {actions.map(action => (
        <button
          key={action.id}
          className={`action-buttons__btn action-buttons__btn--${action.variant || 'secondary'}`}
          onClick={action.action}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
