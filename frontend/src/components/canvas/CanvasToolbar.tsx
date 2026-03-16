/**
 * Canvas Toolbar
 *
 * Controls for the canvas editor: title, type selector, view mode, save status.
 * Enhanced with export functionality (Markdown, PDF, HTML copy).
 *
 * Phase 33 Sprint 4 - Feature 10
 * Phase 6.2 - Multi-Modal Canvas Enhancement
 */

import { useState, useCallback } from 'react';
import { showToast } from '../Toast';
import { logError } from '../../utils/errors';
import type { ViewMode } from './CanvasEditorPanel';

export interface CanvasToolbarProps {
  title: string;
  onTitleChange: (title: string) => void | Promise<void>;
  type: 'markdown' | 'code' | 'html';
  onTypeChange: (type: 'markdown' | 'code' | 'html') => void | Promise<void>;
  language?: string;
  onLanguageChange: (language: string) => void | Promise<void>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  onDownload: () => void;
  onCopy: () => void;
  onNewDocument: () => void;
  onShowDocList: () => void;
  content: string;
  onInsertImage: () => void;
}

/**
 * Simple markdown-to-HTML converter for export.
 * Covers common markdown syntax without external dependencies.
 */
function markdownToHtml(md: string): string {
  let html = md;

  // Escape HTML entities first (but preserve already-valid HTML in the markdown)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links and images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />');

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs: wrap remaining plain-text lines
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');

  // Clean up double newlines
  html = html.replace(/\n{2,}/g, '\n');

  return html.trim();
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
  content,
  onInsertImage,
}: CanvasToolbarProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

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

  // --- Export: Markdown ---
  const handleExportMarkdown = useCallback(() => {
    const filename = `${title.replace(/[^a-zA-Z0-9-_]/g, '_')}.md`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Markdown exportiert', 'success');
    setShowExportMenu(false);
  }, [title, content]);

  // --- Export: PDF (via browser print) ---
  const handleExportPdf = useCallback(() => {
    const htmlContent = type === 'html' ? content : markdownToHtml(content);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Pop-up-Blocker verhindert den PDF-Export', 'error');
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #1a1a2e;
      line-height: 1.7;
      font-size: 14px;
    }
    h1 { font-size: 1.8em; margin-top: 0; }
    h2 { font-size: 1.4em; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    h3 { font-size: 1.15em; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #6366f1; margin: 0.8em 0; padding: 4px 16px; color: #475569; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    @media print {
      body { margin: 0; padding: 0; }
    }
  </style>
</head>
<body>${htmlContent}</body>
</html>`);
    printWindow.document.close();
    // Allow content and images to load before printing
    setTimeout(() => {
      printWindow.print();
    }, 500);
    showToast('PDF-Export gestartet', 'success');
    setShowExportMenu(false);
  }, [title, content, type]);

  // --- Export: Copy as HTML ---
  const handleCopyHtml = useCallback(async () => {
    try {
      const htmlContent = type === 'html' ? content : markdownToHtml(content);
      await navigator.clipboard.writeText(htmlContent);
      showToast('HTML in Zwischenablage kopiert', 'success');
    } catch (err) {
      logError('canvas-copy-html', err);
      showToast('Kopieren fehlgeschlagen', 'error');
    }
    setShowExportMenu(false);
  }, [content, type]);

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

        {/* Image Insert (for markdown type) */}
        {type === 'markdown' && (
          <button
            className="canvas-toolbar-btn"
            onClick={onInsertImage}
            title="Bild einfuegen"
            aria-label="Bild einfuegen"
          >
            {'\uD83D\uDDBC\uFE0F'}
          </button>
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

        {/* Export Menu */}
        <div className="canvas-export-wrapper">
          <button
            className="canvas-toolbar-btn"
            onClick={() => setShowExportMenu(!showExportMenu)}
            title="Exportieren"
            aria-label="Export-Optionen"
            aria-haspopup="true"
            aria-expanded={showExportMenu}
          >
            {'\uD83D\uDCE4'}
          </button>
          {showExportMenu && (
            <>
              <div
                className="canvas-export-backdrop"
                onClick={() => setShowExportMenu(false)}
              />
              <div className="canvas-export-menu" role="menu">
                <button
                  className="canvas-export-menu-item"
                  onClick={handleExportMarkdown}
                  role="menuitem"
                >
                  {'\uD83D\uDCDD'} Als Markdown (.md)
                </button>
                <button
                  className="canvas-export-menu-item"
                  onClick={handleExportPdf}
                  role="menuitem"
                >
                  {'\uD83D\uDCC4'} Als PDF (Drucken)
                </button>
                <button
                  className="canvas-export-menu-item"
                  onClick={handleCopyHtml}
                  role="menuitem"
                >
                  {'\uD83C\uDF10'} HTML kopieren
                </button>
              </div>
            </>
          )}
        </div>

        <button className="canvas-toolbar-btn" onClick={onNewDocument} title="Neues Dokument" aria-label="Neues Dokument erstellen">
          +
        </button>
      </div>
    </div>
  );
}
