/**
 * WorkspaceAutomation — AI-driven workflow automation page.
 *
 * Two views:
 * 1. Template Gallery — predefined workflow templates
 * 2. My Automations — active/inactive automations
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { AutomationCard, type AutomationData } from './AutomationCard';
import './WorkspaceAutomation.css';

const API_URL = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || '';

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
}

interface WorkspaceAutomationProps {
  context: AIContext;
  embedded?: boolean;
}

type ViewMode = 'templates' | 'automations';

const CATEGORY_LABELS: Record<string, string> = {
  productivity: 'Produktivität',
  creative: 'Kreativ',
  crm: 'CRM',
  finance: 'Finanzen',
  digest: 'Zusammenfassungen',
};

const CATEGORY_ICONS: Record<string, string> = {
  productivity: '\u{1F4CB}',
  creative: '\u{1F3A8}',
  crm: '\u{1F465}',
  finance: '\u{1F4B0}',
  digest: '\u{1F4F0}',
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

const WorkspaceAutomationComponent: React.FC<WorkspaceAutomationProps> = ({ context }) => {
  const [view, setView] = useState<ViewMode>('templates');
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [automations, setAutomations] = useState<AutomationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state for creating custom automation
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTriggerType, setFormTriggerType] = useState<string>('manual');

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: AutomationTemplate[] }>(
        `/api/${context}/workspace-automations/templates`,
      );
      setTemplates(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Vorlagen');
    }
  }, [context]);

  const fetchAutomations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch<{ data: AutomationData[] }>(
        `/api/${context}/workspace-automations`,
      );
      setAutomations(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetchTemplates();
    fetchAutomations();
  }, [fetchTemplates, fetchAutomations]);

  const handleActivateTemplate = async (templateId: string) => {
    try {
      await apiFetch(`/api/${context}/workspace-automations/from-template`, {
        method: 'POST',
        body: JSON.stringify({ template_id: templateId }),
      });
      await fetchAutomations();
      setView('automations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aktivieren');
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await apiFetch(`/api/${context}/workspace-automations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      setAutomations(prev => prev.map(a => (a.id === id ? { ...a, enabled } : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Umschalten');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Automation wirklich löschen?')) return;
    try {
      await apiFetch(`/api/${context}/workspace-automations/${id}`, { method: 'DELETE' });
      setAutomations(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen');
    }
  };

  const handleExecute = async (id: string) => {
    try {
      await apiFetch(`/api/${context}/workspace-automations/${id}/execute`, {
        method: 'POST',
        body: JSON.stringify({ trigger_data: {} }),
      });
      await fetchAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Ausführen');
    }
  };

  const handleEdit = (_automation: AutomationData) => {
    // For now, just open the create modal with pre-filled data
    // A full edit modal could be added later
  };

  const handleCreateCustom = async () => {
    if (!formName.trim()) return;
    try {
      await apiFetch(`/api/${context}/workspace-automations`, {
        method: 'POST',
        body: JSON.stringify({
          name: formName,
          description: formDescription || undefined,
          trigger_type: formTriggerType,
          trigger_config: {},
          actions: [{ type: 'notify', target: 'smart-suggestion', params: {} }],
        }),
      });
      setShowCreateModal(false);
      setFormName('');
      setFormDescription('');
      setFormTriggerType('manual');
      await fetchAutomations();
      setView('automations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
    }
  };

  const activeCount = automations.filter(a => a.enabled).length;

  return (
    <div className="wa">
      {error && (
        <div className="wa__error" role="alert">
          {error}
          <button onClick={() => setError(null)} className="wa__error-close">Schließen</button>
        </div>
      )}

      <div className="wa__tabs">
        <button
          className={`wa__tab ${view === 'templates' ? 'wa__tab--active' : ''}`}
          onClick={() => setView('templates')}
        >
          Vorlagen ({templates.length})
        </button>
        <button
          className={`wa__tab ${view === 'automations' ? 'wa__tab--active' : ''}`}
          onClick={() => setView('automations')}
        >
          Meine Automationen ({activeCount}/{automations.length})
        </button>
        <button
          className="wa__tab wa__tab--create"
          onClick={() => setShowCreateModal(true)}
        >
          + Erstellen
        </button>
      </div>

      {view === 'templates' && (
        <div className="wa__templates">
          {templates.map(template => (
            <div key={template.id} className="wa__template-card">
              <div className="wa__template-header">
                <span className="wa__template-icon">
                  {CATEGORY_ICONS[template.category] ?? '\u{2699}'}
                </span>
                <div>
                  <h3 className="wa__template-name">{template.name}</h3>
                  <span className="wa__template-category">
                    {CATEGORY_LABELS[template.category] ?? template.category}
                  </span>
                </div>
              </div>
              <p className="wa__template-desc">{template.description}</p>
              <div className="wa__template-meta">
                <span className="wa__badge">{template.trigger_type}</span>
                <span className="wa__badge">{template.actions.length} Aktion{template.actions.length !== 1 ? 'en' : ''}</span>
              </div>
              <button
                className="wa__template-activate"
                onClick={() => handleActivateTemplate(template.id)}
              >
                Aktivieren
              </button>
            </div>
          ))}
        </div>
      )}

      {view === 'automations' && (
        <div className="wa__automations">
          {loading && <p className="wa__loading">Laden...</p>}
          {!loading && automations.length === 0 && (
            <div className="wa__empty">
              <p>Noch keine Automationen erstellt.</p>
              <p>Aktiviere eine Vorlage oder erstelle eine eigene Automation.</p>
            </div>
          )}
          {automations.map(automation => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              context={context}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onExecute={handleExecute}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="wa__modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="wa__modal" onClick={e => e.stopPropagation()}>
            <h2 className="wa__modal-title">Neue Automation</h2>
            <div className="wa__modal-field">
              <label htmlFor="wa-name">Name</label>
              <input
                id="wa-name"
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="z.B. E-Mail Aufgaben-Extraktion"
              />
            </div>
            <div className="wa__modal-field">
              <label htmlFor="wa-desc">Beschreibung</label>
              <textarea
                id="wa-desc"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Was soll diese Automation tun?"
                rows={3}
              />
            </div>
            <div className="wa__modal-field">
              <label htmlFor="wa-trigger">Trigger-Typ</label>
              <select
                id="wa-trigger"
                value={formTriggerType}
                onChange={e => setFormTriggerType(e.target.value)}
              >
                <option value="manual">Manuell</option>
                <option value="event">Ereignis</option>
                <option value="time">Zeitgesteuert</option>
                <option value="condition">Bedingung</option>
              </select>
            </div>
            <div className="wa__modal-actions">
              <button className="wa__modal-btn wa__modal-btn--cancel" onClick={() => setShowCreateModal(false)}>
                Abbrechen
              </button>
              <button
                className="wa__modal-btn wa__modal-btn--create"
                onClick={handleCreateCustom}
                disabled={!formName.trim()}
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const WorkspaceAutomation = React.memo(WorkspaceAutomationComponent);
export default WorkspaceAutomation;
