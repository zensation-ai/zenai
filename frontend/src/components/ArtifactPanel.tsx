/**
 * ArtifactPanel Component
 *
 * A slide-out panel for displaying interactive artifacts.
 * Supports code (with syntax highlighting), markdown, HTML preview, and diagrams.
 *
 * @module components/ArtifactPanel
 */

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SyntaxHighlighter, oneDark } from '../utils/syntaxHighlighter';
import { showToast } from './Toast';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CloseIcon } from './icons/CloseIcon';
import type { Artifact } from '../types/artifacts';
import { getArtifactFilename } from '../types/artifacts';
import './ArtifactPanel.css';

interface ArtifactPanelProps {
  artifact: Artifact;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export function ArtifactPanel({
  artifact,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Focus trap for accessibility - keeps Tab navigation within the panel
  const panelRef = useFocusTrap<HTMLDivElement>({
    isActive: true,
    initialFocusSelector: '.artifact-close-btn',
    restoreFocus: true,
  });

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        onPrevious();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        onNext();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrevious, onNext, hasPrevious, hasNext, isFullscreen]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      showToast('In Zwischenablage kopiert', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Kopieren fehlgeschlagen', 'error');
    }
  }, [artifact.content]);

  // Download artifact
  const handleDownload = useCallback(() => {
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getArtifactFilename(artifact);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Download gestartet', 'success');
  }, [artifact]);

  // Get language icon
  const getLanguageIcon = (lang?: string): string => {
    const icons: Record<string, string> = {
      python: '🐍',
      javascript: '📜',
      typescript: '💠',
      bash: '💻',
      shell: '💻',
      html: '🌐',
      css: '🎨',
      json: '📋',
      markdown: '📝',
      sql: '🗃️',
    };
    return icons[lang || ''] || '📄';
  };

  // Render content based on type
  const renderContent = () => {
    switch (artifact.type) {
      case 'code':
        return (
          <SyntaxHighlighter
            language={artifact.language || 'text'}
            style={oneDark}
            showLineNumbers
            wrapLines
            customStyle={{
              margin: 0,
              borderRadius: '0 0 8px 8px',
              fontSize: '14px',
              maxHeight: isFullscreen ? 'calc(100vh - 120px)' : '60vh',
            }}
          >
            {artifact.content}
          </SyntaxHighlighter>
        );

      case 'markdown':
        return (
          <div className="artifact-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;
                  return isInline ? (
                    <code className="inline-code" {...props}>
                      {children}
                    </code>
                  ) : (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  );
                },
              }}
            >
              {artifact.content}
            </ReactMarkdown>
          </div>
        );

      case 'html':
        // Security: Use restrictive sandbox without allow-scripts to prevent XSS
        // Only allow same-origin for CSS/fonts, no script execution
        return (
          <div className="artifact-html-preview">
            <iframe
              srcDoc={artifact.content}
              sandbox="allow-same-origin"
              title={artifact.title}
              style={{
                width: '100%',
                height: isFullscreen ? 'calc(100vh - 120px)' : '60vh',
                border: 'none',
                borderRadius: '0 0 8px 8px',
                backgroundColor: '#fff',
              }}
            />
          </div>
        );

      case 'csv':
        return <CsvPreview content={artifact.content} />;

      case 'json':
        return (
          <SyntaxHighlighter
            language="json"
            style={oneDark}
            showLineNumbers
            customStyle={{
              margin: 0,
              borderRadius: '0 0 8px 8px',
              fontSize: '14px',
              maxHeight: isFullscreen ? 'calc(100vh - 120px)' : '60vh',
            }}
          >
            {JSON.stringify(JSON.parse(artifact.content), null, 2)}
          </SyntaxHighlighter>
        );

      case 'mermaid':
        return (
          <div className="artifact-mermaid">
            <pre className="mermaid-source">{artifact.content}</pre>
            <p className="mermaid-note">
              💡 Mermaid-Diagramm - Kopiere den Code in einen{' '}
              <a href="https://mermaid.live" target="_blank" rel="noopener noreferrer">
                Mermaid Editor
              </a>
            </p>
          </div>
        );

      default:
        return (
          <pre className="artifact-raw">
            {artifact.content}
          </pre>
        );
    }
  };

  const panel = (
    <div
      className={`artifact-panel-overlay ${isFullscreen ? 'fullscreen' : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={`artifact-panel ${isFullscreen ? 'fullscreen' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="artifact-panel-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="artifact-header">
          <div className="artifact-title-section">
            <span className="artifact-icon" aria-hidden="true">{getLanguageIcon(artifact.language)}</span>
            <h3 id="artifact-panel-title" className="artifact-title">{artifact.title}</h3>
            {artifact.language && (
              <span className="artifact-language">{artifact.language}</span>
            )}
          </div>

          <div className="artifact-actions">
            {/* Navigation */}
            {(hasPrevious || hasNext) && (
              <div className="artifact-nav" role="navigation" aria-label="Artifact Navigation">
                <button
                  onClick={onPrevious}
                  disabled={!hasPrevious}
                  className="artifact-nav-btn"
                  title="Vorheriges (←)"
                  aria-label="Vorheriges Artifact"
                >
                  ←
                </button>
                <button
                  onClick={onNext}
                  disabled={!hasNext}
                  className="artifact-nav-btn"
                  title="Nächstes (→)"
                  aria-label="Nächstes Artifact"
                >
                  →
                </button>
              </div>
            )}

            {/* Action buttons */}
            <button
              onClick={handleCopy}
              className="artifact-action-btn"
              title="Kopieren"
              aria-label={copied ? 'Kopiert' : 'In Zwischenablage kopieren'}
            >
              {copied ? '✓' : '📋'}
            </button>
            <button
              onClick={handleDownload}
              className="artifact-action-btn"
              title="Herunterladen"
              aria-label="Artifact herunterladen"
            >
              ⬇️
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="artifact-action-btn"
              title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              aria-label={isFullscreen ? 'Vollbildmodus beenden' : 'Vollbildmodus aktivieren'}
            >
              {isFullscreen ? '⊙' : '⛶'}
            </button>
            <button
              onClick={onClose}
              className="artifact-close-btn"
              title="Schließen (Esc)"
              aria-label="Panel schließen"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {/* Description */}
        {artifact.description && (
          <div className="artifact-description">
            {artifact.description}
          </div>
        )}

        {/* Content */}
        <div className="artifact-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

// CSV Preview Component
function CsvPreview({ content }: { content: string }) {
  const rows = content.split('\n').filter(row => row.trim());
  const headers = rows[0]?.split(',').map(h => h.trim()) || [];
  const data = rows.slice(1).map(row => row.split(',').map(cell => cell.trim()));

  return (
    <div className="artifact-csv">
      <table>
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th key={i}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Re-export ArtifactButton from its own file for backwards compatibility
export { ArtifactButton } from './ArtifactButton';
