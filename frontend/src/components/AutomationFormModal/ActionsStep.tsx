import { FormAction, ActionType, FormData, ACTION_OPTIONS } from './types';

interface ActionsStepProps {
  formData: FormData;
  errors: Record<string, string>;
  updateAction: (index: number, updates: Partial<FormAction>) => void;
  updateActionConfig: (index: number, key: string, value: unknown) => void;
  addAction: () => void;
  removeAction: (index: number) => void;
}

function ActionConfig({
  action,
  index,
  errors,
  updateActionConfig,
}: {
  action: FormAction;
  index: number;
  errors: Record<string, string>;
  updateActionConfig: (index: number, key: string, value: unknown) => void;
}) {
  switch (action.type) {
    case 'notification':
      return (
        <>
          <div className="afm-field">
            <label htmlFor={`afm-action-${index}-title`}>Titel</label>
            <input
              id={`afm-action-${index}-title`}
              type="text"
              className="liquid-glass-input"
              value={(action.config.title as string) || ''}
              onChange={e => updateActionConfig(index, 'title', e.target.value)}
              placeholder="Benachrichtigungstitel"
            />
          </div>
          <div className="afm-field">
            <label htmlFor={`afm-action-${index}-message`}>Nachricht *</label>
            <input
              id={`afm-action-${index}-message`}
              type="text"
              className={`liquid-glass-input ${errors[`action_${index}_config`] ? 'has-error' : ''}`}
              value={(action.config.message as string) || ''}
              onChange={e => updateActionConfig(index, 'message', e.target.value)}
              placeholder="z.B. Neue Idee: {{title}}"
            />
            <span className="afm-hint">{'Verwende {{title}}, {{category}} etc. als Platzhalter'}</span>
          </div>
        </>
      );

    case 'tag_idea':
      return (
        <div className="afm-field">
          <label htmlFor={`afm-action-${index}-tags`}>Tags *</label>
          <input
            id={`afm-action-${index}-tags`}
            type="text"
            className={`liquid-glass-input ${errors[`action_${index}_config`] ? 'has-error' : ''}`}
            value={((action.config.tags as string[]) || []).join(', ')}
            onChange={e => updateActionConfig(index, 'tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
            placeholder="z.B. dringend, review"
          />
          <span className="afm-hint">Kommagetrennt eingeben</span>
        </div>
      );

    case 'set_priority':
      return (
        <div className="afm-field">
          <label htmlFor={`afm-action-${index}-priority`}>Priorität *</label>
          <select
            id={`afm-action-${index}-priority`}
            className="liquid-glass-input"
            value={(action.config.priority as string) || ''}
            onChange={e => updateActionConfig(index, 'priority', e.target.value)}
          >
            <option value="">Priorität wählen...</option>
            <option value="low">Niedrig</option>
            <option value="medium">Mittel</option>
            <option value="high">Hoch</option>
          </select>
        </div>
      );

    case 'create_task':
      return (
        <>
          <div className="afm-field">
            <label htmlFor={`afm-action-${index}-task-title`}>Aufgaben-Titel *</label>
            <input
              id={`afm-action-${index}-task-title`}
              type="text"
              className={`liquid-glass-input ${errors[`action_${index}_config`] ? 'has-error' : ''}`}
              value={(action.config.title as string) || ''}
              onChange={e => updateActionConfig(index, 'title', e.target.value)}
              placeholder="z.B. Wochenplanung"
            />
          </div>
          <div className="afm-field">
            <label htmlFor={`afm-action-${index}-task-desc`}>Beschreibung</label>
            <textarea
              id={`afm-action-${index}-task-desc`}
              className="liquid-glass-input"
              value={(action.config.description as string) || ''}
              onChange={e => updateActionConfig(index, 'description', e.target.value)}
              placeholder="Optionale Beschreibung"
              rows={2}
            />
          </div>
        </>
      );

    case 'webhook_call':
      return (
        <div className="afm-field">
          <label htmlFor={`afm-action-${index}-url`}>Webhook URL *</label>
          <input
            id={`afm-action-${index}-url`}
            type="url"
            className={`liquid-glass-input ${errors[`action_${index}_config`] ? 'has-error' : ''}`}
            value={(action.config.url as string) || ''}
            onChange={e => updateActionConfig(index, 'url', e.target.value)}
            placeholder="https://..."
          />
        </div>
      );

    case 'slack_message':
      return (
        <>
          <div className="afm-field">
            <label htmlFor={`afm-action-${index}-channel`}>Channel</label>
            <input
              id={`afm-action-${index}-channel`}
              type="text"
              className="liquid-glass-input"
              value={(action.config.channel as string) || ''}
              onChange={e => updateActionConfig(index, 'channel', e.target.value)}
              placeholder="z.B. #general"
            />
          </div>
          <div className="afm-field">
            <label htmlFor={`afm-action-${index}-slack-msg`}>Nachricht *</label>
            <input
              id={`afm-action-${index}-slack-msg`}
              type="text"
              className={`liquid-glass-input ${errors[`action_${index}_config`] ? 'has-error' : ''}`}
              value={(action.config.message as string) || ''}
              onChange={e => updateActionConfig(index, 'message', e.target.value)}
              placeholder="z.B. Neue Idee: {{title}}"
            />
          </div>
        </>
      );

    default:
      return null;
  }
}

export function ActionsStep({
  formData,
  errors,
  updateAction,
  updateActionConfig,
  addAction,
  removeAction,
}: ActionsStepProps) {
  return (
    <div className="afm-form-section">
      {errors.actions && <span className="afm-error">{errors.actions}</span>}

      {formData.actions.map((action, index) => (
        <div key={index} className="afm-action-row liquid-glass">
          <div className="afm-action-header">
            <span className="afm-action-number">Aktion {index + 1}</span>
            {formData.actions.length > 1 && (
              <button
                type="button"
                className="afm-remove-btn"
                onClick={() => removeAction(index)}
                aria-label={`Aktion ${index + 1} entfernen`}
              >
                Entfernen
              </button>
            )}
          </div>

          <div className="afm-field">
            <label htmlFor={`afm-action-${index}-type`}>Typ</label>
            {errors[`action_${index}_type`] && <span className="afm-error">{errors[`action_${index}_type`]}</span>}
            <select
              id={`afm-action-${index}-type`}
              className={`liquid-glass-input ${errors[`action_${index}_type`] ? 'has-error' : ''}`}
              value={action.type}
              onChange={e => updateAction(index, { type: e.target.value as ActionType, config: {} })}
            >
              <option value="">Aktionstyp wählen...</option>
              {ACTION_OPTIONS.map(opt => (
                <option key={opt.type} value={opt.type}>{opt.icon} {opt.label}</option>
              ))}
            </select>
          </div>

          {action.type && <ActionConfig action={action} index={index} errors={errors} updateActionConfig={updateActionConfig} />}
          {errors[`action_${index}_config`] && <span className="afm-error">{errors[`action_${index}_config`]}</span>}
        </div>
      ))}

      {formData.actions.length < 5 && (
        <button
          type="button"
          className="afm-add-action-btn neuro-hover-lift"
          onClick={addAction}
        >
          + Aktion hinzufügen
        </button>
      )}
    </div>
  );
}
