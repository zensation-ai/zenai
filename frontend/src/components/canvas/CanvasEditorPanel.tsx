/**
 * Canvas Editor Panel
 *
 * Textarea-based editor with live preview for markdown/code/html.
 * Supports Edit, Preview, and Split view modes.
 * Enhanced with Mermaid diagram preview, image drag-and-drop, and markdown toolbar.
 *
 * Phase 33 Sprint 4 - Feature 10
 * Phase 6.2 - Multi-Modal Canvas Enhancement
 */

import { useRef, useCallback, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { renderMarkdownContent, renderCodeContent, renderHtmlContent } from '../../utils/contentRenderers';
import { CanvasMarkdownToolbar } from './CanvasMarkdownToolbar';
import { showToast } from '../Toast';
import { logError } from '../../utils/errors';

export type ViewMode = 'edit' | 'preview' | 'split';

interface CanvasEditorPanelProps {
  content: string;
  onChange: (content: string) => void;
  type: 'markdown' | 'code' | 'html';
  language?: string;
  viewMode: ViewMode;
}

export interface CanvasEditorPanelHandle {
  getTextareaRef: () => HTMLTextAreaElement | null;
}

const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

/**
 * Extract mermaid code blocks from markdown content.
 */
function extractMermaidBlocks(content: string): { code: string; index: number }[] {
  const blocks: { code: string; index: number }[] = [];
  const regex = /```mermaid\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(content)) !== null) {
    blocks.push({ code: match[1].trim(), index: idx++ });
  }
  return blocks;
}

/**
 * Load mermaid from CDN as a global.
 * Returns the mermaid API object, or null if loading fails.
 */
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
let mermaidLoadPromise: Promise<MermaidAPI | null> | null = null;

interface MermaidAPI {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
}

function loadMermaid(): Promise<MermaidAPI | null> {
  if (mermaidLoadPromise) return mermaidLoadPromise;

  mermaidLoadPromise = (async () => {
    try {
      // Use Function constructor to create a dynamic import that Vite won't statically analyze
      const importFn = new Function('url', 'return import(url)') as (url: string) => Promise<{ default: MermaidAPI }>;
      const mod = await importFn(MERMAID_CDN);
      const api = mod.default;
      api.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#6366f1',
          primaryTextColor: '#e2e8f0',
          primaryBorderColor: '#818cf8',
          lineColor: '#94a3b8',
          secondaryColor: '#1e1b4b',
          tertiaryColor: '#312e81',
        },
        fontFamily: 'Inter, system-ui, sans-serif',
        securityLevel: 'strict',
      });
      return api;
    } catch {
      return null;
    }
  })();

  return mermaidLoadPromise;
}

/**
 * Mermaid diagram renderer component.
 * Loads mermaid from CDN on first use with graceful fallback.
 */
function MermaidDiagram({ code, diagramId }: { code: string; diagramId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      const mermaid = await loadMermaid();
      if (cancelled) return;

      if (!mermaid) {
        setError('Mermaid-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung pruefen.');
        setSvgContent('');
        return;
      }

      try {
        const { svg } = await mermaid.render(diagramId, code);
        if (!cancelled) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Diagramm-Fehler');
          setSvgContent('');
        }
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [code, diagramId]);

  if (error) {
    return (
      <div className="canvas-mermaid-error">
        <span className="canvas-mermaid-error-icon">!</span>
        <span>{error}</span>
      </div>
    );
  }

  if (!svgContent) {
    return <div className="canvas-mermaid-loading">Diagramm wird gerendert...</div>;
  }

  return (
    <div
      className="canvas-mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}

/**
 * Convert a File to a base64 data URL.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

function getPlaceholder(type: 'markdown' | 'code' | 'html'): string {
  switch (type) {
    case 'markdown': return '# Titel\n\nSchreibe hier Markdown...\n\nBilder per Drag & Drop einfuegen.';
    case 'code': return '// Code hier eingeben...';
    case 'html': return '<html>...';
  }
}

export const CanvasEditorPanel = forwardRef<CanvasEditorPanelHandle, CanvasEditorPanelProps>(
  function CanvasEditorPanel({ content, onChange, type, language, viewMode }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showMermaidPreview, setShowMermaidPreview] = useState(true);
    const dragCounterRef = useRef(0);

    useImperativeHandle(ref, () => ({
      getTextareaRef: () => textareaRef.current,
    }));

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

    // --- Image Drag-and-Drop ---
    const handleDragEnter = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (e.dataTransfer.types.includes('Files')) {
        setIsDragging(true);
      }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length === 0) {
        showToast('Nur Bilddateien werden unterstuetzt', 'error');
        return;
      }

      for (const file of files) {
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          showToast(`"${file.name}" ist groesser als ${MAX_IMAGE_SIZE_MB}MB`, 'error');
          continue;
        }

        try {
          const dataUrl = await fileToDataUrl(file);
          const altText = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
          const markdownImage = `\n![${altText}](${dataUrl})\n`;

          const textarea = textareaRef.current;
          const cursorPos = textarea ? textarea.selectionStart : content.length;
          const newContent = content.substring(0, cursorPos) + markdownImage + content.substring(cursorPos);
          onChange(newContent);
          showToast(`Bild "${file.name}" eingefuegt`, 'success');
        } catch (err) {
          logError('canvas-image-drop', err);
          showToast(`Fehler beim Einfuegen von "${file.name}"`, 'error');
        }
      }
    }, [content, onChange]);

    // --- Mermaid blocks detection ---
    const mermaidBlocks = type === 'markdown' ? extractMermaidBlocks(content) : [];
    const hasMermaid = mermaidBlocks.length > 0;

    // Render preview based on document type
    const renderPreview = () => {
      if (!content) {
        return <div className="canvas-preview-empty">Vorschau wird hier angezeigt...</div>;
      }

      switch (type) {
        case 'markdown':
          return (
            <>
              {renderMarkdownContent(content)}
              {hasMermaid && showMermaidPreview && (
                <div className="canvas-mermaid-section">
                  <div className="canvas-mermaid-header">
                    <span>Diagramme</span>
                  </div>
                  {mermaidBlocks.map((block) => (
                    <MermaidDiagram
                      key={`mermaid-${block.index}-${block.code.substring(0, 32)}`}
                      code={block.code}
                      diagramId={`mermaid-diagram-${block.index}`}
                    />
                  ))}
                </div>
              )}
            </>
          );
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
          <div
            className={`canvas-editor-pane ${isDragging ? 'canvas-editor-dragging' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Markdown formatting toolbar */}
            {type === 'markdown' && (
              <CanvasMarkdownToolbar
                textareaRef={textareaRef}
                onContentChange={onChange}
                content={content}
              />
            )}

            {/* Mermaid toggle when mermaid blocks are detected */}
            {hasMermaid && type === 'markdown' && (
              <button
                type="button"
                className={`canvas-mermaid-toggle ${showMermaidPreview ? 'active' : ''}`}
                onClick={() => setShowMermaidPreview(!showMermaidPreview)}
                title={showMermaidPreview ? 'Diagramm-Vorschau ausblenden' : 'Diagramm-Vorschau anzeigen'}
                aria-label="Mermaid-Vorschau umschalten"
              >
                {'\u25C8'} Diagramme ({mermaidBlocks.length})
              </button>
            )}

            <textarea
              ref={textareaRef}
              className="canvas-textarea"
              value={content}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={getPlaceholder(type)}
              spellCheck={type === 'markdown'}
              aria-label="Dokumentinhalt bearbeiten"
            />

            {/* Drag overlay */}
            {isDragging && (
              <div className="canvas-drop-overlay">
                <div className="canvas-drop-overlay-content">
                  <span className="canvas-drop-icon">{'\uD83D\uDDBC\uFE0F'}</span>
                  <span>Bild hier ablegen</span>
                  <span className="canvas-drop-hint">Max. {MAX_IMAGE_SIZE_MB}MB</span>
                </div>
              </div>
            )}
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
);
