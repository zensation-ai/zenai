import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AIContext } from './ContextSwitcher';
import { useConfirm } from './ConfirmDialog';
import { showToast } from './Toast';
import axios from 'axios';
import '../neurodesign.css';
import './AutomationFormModal.css';

// ===========================================
// Types
// ===========================================

type TriggerType = 'webhook' | 'schedule' | 'event' | 'manual' | 'pattern';
type ActionType = 'webhook_call' | 'notification' | 'tag_idea' | 'set_priority' | 'create_task' | 'slack_message';
type FormStep = 'templates' | 'basics' | 'trigger' | 'actions';

interface AutomationFormModalProps {
  context: AIContext;
  automation: AutomationData | null; // null = create, non-null = edit
  onClose: () => void;
  onSaved: () => void;
}

interface AutomationData {
  id: string;
  name: string;
  description: string;
  trigger: {
    type: TriggerType;
    config: Record<string, unknown>;
  };
  actions: Array<{
    type: string;
    config: Record<string, unknown>;
    order: number;
  }>;
  is_active: boolean;
  is_system: boolean;
}

interface FormAction {
  type: ActionType | '';
  config: Record<string, unknown>;
}

interface FormData {
  name: string;
  description: string;
  is_active: boolean;
  trigger: {
    type: TriggerType | '';
    config: Record<string, unknown>;
  };
  actions: FormAction[];
}

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  trigger: { type: TriggerType; config: Record<string, unknown> };
  actions: Array<{ type: ActionType; config: Record<string, unknown> }>;
}

// ===========================================
// Constants
// ===========================================

const STEPS: { id: FormStep; label: string }[] = [
  { id: 'basics', label: 'Grundlagen' },
  { id: 'trigger', label: 'Auslöser' },
  { id: 'actions', label: 'Aktionen' },
];

const TRIGGER_OPTIONS: { type: TriggerType; label: string; icon: string; description: string }[] = [
  { type: 'manual', label: 'Manuell', icon: '👆', description: 'Per Knopfdruck auslösen' },
  { type: 'pattern', label: 'Muster', icon: '🎯', description: 'Bei bestimmten Schlüsselwörtern' },
  { type: 'event', label: 'Event', icon: '📡', description: 'Bei System-Ereignissen' },
  { type: 'schedule', label: 'Zeitplan', icon: '⏰', description: 'Nach Zeitplan ausführen' },
  { type: 'webhook', label: 'Webhook', icon: '🔗', description: 'Durch externe Aufrufe' },
];

const ACTION_OPTIONS: { type: ActionType; label: string; icon: string }[] = [
  { type: 'notification', label: 'Benachrichtigung', icon: '🔔' },
  { type: 'tag_idea', label: 'Idee taggen', icon: '🏷️' },
  { type: 'set_priority', label: 'Priorität setzen', icon: '🔥' },
  { type: 'create_task', label: 'Aufgabe erstellen', icon: '📝' },
  { type: 'webhook_call', label: 'Webhook aufrufen', icon: '🔗' },
  { type: 'slack_message', label: 'Slack-Nachricht', icon: '💬' },
];

const EVENT_OPTIONS = [
  { value: 'idea.created', label: 'Idee erstellt' },
  { value: 'idea.updated', label: 'Idee aktualisiert' },
  { value: 'idea.deleted', label: 'Idee gelöscht' },
  { value: 'idea.priority_changed', label: 'Priorität geändert' },
  { value: 'idea.status_changed', label: 'Status geändert' },
];

const SCHEDULE_PRESETS = [
  { label: 'Täglich 9:00', cron: '0 9 * * *' },
  { label: 'Montags 9:00', cron: '0 9 * * 1' },
  { label: 'Freitags 17:00', cron: '0 17 * * 5' },
  { label: 'Sonntags 18:00', cron: '0 18 * * 0' },
  { label: 'Stündlich', cron: '0 * * * *' },
];

