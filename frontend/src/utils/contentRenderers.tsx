/**
 * Shared Content Renderers
 *
 * Rendering functions for markdown, code, and HTML content.
 * Used by both ArtifactPanel and Canvas Preview.
 *
 * Phase 33 Sprint 4 - Feature 10
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SyntaxHighlighter, oneDark } from './syntaxHighlighter';

/**
 * Render markdown content with syntax-highlighted code blocks
 */
export function renderMarkdownContent(content: string): JSX.Element {
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
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Render code content with syntax highlighting
 */
export function renderCodeContent(
  content: string,
  language: string = 'text',
  options?: { showLineNumbers?: boolean; maxHeight?: string }
): JSX.Element {
  return (
    <SyntaxHighlighter
      language={language}
      style={oneDark}
      showLineNumbers={options?.showLineNumbers ?? true}
      wrapLines
      customStyle={{
        margin: 0,
        borderRadius: '8px',
        fontSize: '14px',
        maxHeight: options?.maxHeight || '60vh',
      }}
    >
      {content}
    </SyntaxHighlighter>
  );
}

/**
 * Render HTML content in a sandboxed iframe
 */
export function renderHtmlContent(
  content: string,
  title: string,
  options?: { maxHeight?: string }
): JSX.Element {
  return (
    <div className="artifact-html-preview">
      <iframe
        srcDoc={content}
        sandbox=""
        title={title}
        style={{
          width: '100%',
          height: options?.maxHeight || '60vh',
          border: 'none',
          borderRadius: '8px',
          backgroundColor: '#fff',
        }}
      />
    </div>
  );
}
