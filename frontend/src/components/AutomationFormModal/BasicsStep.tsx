import { RefObject } from 'react';
import { FormData } from './types';

interface BasicsStepProps {
  formData: FormData;
  errors: Record<string, string>;
  firstInputRef: RefObject<HTMLInputElement>;
  updateField: (field: keyof FormData, value: unknown) => void;
}

export function BasicsStep({ formData, errors, firstInputRef, updateField }: BasicsStepProps) {
  return (
    <div className="afm-form-section">
      <div className="afm-field">
        <label htmlFor="afm-name">Name *</label>
        <input
          ref={firstInputRef}
          id="afm-name"
          type="text"
          className={`liquid-glass-input ${errors.name ? 'has-error' : ''}`}
          value={formData.name}
          onChange={e => updateField('name', e.target.value)}
          placeholder="z.B. Dringende Ideen taggen"
          maxLength={200}
        />
        {errors.name && <span className="afm-error">{errors.name}</span>}
      </div>

      <div className="afm-field">
        <label htmlFor="afm-description">Beschreibung</label>
        <textarea
          id="afm-description"
          className="liquid-glass-input"
          value={formData.description}
          onChange={e => updateField('description', e.target.value)}
          placeholder="Was macht diese Automation?"
          rows={3}
        />
      </div>

      <div className="afm-field afm-toggle-field">
        <label htmlFor="afm-active">Sofort aktivieren</label>
        <button
          id="afm-active"
          type="button"
          role="switch"
          aria-checked={formData.is_active}
          className={`afm-toggle ${formData.is_active ? 'on' : ''}`}
          onClick={() => updateField('is_active', !formData.is_active)}
        >
          <span className="afm-toggle-thumb" />
        </button>
      </div>
    </div>
  );
}
