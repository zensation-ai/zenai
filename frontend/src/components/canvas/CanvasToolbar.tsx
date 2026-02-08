/**
 * Canvas Toolbar
 *
 * Controls for the canvas editor: title, type selector, view mode, save status.
 *
 * Phase 33 Sprint 4 - Feature 10
 */

import { useState, useCallback } from 'react';
import type { ViewMode } from './CanvasEditorPanel';

interface CanvasToolbarProps {
  title: string;
  onTitleChange: (title: string) => void;
  type: 'markdown' | 'code' | 'html';
  onTypeChange: (type: 'markdown' | 'code' | 'html') => void;
  language?: string;
  onLanguageChange: (language: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  onDownload: () => void;
  onCopy: () => void;
  onNewDocument: () => void;
  onShowDocList: () => void;
}

export function CanvasToolbar({
  title,
  onTitleChange,
  type,
  onTypeChange,
  language,
  onLanguageChange,
  viewMode,
  onViewModeChange,
  saveStatus,
  onDownload,
  onCopy,
  onNewDocument,
  onShowDocList,
}: CanvasToolbarProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const handleTitleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsEditingTitle(false);
      const newTitle = e.target.value.trim();
      if (newTitle && newTitle !== title) {
        onTitleChange(newTitle);
      }
    },
    [title, onTitleChange]
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
      }
    },
    []
  );

  const getSaveStatusLabel = () => {
    switch (saveStatus) {
      case 'saved': return 'Gespeichert';
      case 'saving': return 'Speichert...';
      case 'unsaved': return 'Ungespeichert';
    }
  };

  const getSaveStatusIcon = () => {
    switch (saveStatus) {
      case 'saved': return '\u2713';
      case 'saving': return '\u23F3';
      case 'unsaved': return '\u25CB';
    }
  };

  return (
    <div className="canvas-toolbar">
      <div className="canvas-toolbar-left">
        {/* Document List Toggle */}
        <button
          className="canvas-toolbar-btn"
          onClick={onShowDocList}
          title="Dokumente"
          aria-label="Dokumentenliste anzeigen"
        >
          {'\uD83D\uDCC1'}
        </button>

        {/* Title */}
        {isEditingTitle ? (
          <input
            className="canvas-title-input"
            defaultValue={title}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            aria-label="Dokumenttitel"
            autoFocus
          />
        ) : (
          <button
            className="canvas-title-display"
            onClick={() => setIsEditingTitle(true)}
            title="Titel bearbeiten"
          >
            {title}
          </button>
        )}

        {/* Type Selector */}
        <select
          className="canvas-type-select"
          value={type}
          onChange={(e) => onTypeChange(e.target.value as 'markdown' | 'code' | 'html')}
          aria-label="Dokumenttyp"
        >
          <option value="markdown">Markdown</option>
          <option value="code">Code</option>
          <option value="html">HTML</option>
        </select>

        {/* Language Selector (for code type) */}
        {type === 'code' && (
          <select
            className="canvas-language-select"
            value={language || 'javascript'}
            onChange={(e) => onLanguageChange(e.target.value)}
            aria-label="Programmiersprache"
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
            <option value="sql">SQL</option>
            <option value="bash">Bash</option>
            <option value="text">Text</option>
          </select>
        )}
      </div>

      <div className="canvas-toolbar-right">
        {/* Save Status */}
        <span className={`canvas-save-status canvas-save-${saveStatus}`}>
          {getSaveStatusIcon()} {getSaveStatusLabel()}
        </span>

        {/* View Mode Toggle */}
        <div className="canvas-view-toggle" role="radiogroup" aria-label="Ansichtsmodus">
          <button
            className={`canvas-view-btn ${viewMode === 'edit' ? 'active' : ''}`}
            onClick={() => onViewModeChange('edit')}
            title="Bearbeiten"
            aria-pressed={viewMode === 'edit'}
          >
            Bearbeiten
          </button>
          <button
            className={`canvas-view-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => onViewModeChange('split')}
            title="Split-Ansicht"
            aria-pressed={viewMode === 'split'}
          >
            Split
          </button>
          <button
            className={`canvas-view-btn ${viewMode === 'preview' ? 'active' : ''}`}
            onClick={() => onViewModeChange('preview')}
            title="Vorschau"
            aria-pressed={viewMode === 'preview'}
          >
            Vorschau
          </button>
        </div>

        {/* Actions */}
        <button className="canvas-toolbar-btn" onClick={onCopy} title="Kopieren" aria-label="Inhalt kopieren">
          {'\uD83D\uDCCB'}
        </button>
        <button className="canvas-toolbar-btn" onClick={onDownload} title="Herunterladen" aria-label="Dokument herunterladen">
          {'\u2B07\uFE0F'}
        </button>
        <button className="canvas-toolbar-btn" onClick={onNewDocument} title="Neues Dokument" aria-label="Neues Dokument erstellen">
          +
        </button>
      </div>
    </div>
  );
}
