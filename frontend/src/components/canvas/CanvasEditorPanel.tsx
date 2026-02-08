/**
 * Canvas Editor Panel
 *
 * Textarea-based editor with live preview for markdown/code/html.
 * Supports Edit, Preview, and Split view modes.
 *
 * Phase 33 Sprint 4 - Feature 10
 */

import { useRef, useCallback } from 'react';
import { renderMarkdownContent, renderCodeContent, renderHtmlContent } from '../../utils/contentRenderers';

export type ViewMode = 'edit' | 'preview' | 'split';

interface CanvasEditorPanelProps {
  content: string;
  onChange: (content: string) => void;
  type: 'markdown' | 'code' | 'html';
  language?: string;
  viewMode: ViewMode;
}

export function CanvasEditorPanel({
  content,
  onChange,
  type,
  language,
  viewMode,
}: CanvasEditorPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle Tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        if (e.shiftKey) {
          // Shift+Tab: remove indentation
          const beforeCursor = content.substring(0, start);
          const lastNewline = beforeCursor.lastIndexOf('\n');
          const lineStart = lastNewline + 1;
          const lineContent = content.substring(lineStart, start);

          if (lineContent.startsWith('  ')) {
            const newContent = content.substring(0, lineStart) + content.substring(lineStart + 2);
            onChange(newContent);
            requestAnimationFrame(() => {
              textarea.selectionStart = Math.max(start - 2, lineStart);
              textarea.selectionEnd = Math.max(end - 2, lineStart);
            });
          }
        } else {
          // Tab: add indentation
          const newContent = content.substring(0, start) + '  ' + content.substring(end);
          onChange(newContent);
          requestAnimationFrame(() => {
            textarea.selectionStart = start + 2;
            textarea.selectionEnd = start + 2;
          });
        }
      }
    },
    [content, onChange]
  );

  // Render preview based on document type
  const renderPreview = () => {
    if (!content) {
      return <div className="canvas-preview-empty">Vorschau wird hier angezeigt...</div>;
    }

    switch (type) {
      case 'markdown':
        return renderMarkdownContent(content);
      case 'code':
        return renderCodeContent(content, language || 'text', { maxHeight: '100%' });
      case 'html':
        return renderHtmlContent(content, 'Canvas Preview', { maxHeight: '100%' });
      default:
        return <pre className="canvas-preview-raw">{content}</pre>;
    }
  };

  const showEditor = viewMode === 'edit' || viewMode === 'split';
  const showPreview = viewMode === 'preview' || viewMode === 'split';

  return (
    <div className={`canvas-editor-container canvas-editor-${viewMode}`}>
      {showEditor && (
        <div className="canvas-editor-pane">
          <textarea
            ref={textareaRef}
            className="canvas-textarea"
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              type === 'markdown'
                ? '# Titel\n\nSchreibe hier Markdown...'
                : type === 'code'
                  ? '// Code hier eingeben...'
                  : '<html>...'
            }
            spellCheck={type === 'markdown'}
            aria-label="Dokumentinhalt bearbeiten"
          />
        </div>
      )}

      {showPreview && (
        <div className="canvas-preview-pane">
          {renderPreview()}
        </div>
      )}
    </div>
  );
}
