/**
 * AnalysisResultView Component
 *
 * Displays analysis results including header, key findings,
 * mermaid diagrams, main markdown analysis, and follow-up section.
 *
 * @module components/DocumentAnalysis/AnalysisResultView
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SyntaxHighlighter, oneDark } from '../../utils/syntaxHighlighter';
import type { AnalysisResult, FollowUpMessage, MermaidDiagram } from './types';
import type { Artifact } from '../../types/artifacts';

interface AnalysisResultViewProps {
  result: AnalysisResult;
  followUpQuestion: string;
  followUpMessages: FollowUpMessage[];
  isFollowUpLoading: boolean;
  mermaidDiagrams: MermaidDiagram[];
  isExportingPdf: boolean;
  followUpRef: React.RefObject<HTMLDivElement>;
  onCopyAnalysis: () => void;
  onOpenAsArtifact: (type: 'markdown' | 'csv', title: string, content: string) => void;
  onExportPdf: () => void;
  onReset: () => void;
  onFollowUpQuestionChange: (value: string) => void;
  onFollowUp: () => void;
  onSetSelectedArtifact: (artifact: Artifact) => void;
  formatFileSize: (bytes: number) => string;
}

export function AnalysisResultView({
  result,
  followUpQuestion,
  followUpMessages,
  isFollowUpLoading,
  mermaidDiagrams,
  isExportingPdf,
  followUpRef,
  onCopyAnalysis,
  onOpenAsArtifact,
  onExportPdf,
  onReset,
  onFollowUpQuestionChange,
  onFollowUp,
  onSetSelectedArtifact,
  formatFileSize,
}: AnalysisResultViewProps) {
  return (
    <section className="doc-analysis-results">
      {/* Result Header */}
      <div className="doc-analysis-result-header">
        <div className="doc-analysis-result-info">
          <h2>{result.filename}</h2>
          <div className="doc-analysis-result-meta">
            <span className="doc-result-tag">{result.documentType}</span>
            <span className="doc-result-meta-item">
              {formatFileSize(result.metadata.fileSize)}
            </span>
            <span className="doc-result-meta-item">
              {(result.metadata.processingTimeMs / 1000).toFixed(1)}s Analyse
            </span>
            {result.metadata.tokenUsage && (
              <span className="doc-result-meta-item">
                {result.metadata.tokenUsage.input + result.metadata.tokenUsage.output} Tokens
              </span>
            )}
            {result.cacheKey && (
              <span className="doc-result-tag secondary">Cache aktiv</span>
            )}
          </div>
          {result.metadata.sheetInfo && result.metadata.sheetInfo.length > 0 && (
            <div className="doc-analysis-sheet-info">
              {result.metadata.sheetInfo.map((sheet, i) => (
                <span key={i} className="doc-result-tag secondary">
                  {sheet.name}: {sheet.rows} Zeilen, {sheet.columns} Spalten
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="doc-analysis-result-actions">
          <button
            type="button"
            className="doc-action-btn"
            onClick={onCopyAnalysis}
            title="Analyse kopieren"
          >
            Kopieren
          </button>
          <button
            type="button"
            className="doc-action-btn"
            onClick={() => onOpenAsArtifact('markdown', `Analyse: ${result.filename}`, result.analysis)}
            title="Als Artifact \u00f6ffnen"
          >
            Artifact
          </button>
          {result.id && (
            <button
              type="button"
              className="doc-action-btn"
              onClick={onExportPdf}
              disabled={isExportingPdf}
              title="Als PDF exportieren"
            >
              {isExportingPdf ? 'Export...' : 'PDF'}
            </button>
          )}
          <button
            type="button"
            className="doc-action-btn secondary"
            onClick={onReset}
          >
            Neue Analyse
          </button>
        </div>
      </div>

      {/* Key Findings */}
      {result.keyFindings.length > 0 && (
        <div className="doc-analysis-key-findings">
          <h3>Schl\u00fcssel-Erkenntnisse</h3>
          <ul>
            {result.keyFindings.map((finding, i) => (
              <li key={i}>{finding}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Mermaid Diagrams (Phase 3) */}
      {mermaidDiagrams.length > 0 && (
        <div className="doc-analysis-diagrams">
          <h3>Visualisierungen</h3>
          <div className="doc-diagrams-grid">
            {mermaidDiagrams.map((diagram, i) => (
              <div key={i} className="doc-diagram-card">
                <div className="doc-diagram-header">
                  <span className="doc-diagram-title">{diagram.title}</span>
                  <button
                    type="button"
                    className="doc-action-btn"
                    onClick={() => onSetSelectedArtifact({
                      id: `mermaid-${Date.now()}-${i}`,
                      title: diagram.title,
                      type: 'mermaid',
                      content: diagram.content,
                    })}
                  >
                    {'\u00d6ffnen'}
                  </button>
                </div>
                <pre className="doc-diagram-preview">{diagram.content.substring(0, 200)}{diagram.content.length > 200 ? '...' : ''}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Analysis */}
      <div className="doc-analysis-main">
        <div className="doc-analysis-markdown">
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
            {result.analysis}
          </ReactMarkdown>
        </div>
      </div>

      {/* Follow-up Questions */}
      {result.cacheKey && (
        <div className="doc-followup-section" ref={followUpRef}>
          <h3>Folge-Fragen zum Dokument</h3>
          <p className="doc-followup-hint">
            Stelle weitere Fragen zum analysierten Dokument. Der Kontext bleibt f\u00fcr 5 Minuten im Cache.
          </p>

          {/* Follow-up conversation */}
          {followUpMessages.length > 0 && (
            <div className="doc-followup-messages">
              {followUpMessages.map((msg, i) => (
                <div key={i} className={`doc-followup-msg doc-followup-${msg.role}`}>
                  <div className="doc-followup-msg-label">
                    {msg.role === 'user' ? 'Du' : 'Claude'}
                  </div>
                  <div className="doc-followup-msg-content">
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                  {msg.tokenUsage && (
                    <span className="doc-followup-tokens">
                      {msg.tokenUsage.input + msg.tokenUsage.output} Tokens
                    </span>
                  )}
                </div>
              ))}
              {isFollowUpLoading && (
                <div className="doc-followup-msg doc-followup-assistant">
                  <div className="doc-followup-msg-label">Claude</div>
                  <div className="doc-followup-msg-content">
                    <span className="doc-analysis-spinner" /> Denke nach...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Follow-up input */}
          <div className="doc-followup-input">
            <textarea
              value={followUpQuestion}
              onChange={(e) => onFollowUpQuestionChange(e.target.value)}
              placeholder="Stelle eine Folge-Frage zum Dokument..."
              rows={2}
              disabled={isFollowUpLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onFollowUp();
                }
              }}
            />
            <button
              type="button"
              className="doc-followup-submit"
              onClick={onFollowUp}
              disabled={isFollowUpLoading || !followUpQuestion.trim()}
            >
              {isFollowUpLoading ? (
                <span className="doc-analysis-spinner" />
              ) : (
                'Fragen'
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
