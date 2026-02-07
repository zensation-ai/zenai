/**
 * CodeExecutionResult Component
 *
 * Displays the result of code execution with:
 * - Syntax-highlighted code display
 * - Execution output with success/error styling
 * - Copy functionality
 * - Execution metadata (time, language)
 */

import { useState } from 'react';
import './CodeExecutionResult.css';

interface CodeExecutionResultProps {
  /** The executed source code */
  code: string;
  /** Programming language */
  language: 'python' | 'nodejs' | 'bash';
  /** Code explanation */
  explanation?: string;
  /** Execution output (stdout) */
  output?: string;
  /** Execution errors (stderr) */
  errors?: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Execution time in ms */
  executionTimeMs?: number;
  /** Any warnings from safety validation */
  warnings?: string[];
}

const LANGUAGE_NAMES: Record<string, string> = {
  python: 'Python',
  nodejs: 'Node.js',
  bash: 'Bash',
};

const LANGUAGE_ICONS: Record<string, string> = {
  python: '🐍',
  nodejs: '⬢',
  bash: '💻',
};

export function CodeExecutionResult({
  code,
  language,
  explanation,
  output,
  errors,
  success,
  executionTimeMs,
  warnings,
}: CodeExecutionResultProps) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [outputCopied, setOutputCopied] = useState(false);
  const [isCodeExpanded, setIsCodeExpanded] = useState(true);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Clipboard API failed, ignore
    }
  };

  const handleCopyOutput = async () => {
    const textToCopy = output || errors || '';
    try {
      await navigator.clipboard.writeText(textToCopy);
      setOutputCopied(true);
      setTimeout(() => setOutputCopied(false), 2000);
    } catch {
      // Clipboard API failed, ignore
    }
  };

  const codeLines = code.split('\n').length;
  const shouldCollapse = codeLines > 15;

  return (
    <div className="code-execution-result" data-testid="code-execution-result">
      {/* Header with language and time */}
      <div className="code-execution-header">
        <div className="code-execution-language">
          <span className="language-icon">{LANGUAGE_ICONS[language]}</span>
          <span className="language-name">{LANGUAGE_NAMES[language]}</span>
        </div>
        <div className="code-execution-meta">
          {executionTimeMs !== undefined && (
            <span className="execution-time">{executionTimeMs}ms</span>
          )}
          <span className={`execution-status ${success ? 'success' : 'error'}`}>
            {success ? '✓ Erfolgreich' : '✗ Fehler'}
          </span>
        </div>
      </div>

      {/* Explanation */}
      {explanation && (
        <div className="code-execution-explanation">
          <p>{explanation}</p>
        </div>
      )}

      {/* Code Block */}
      <div className="code-section">
        <div className="code-section-header">
          <span className="code-section-title">Code</span>
          <div className="code-section-actions">
            {shouldCollapse && (
              <button
                className="code-action-btn"
                onClick={() => setIsCodeExpanded(!isCodeExpanded)}
                aria-label={isCodeExpanded ? 'Code einklappen' : 'Code ausklappen'}
              >
                {isCodeExpanded ? '▲ Einklappen' : '▼ Ausklappen'}
              </button>
            )}
            <button
              className="code-action-btn copy-btn"
              onClick={handleCopyCode}
              aria-label="Code kopieren"
            >
              {codeCopied ? '✓ Kopiert' : '📋 Kopieren'}
            </button>
          </div>
        </div>
        <pre
          className={`code-block ${!isCodeExpanded && shouldCollapse ? 'collapsed' : ''}`}
          data-language={language}
        >
          <code>{code}</code>
        </pre>
        {!isCodeExpanded && shouldCollapse && (
          <div
            className="code-fade-overlay"
            onClick={() => setIsCodeExpanded(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsCodeExpanded(true); } }}
            role="button"
            tabIndex={0}
            aria-label="Code vollständig anzeigen"
          />
        )}
      </div>

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="code-warnings">
          <div className="warnings-header">
            <span className="warnings-icon">⚠️</span>
            <span>Hinweise ({warnings.length})</span>
          </div>
          <ul className="warnings-list">
            {warnings.map((warning, index) => (
              <li key={`warning-${index}-${warning.slice(0, 20)}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Output Section */}
      <div className={`output-section ${success ? 'success' : 'error'}`}>
        <div className="output-section-header">
          <span className="output-section-title">
            {success ? 'Ausgabe' : 'Fehler'}
          </span>
          {(output || errors) && (
            <button
              className="code-action-btn copy-btn"
              onClick={handleCopyOutput}
              aria-label="Ausgabe kopieren"
            >
              {outputCopied ? '✓ Kopiert' : '📋 Kopieren'}
            </button>
          )}
        </div>
        <pre className="output-block">
          {output || errors || '(keine Ausgabe)'}
        </pre>
      </div>
    </div>
  );
}

export default CodeExecutionResult;
