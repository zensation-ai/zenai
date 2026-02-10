/**
 * TemplateEditor Component
 *
 * Editor for creating and managing custom analysis templates.
 *
 * @module components/DocumentAnalysis/TemplateEditor
 */

import type { CustomTemplate } from './types';
import { TEMPLATE_ICONS } from './types';

interface TemplateEditorProps {
  customTemplates: CustomTemplate[];
  isLoadingCustomTemplates: boolean;
  editingTemplate: Partial<CustomTemplate> | null;
  isSavingTemplate: boolean;
  onSetEditingTemplate: (template: Partial<CustomTemplate> | null) => void;
  onSaveTemplate: () => void;
  onDeleteTemplate: (id: string) => void;
}

export function TemplateEditor({
  customTemplates,
  isLoadingCustomTemplates,
  editingTemplate,
  isSavingTemplate,
  onSetEditingTemplate,
  onSaveTemplate,
  onDeleteTemplate,
}: TemplateEditorProps) {
  return (
    <section className="doc-analysis-templates-editor">
      <h2>Eigene Analyse-Templates</h2>
      <p className="doc-templates-hint">
        Erstelle und verwalte eigene Analyse-Vorlagen mit benutzerdefinierten Prompts.
      </p>

      {/* Template Editor Form */}
      {editingTemplate !== null && (
        <div className="doc-template-editor">
          <h3>{editingTemplate.id ? 'Template bearbeiten' : 'Neues Template'}</h3>
          <div className="doc-template-editor-field">
            <label htmlFor="tpl-name">Name *</label>
            <input
              id="tpl-name"
              type="text"
              value={editingTemplate.name || ''}
              onChange={(e) => onSetEditingTemplate({ ...editingTemplate, name: e.target.value })}
              placeholder="z.B. Marketing-Analyse"
              maxLength={100}
            />
          </div>
          <div className="doc-template-editor-field">
            <label htmlFor="tpl-icon">Icon</label>
            <select
              id="tpl-icon"
              value={editingTemplate.icon || 'file-text'}
              onChange={(e) => onSetEditingTemplate({ ...editingTemplate, icon: e.target.value })}
            >
              {Object.entries(TEMPLATE_ICONS).map(([key, emoji]) => (
                <option key={key} value={key}>{emoji} {key}</option>
              ))}
            </select>
          </div>
          <div className="doc-template-editor-field">
            <label htmlFor="tpl-system">System-Prompt * (Rolle des AI)</label>
            <textarea
              id="tpl-system"
              value={editingTemplate.system_prompt || ''}
              onChange={(e) => onSetEditingTemplate({ ...editingTemplate, system_prompt: e.target.value })}
              placeholder="Du bist ein professioneller Analyst f&uuml;r..."
              rows={3}
            />
          </div>
          <div className="doc-template-editor-field">
            <label htmlFor="tpl-instruction">Anweisung * (Was soll analysiert werden)</label>
            <textarea
              id="tpl-instruction"
              value={editingTemplate.instruction || ''}
              onChange={(e) => onSetEditingTemplate({ ...editingTemplate, instruction: e.target.value })}
              placeholder="Analysiere dieses Dokument mit Fokus auf..."
              rows={5}
            />
          </div>
          <div className="doc-template-editor-actions">
            <button
              type="button"
              className="doc-action-btn"
              onClick={onSaveTemplate}
              disabled={isSavingTemplate || !editingTemplate.name || !editingTemplate.system_prompt || !editingTemplate.instruction}
            >
              {isSavingTemplate ? 'Speichern...' : 'Speichern'}
            </button>
            <button
              type="button"
              className="doc-action-btn secondary"
              onClick={() => onSetEditingTemplate(null)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Create button */}
      {editingTemplate === null && (
        <button
          type="button"
          className="doc-analysis-submit"
          onClick={() => onSetEditingTemplate({ name: '', system_prompt: '', instruction: '', icon: 'file-text' })}
        >
          + Neues Template erstellen
        </button>
      )}

      {/* Template List */}
      {isLoadingCustomTemplates ? (
        <div className="doc-analysis-progress">
          <div className="doc-analysis-progress-inner">
            <span className="doc-analysis-spinner large" />
            <p>Templates werden geladen...</p>
          </div>
        </div>
      ) : customTemplates.length === 0 ? (
        <div className="doc-history-empty">
          <p>Keine eigenen Templates vorhanden. Erstelle dein erstes Template!</p>
        </div>
      ) : (
        <div className="doc-history-list">
          {customTemplates.map((tmpl) => (
            <div key={tmpl.id} className="doc-history-item">
              <div className="doc-history-item-info">
                <span className="doc-history-filename">
                  {TEMPLATE_ICONS[tmpl.icon] || '\u2B50'} {tmpl.name}
                </span>
                <div className="doc-history-meta">
                  <span className="doc-result-tag secondary">System: {tmpl.system_prompt.substring(0, 60)}...</span>
                </div>
              </div>
              <div className="doc-history-item-actions">
                <button
                  type="button"
                  className="doc-action-btn"
                  onClick={() => onSetEditingTemplate(tmpl)}
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  className="doc-action-btn doc-action-delete"
                  onClick={() => onDeleteTemplate(tmpl.id)}
                >
                  L{'\u00f6'}schen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
