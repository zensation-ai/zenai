// ===========================================
// Types
// ===========================================

export type TriggerType = 'webhook' | 'schedule' | 'event' | 'manual' | 'pattern';
export type ActionType = 'webhook_call' | 'notification' | 'tag_idea' | 'set_priority' | 'create_task' | 'slack_message';
export type FormStep = 'templates' | 'basics' | 'trigger' | 'actions';

export interface AutomationFormModalProps {
  context: import('../ContextSwitcher').AIContext;
  automation: AutomationData | null; // null = create, non-null = edit
  onClose: () => void;
  onSaved: () => void;
}

export interface AutomationData {
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

export interface FormAction {
  type: ActionType | '';
  config: Record<string, unknown>;
}

export interface FormData {
  name: string;
  description: string;
  is_active: boolean;
  trigger: {
    type: TriggerType | '';
    config: Record<string, unknown>;
  };
  actions: FormAction[];
}

export interface AutomationTemplate {
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

export const STEPS: { id: FormStep; label: string }[] = [
  { id: 'basics', label: 'Grundlagen' },
  { id: 'trigger', label: 'Auslöser' },
  { id: 'actions', label: 'Aktionen' },
];

export const TRIGGER_OPTIONS: { type: TriggerType; label: string; icon: string; description: string }[] = [
  { type: 'manual', label: 'Manuell', icon: '👆', description: 'Per Knopfdruck auslösen' },
  { type: 'pattern', label: 'Muster', icon: '🎯', description: 'Bei bestimmten Schlüsselwörtern' },
  { type: 'event', label: 'Event', icon: '📡', description: 'Bei System-Ereignissen' },
  { type: 'schedule', label: 'Zeitplan', icon: '⏰', description: 'Nach Zeitplan ausführen' },
  { type: 'webhook', label: 'Webhook', icon: '🔗', description: 'Durch externe Aufrufe' },
];

export const ACTION_OPTIONS: { type: ActionType; label: string; icon: string }[] = [
  { type: 'notification', label: 'Benachrichtigung', icon: '🔔' },
  { type: 'tag_idea', label: 'Idee taggen', icon: '🏷️' },
  { type: 'set_priority', label: 'Priorität setzen', icon: '🔥' },
  { type: 'create_task', label: 'Aufgabe erstellen', icon: '📝' },
  { type: 'webhook_call', label: 'Webhook aufrufen', icon: '🔗' },
  { type: 'slack_message', label: 'Slack-Nachricht', icon: '💬' },
];

export const EVENT_OPTIONS = [
  { value: 'idea.created', label: 'Idee erstellt' },
  { value: 'idea.updated', label: 'Idee aktualisiert' },
  { value: 'idea.deleted', label: 'Idee gelöscht' },
  { value: 'idea.priority_changed', label: 'Priorität geändert' },
  { value: 'idea.status_changed', label: 'Status geändert' },
];

export const SCHEDULE_PRESETS = [
  { label: 'Täglich 9:00', cron: '0 9 * * *' },
  { label: 'Montags 9:00', cron: '0 9 * * 1' },
  { label: 'Freitags 17:00', cron: '0 17 * * 5' },
  { label: 'Sonntags 18:00', cron: '0 18 * * 0' },
  { label: 'Stündlich', cron: '0 * * * *' },
];

export const TEMPLATES: AutomationTemplate[] = [
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

export const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  is_active: true,
  trigger: { type: '', config: {} },
  actions: [{ type: '', config: {} }],
};