const TEMPLATES: AutomationTemplate[] = [
  {
    id: 'auto-tag-urgent',
    name: 'Dringende Ideen taggen',
    description: 'Tagge automatisch Ideen mit Schlüsselwörtern wie "dringend" oder "asap"',
    icon: '🏷️',
    trigger: { type: 'pattern', config: { pattern: 'dringend|asap|sofort|eilig' } },
    actions: [{ type: 'tag_idea', config: { tags: ['dringend'] }, }],
  },
  {
    id: 'weekly-reminder',
    name: 'Wöchentliche Erinnerung',
    description: 'Erstelle jeden Montag eine Aufgabe zur Wochenplanung',
    icon: '📅',
    trigger: { type: 'schedule', config: { cron: '0 9 * * 1' } },
    actions: [{ type: 'create_task', config: { title: 'Wochenplanung', description: 'Ideen der letzten Woche reviewen' } }],
  },
  {
    id: 'new-idea-notify',
    name: 'Bei neuer Idee benachrichtigen',
    description: 'Erhalte eine Benachrichtigung bei jeder neuen Idee',
    icon: '🔔',
    trigger: { type: 'event', config: { eventName: 'idea.created' } },
    actions: [{ type: 'notification', config: { title: 'Neue Idee', message: 'Eine neue Idee wurde erfasst!' } }],
  },
  {
    id: 'high-priority-task',
    name: 'Aufgabe bei hoher Priorität',
    description: 'Erstelle automatisch eine Aufgabe wenn eine Idee hohe Priorität bekommt',
    icon: '🔥',
    trigger: { type: 'event', config: { eventName: 'idea.priority_changed' } },
    actions: [
      { type: 'set_priority', config: { priority: 'high' } },
      { type: 'create_task', config: { title: 'Hohe Priorität bearbeiten', description: 'Diese Idee hat hohe Priorität erhalten' } },
    ],
  },
];

const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  is_active: true,
  trigger: { type: '', config: {} },
  actions: [{ type: '', config: {} }],
};

// ===========================================
// Component
// ===========================================

