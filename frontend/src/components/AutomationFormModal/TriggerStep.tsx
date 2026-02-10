import {
  TriggerType,
  FormData,
  TRIGGER_OPTIONS,
  EVENT_OPTIONS,
  SCHEDULE_PRESETS,
} from './types';

interface TriggerStepProps {
  formData: FormData;
  errors: Record<string, string>;
  updateTriggerType: (type: TriggerType) => void;
  updateTriggerConfig: (key: string, value: unknown) => void;
}

function TriggerConfig({ formData, errors, updateTriggerConfig }: Omit<TriggerStepProps, 'updateTriggerType'>) {
  switch (formData.trigger.type) {
    case 'manual':
      return <p className="afm-info-text">Diese Automation wird manuell per Knopfdruck ausgelöst.</p>;

    case 'pattern':
      return (
        <div className="afm-field">
          <label htmlFor="afm-pattern">Schlüsselwörter</label>
          <input
            id="afm-pattern"
            type="text"
            className={`liquid-glass-input ${errors.triggerConfig ? 'has-error' : ''}`}
            value={(formData.trigger.config.pattern as string) || ''}
            onChange={e => updateTriggerConfig('pattern', e.target.value)}
            placeholder="z.B. dringend|asap|sofort (getrennt mit |)"
          />
          <span className="afm-hint">Mehrere Wörter mit | trennen (Regex-Syntax)</span>
          {errors.triggerConfig && <span className="afm-error">{errors.triggerConfig}</span>}
        </div>
      );

    case 'event':
      return (
        <div className="afm-field">
          <label htmlFor="afm-event">Event</label>
          <select
            id="afm-event"
            className={`liquid-glass-input ${errors.triggerConfig ? 'has-error' : ''}`}
            value={(formData.trigger.config.eventName as string) || ''}
            onChange={e => updateTriggerConfig('eventName', e.target.value)}
          >
            <option value="">Event wählen...</option>
            {EVENT_OPTIONS.map(ev => (
              <option key={ev.value} value={ev.value}>{ev.label}</option>
            ))}
          </select>
          {errors.triggerConfig && <span className="afm-error">{errors.triggerConfig}</span>}
        </div>
      );

    case 'schedule':
      return (
        <div className="afm-field">
          <label>Zeitplan</label>
          <div className="afm-preset-grid">
            {SCHEDULE_PRESETS.map(preset => (
              <button
                key={preset.cron}
                type="button"
                className={`afm-preset-btn liquid-glass ${formData.trigger.config.cron === preset.cron ? 'selected' : ''}`}
                onClick={() => updateTriggerConfig('cron', preset.cron)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="afm-field" style={{ marginTop: '12px' }}>
            <label htmlFor="afm-cron">Oder Cron-Ausdruck eingeben</label>
            <input
              id="afm-cron"
              type="text"
              className={`liquid-glass-input ${errors.triggerConfig ? 'has-error' : ''}`}
              value={(formData.trigger.config.cron as string) || ''}
              onChange={e => updateTriggerConfig('cron', e.target.value)}
              placeholder="z.B. 0 9 * * 1 (Montags 9:00)"
            />
          </div>
          {errors.triggerConfig && <span className="afm-error">{errors.triggerConfig}</span>}
        </div>
      );

    case 'webhook':
      return (
        <div className="afm-field">
          <label>Webhook Events</label>
          <div className="afm-checkbox-group">
            {EVENT_OPTIONS.map(ev => {
              const events = (formData.trigger.config.events as string[]) || [];
              const checked = events.includes(ev.value);
              return (
                <label key={ev.value} className="afm-checkbox-label">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? events.filter(e => e !== ev.value)
                        : [...events, ev.value];
                      updateTriggerConfig('events', next);
                    }}
                  />
                  {ev.label}
                </label>
              );
            })}
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function TriggerStep({ formData, errors, updateTriggerType, updateTriggerConfig }: TriggerStepProps) {
  return (
    <div className="afm-form-section">
      <div className="afm-field">
        <label>Auslöser-Typ</label>
        {errors.triggerType && <span className="afm-error">{errors.triggerType}</span>}
        <div className="afm-trigger-grid">
          {TRIGGER_OPTIONS.map(opt => (
            <button
              key={opt.type}
              type="button"
              className={`afm-trigger-card liquid-glass neuro-hover-lift ${formData.trigger.type === opt.type ? 'selected' : ''}`}
              onClick={() => updateTriggerType(opt.type)}
            >
              <span className="afm-trigger-icon">{opt.icon}</span>
              <strong>{opt.label}</strong>
              <span className="afm-trigger-desc">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      {formData.trigger.type && (
        <div className="afm-trigger-config">
          <TriggerConfig formData={formData} errors={errors} updateTriggerConfig={updateTriggerConfig} />
        </div>
      )}
    </div>
  );
}
