import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useConfirm } from '../ConfirmDialog';
import { showToast } from '../Toast';
import axios from 'axios';
import '../../neurodesign.css';
import '../AutomationFormModal.css';

import {
  TriggerType,
  ActionType,
  FormStep,
  AutomationFormModalProps,
  AutomationTemplate,
  FormAction,
  FormData,
  STEPS,
  EMPTY_FORM,
} from './types';
import { TemplateStep } from './TemplateStep';
import { BasicsStep } from './BasicsStep';
import { TriggerStep } from './TriggerStep';
import { ActionsStep } from './ActionsStep';

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
          {currentStep === 'templates' && (
            <TemplateStep onSelect={selectTemplate} />
          )}
          {currentStep === 'basics' && (
            <BasicsStep
              formData={formData}
              errors={errors}
              firstInputRef={firstInputRef}
              updateField={updateField}
            />
          )}
          {currentStep === 'trigger' && (
            <TriggerStep
              formData={formData}
              errors={errors}
              updateTriggerType={updateTriggerType}
              updateTriggerConfig={updateTriggerConfig}
            />
          )}
          {currentStep === 'actions' && (
            <ActionsStep
              formData={formData}
              errors={errors}
              updateAction={updateAction}
              updateActionConfig={updateActionConfig}
              addAction={addAction}
              removeAction={removeAction}
            />
          )}
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