export function AutomationFormModal({ context, automation, onClose, onSaved }: AutomationFormModalProps) {
  const isEditing = automation !== null;
  const confirm = useConfirm();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState<FormStep>(isEditing ? 'basics' : 'templates');
  const [formData, setFormData] = useState<FormData>(() => {
    if (automation) {
      return {
        name: automation.name,
        description: automation.description,
        is_active: automation.is_active,
        trigger: {
          type: automation.trigger.type,
          config: { ...automation.trigger.config },
        },
        actions: automation.actions
          .sort((a, b) => a.order - b.order)
          .map(a => ({ type: a.type as ActionType, config: { ...a.config } })),
      };
    }
    return { ...EMPTY_FORM, actions: [{ type: '', config: {} }] };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Focus first input when step changes
  useEffect(() => {
    if (currentStep === 'basics') {
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [currentStep]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  // Dirty check
  const isDirty = useCallback(() => {
    if (isEditing) return true; // Always confirm when editing
    return formData.name.trim() !== '' || formData.trigger.type !== '' || formData.actions.some(a => a.type !== '');
  }, [formData, isEditing]);

  const handleClose = useCallback(async () => {
    if (isDirty()) {
      const confirmed = await confirm({
        title: 'Ungespeicherte Änderungen',
        message: 'Möchtest du wirklich schließen? Alle Änderungen gehen verloren.',
        confirmText: 'Schließen',
        cancelText: 'Weiter bearbeiten',
        variant: 'warning',
      });
      if (!confirmed) return;
    }
    onClose();
  }, [isDirty, confirm, onClose]);

  // ===========================================
  // Validation
  // ===========================================

  const validateBasics = (): boolean => {
    const errs: Record<string, string> = {};
    if (formData.name.trim().length < 2) {
      errs.name = 'Name muss mindestens 2 Zeichen haben';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateTrigger = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.trigger.type) {
      errs.triggerType = 'Bitte wähle einen Auslöser';
    } else if (formData.trigger.type === 'pattern') {
      if (!formData.trigger.config.pattern) errs.triggerConfig = 'Schlüsselwort eingeben';
    } else if (formData.trigger.type === 'event') {
      if (!formData.trigger.config.eventName) errs.triggerConfig = 'Event auswählen';
    } else if (formData.trigger.type === 'schedule') {
      if (!formData.trigger.config.cron) errs.triggerConfig = 'Zeitplan auswählen';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateActions = (): boolean => {
    const errs: Record<string, string> = {};
    if (formData.actions.length === 0 || formData.actions.every(a => !a.type)) {
      errs.actions = 'Mindestens eine Aktion erforderlich';
    }
    formData.actions.forEach((action, i) => {
      if (!action.type) {
        errs[`action_${i}_type`] = 'Aktionstyp wählen';
      } else if (action.type === 'notification') {
        if (!action.config.message) errs[`action_${i}_config`] = 'Nachricht eingeben';
      } else if (action.type === 'tag_idea') {
        const tags = action.config.tags as string[] | undefined;
        if (!tags || tags.length === 0) errs[`action_${i}_config`] = 'Mindestens einen Tag eingeben';
      } else if (action.type === 'create_task') {
        if (!action.config.title) errs[`action_${i}_config`] = 'Titel eingeben';
      } else if (action.type === 'webhook_call') {
        if (!action.config.url) errs[`action_${i}_config`] = 'URL eingeben';
      } else if (action.type === 'slack_message') {
        if (!action.config.message) errs[`action_${i}_config`] = 'Nachricht eingeben';
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ===========================================
  // Navigation
  // ===========================================

  const goNext = () => {
    if (currentStep === 'basics' && validateBasics()) setCurrentStep('trigger');
    else if (currentStep === 'trigger' && validateTrigger()) setCurrentStep('actions');
  };

  const goBack = () => {
    setErrors({});
    if (currentStep === 'actions') setCurrentStep('trigger');
    else if (currentStep === 'trigger') setCurrentStep('basics');
    else if (currentStep === 'basics' && !isEditing) setCurrentStep('templates');
  };

  const goToStep = (step: FormStep) => {
    const stepIndex = STEPS.findIndex(s => s.id === step);
    const currentIndex = STEPS.findIndex(s => s.id === currentStep);
    if (stepIndex < currentIndex) {
      setErrors({});
      setCurrentStep(step);
    }
  };

  // ===========================================
  // Template Selection
  // ===========================================

  const selectTemplate = (template: AutomationTemplate | null) => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description,
        is_active: true,
        trigger: { type: template.trigger.type, config: { ...template.trigger.config } },
        actions: template.actions.map(a => ({ type: a.type, config: { ...a.config } })),
      });
    } else {
      setFormData({ ...EMPTY_FORM, actions: [{ type: '', config: {} }] });
    }
    setCurrentStep('basics');
  };

  // ===========================================
  // Form Updaters
  // ===========================================

  const updateField = (field: keyof FormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const updateTriggerType = (type: TriggerType) => {
    setFormData(prev => ({
      ...prev,
      trigger: { type, config: {} },
    }));
    setErrors({});
  };

  const updateTriggerConfig = (key: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      trigger: { ...prev.trigger, config: { ...prev.trigger.config, [key]: value } },
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.triggerConfig;
      return next;
    });
  };

  const updateAction = (index: number, updates: Partial<FormAction>) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.map((a, i) => i === index ? { ...a, ...updates } : a),
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[`action_${index}_type`];
      delete next[`action_${index}_config`];
      delete next.actions;
      return next;
    });
  };

  const updateActionConfig = (index: number, key: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.map((a, i) => i === index ? { ...a, config: { ...a.config, [key]: value } } : a),
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[`action_${index}_config`];
      return next;
    });
  };

  const addAction = () => {
    setFormData(prev => ({
      ...prev,
      actions: [...prev.actions, { type: '', config: {} }],
    }));
  };

  const removeAction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
  };

  // ===========================================
  // Submit
  // ===========================================

  const handleSubmit = async () => {
    if (!validateActions()) return;

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        is_active: formData.is_active,
        trigger: {
          type: formData.trigger.type,
          config: formData.trigger.config,
        },
        actions: formData.actions
          .filter(a => a.type)
          .map((a, i) => ({
            type: a.type,
            config: a.config,
            order: i + 1,
          })),
      };

      if (isEditing && automation) {
        await axios.put(`/api/${context}/automations/${automation.id}`, payload);
        showToast('Automation gespeichert', 'success');
      } else {
        await axios.post(`/api/${context}/automations`, payload);
        showToast('Automation erstellt', 'success');
      }
      onSaved();
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Speichern fehlgeschlagen'
        : 'Speichern fehlgeschlagen';
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ===========================================
  // Render Helpers
  // ===========================================

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  const renderStepIndicator = () => (
    <div className="afm-steps">
      {STEPS.map((step, i) => (
        <div key={step.id} className="afm-step">
          <button
            type="button"
            className={`afm-step-dot ${i < currentStepIndex ? 'complete' : i === currentStepIndex ? 'active' : 'pending'}`}
            onClick={() => goToStep(step.id)}
            disabled={i >= currentStepIndex}
            aria-label={step.label}
          >
            {i < currentStepIndex ? '✓' : i + 1}
          </button>
          <span className={`afm-step-label ${i === currentStepIndex ? 'active' : ''}`}>{step.label}</span>
          {i < STEPS.length - 1 && (
            <div className={`afm-step-line ${i < currentStepIndex ? 'complete' : ''}`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderTemplates = () => (
    <div className="afm-templates">
      <p className="afm-section-intro">Wähle eine Vorlage oder starte von Grund auf neu:</p>
      <div className="afm-template-grid">
        {TEMPLATES.map(t => (
          <button
            key={t.id}
            type="button"
            className="afm-template-card liquid-glass neuro-hover-lift"
            onClick={() => selectTemplate(t)}
          >
            <span className="afm-template-icon">{t.icon}</span>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
          </button>
        ))}
        <button
          type="button"
          className="afm-template-card blank liquid-glass neuro-hover-lift"
          onClick={() => selectTemplate(null)}
        >
          <span className="afm-template-icon">✨</span>
          <h3>Leere Automation</h3>
          <p>Starte von Grund auf neu</p>
        </button>
      </div>
    </div>
  );

  const renderBasics = () => (
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

  const renderTriggerConfig = () => {
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
  };

  const renderTrigger = () => (
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
          {renderTriggerConfig()}
        </div>
      )}
    </div>
  );

  const renderActionConfig = (action: FormAction, index: number) => {
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
  };

  const renderActions = () => (
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

          {action.type && renderActionConfig(action, index)}
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

  // ===========================================
  // Main Render
  // ===========================================

  return createPortal(
    <div className="afm-overlay" onClick={handleClose} role="presentation">
      <div
        ref={modalRef}
        className="afm-modal liquid-glass neuro-human-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="afm-title"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="afm-header">
          <h2 id="afm-title">
            {isEditing ? 'Automation bearbeiten' : 'Neue Automation'}
          </h2>
          <button
            type="button"
            className="afm-close-btn neuro-press-effect"
            onClick={handleClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        {/* Step Indicator (not shown on template step) */}
        {currentStep !== 'templates' && renderStepIndicator()}

        {/* Content */}
        <div className="afm-content">
          {currentStep === 'templates' && renderTemplates()}
          {currentStep === 'basics' && renderBasics()}
          {currentStep === 'trigger' && renderTrigger()}
          {currentStep === 'actions' && renderActions()}
        </div>

        {/* Footer */}
        {currentStep !== 'templates' && (
          <div className="afm-footer">
            <button
              type="button"
              className="afm-btn-secondary neuro-press-effect"
              onClick={goBack}
            >
              {currentStep === 'basics' && !isEditing ? 'Vorlagen' : 'Zurück'}
            </button>

            {currentStep !== 'actions' ? (
              <button
                type="button"
                className="afm-btn-primary neuro-button"
                onClick={goNext}
              >
                Weiter
              </button>
            ) : (
              <button
                type="button"
                className="afm-btn-primary neuro-button"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? 'Speichere...' : isEditing ? 'Speichern' : 'Erstellen'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
