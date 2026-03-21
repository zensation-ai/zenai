/**
 * ChatContentRenderer
 *
 * Renders markdown-like formatting from AI responses.
 * Handles code blocks, artifacts, tables, lists, blockquotes, headings,
 * and inline formatting (bold, italic, code, links).
 *
 * Extracted from GeneralChat.tsx (Phase 121).
 */

import React, { useCallback } from 'react';
import { ArtifactButton } from '../ArtifactButton';
import { extractArtifacts, type Artifact } from '../../types/artifacts';
import { MAX_ARTIFACT_CACHE } from '../../config/chat';

interface ChatContentRendererProps {
  artifacts: Map<string, Artifact[]>;
  setArtifacts: React.Dispatch<React.SetStateAction<Map<string, Artifact[]>>>;
  setActiveArtifact: React.Dispatch<React.SetStateAction<{ artifact: Artifact; messageId: string; index: number } | null>>;
}

/**
 * Hook that returns a renderContent function and a getMessageArtifacts helper.
 */
export function useChatContentRenderer({ artifacts, setArtifacts, setActiveArtifact }: ChatContentRendererProps) {
  // Extract and cache artifacts from message content
  const getMessageArtifacts = useCallback((messageId: string, content: string): { text: string; messageArtifacts: Artifact[] } => {
    // Check cache first
    const cached = artifacts.get(messageId);
    if (cached) {
      // Return processed text with artifact references
      const { text } = extractArtifacts(content);
      return { text, messageArtifacts: cached };
    }

    // Extract artifacts
    const { text, artifacts: extracted } = extractArtifacts(content);

    // Cache if any found (with LRU eviction at MAX_ARTIFACT_CACHE)
    if (extracted.length > 0) {
      setArtifacts(prev => {
        const next = new Map(prev);
        next.set(messageId, extracted);
        // Evict oldest entries when cache exceeds limit
        if (next.size > MAX_ARTIFACT_CACHE) {
          const keysToDelete = Array.from(next.keys()).slice(0, next.size - MAX_ARTIFACT_CACHE);
          for (const key of keysToDelete) {
            next.delete(key);
          }
        }
        return next;
      });
    }

    return { text, messageArtifacts: extracted };
  }, [artifacts, setArtifacts]);

  // Render markdown-like formatting (safe, no dangerouslySetInnerHTML)
  const renderContent = useCallback((content: string, messageId?: string) => {
    // Extract artifacts if messageId provided
    let processedContent = content;
    let messageArtifacts: Artifact[] = [];

    if (messageId) {
      const result = getMessageArtifacts(messageId, content);
      processedContent = result.text;
      messageArtifacts = result.messageArtifacts;
    }

    // Split by code blocks and artifact references
    const parts = processedContent.split(/(```[\s\S]*?```|\[\[ARTIFACT:[^\]]+\]\])/g);

    return parts.map((part, i) => {
      // Check for artifact reference
      const artifactMatch = part.match(/\[\[ARTIFACT:([^\]]+)\]\]/);
      if (artifactMatch) {
        const artifactId = artifactMatch[1];
        const artifact = messageArtifacts.find(a => a.id === artifactId);
        if (artifact && messageId) {
          const artifactIndex = messageArtifacts.indexOf(artifact);
          return (
            <ArtifactButton
              key={i}
              artifact={artifact}
              onClick={() => setActiveArtifact({ artifact, messageId, index: artifactIndex })}
            />
          );
        }
        return null;
      }

      if (part.startsWith('```') && part.endsWith('```')) {
        // Code block - check if it's large enough to be an artifact
        const codeContent = part.slice(3, -3);
        const langMatch = codeContent.match(/^(\w+)\n/);
        const language = langMatch ? langMatch[1] : 'text';
        const code = langMatch ? codeContent.slice(langMatch[0].length) : codeContent;

        // Large code blocks become inline artifacts
        if (code.split('\n').length >= 15 && messageId) {
          const inlineArtifact: Artifact = {
            id: `inline-${messageId}-${i}`,
            title: `${language.charAt(0).toUpperCase() + language.slice(1)} Code`,
            type: 'code',
            language,
            content: code,
          };
          return (
            <ArtifactButton
              key={i}
              artifact={inlineArtifact}
              onClick={() => setActiveArtifact({ artifact: inlineArtifact, messageId, index: -1 })}
            />
          );
        }

        // Small code blocks render inline
        return (
          <pre key={i} className="code-block">
            <code>{code}</code>
          </pre>
        );
      }

      // Process block-level formatting (headings, lists, blockquotes, tables) then inline
      const renderBlockFormatting = (text: string): React.ReactNode[] => {
        const lines = text.split('\n');
        const result: React.ReactNode[] = [];
        let keyIndex = 0;
        let listItems: string[] = [];
        let listType: 'ul' | 'ol' | null = null;
        let blockquoteLines: string[] = [];
        let tableRows: string[][] = [];
        let tableHasHeader = false;

        const flushList = () => {
          if (listItems.length > 0 && listType) {
            const Tag = listType;
            result.push(
              <Tag key={`list-${keyIndex++}`} className="chat-list">
                {listItems.map((item, li) => (
                  <li key={li}>{renderInline(item)}</li>
                ))}
              </Tag>
            );
            listItems = [];
            listType = null;
          }
        };

        const flushBlockquote = () => {
          if (blockquoteLines.length > 0) {
            result.push(
              <blockquote key={`bq-${keyIndex++}`} className="chat-blockquote">
                {blockquoteLines.map((bqLine, bi) => (
                  <span key={bi}>{renderInline(bqLine)}{bi < blockquoteLines.length - 1 && <br />}</span>
                ))}
              </blockquote>
            );
            blockquoteLines = [];
          }
        };

        const flushTable = () => {
          if (tableRows.length > 0) {
            const headerRow = tableHasHeader ? tableRows[0] : null;
            const bodyRows = tableHasHeader ? tableRows.slice(1) : tableRows;
            result.push(
              <div key={`tw-${keyIndex++}`} className="chat-table-wrapper">
                <table className="chat-table">
                  {headerRow && (
                    <thead>
                      <tr>{headerRow.map((cell, ci) => <th key={ci}>{renderInline(cell)}</th>)}</tr>
                    </thead>
                  )}
                  <tbody>
                    {bodyRows.map((row, ri) => (
                      <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{renderInline(cell)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
            tableRows = [];
            tableHasHeader = false;
          }
        };

        const parseTableRow = (line: string): string[] | null => {
          if (!line.includes('|')) return null;
          const trimmed = line.trim();
          // Must start and end with | for a proper table
          if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
          return trimmed.slice(1, -1).split('|').map(c => c.trim());
        };

        const isSeparatorRow = (line: string): boolean =>
          /^\|[\s:]*[-:]+[\s:]*(\|[\s:]*[-:]+[\s:]*)*\|$/.test(line.trim());

        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];

          // Blockquote
          const bqMatch = line.match(/^>\s?(.*)$/);
          if (bqMatch) {
            flushList();
            flushTable();
            blockquoteLines.push(bqMatch[1]);
            continue;
          }
          flushBlockquote();

          // Table row
          const tableCells = parseTableRow(line);
          if (tableCells) {
            flushList();
            // Skip separator rows (---|---|---) but mark header
            if (isSeparatorRow(line)) {
              if (tableRows.length === 1) tableHasHeader = true;
              continue;
            }
            tableRows.push(tableCells);
            continue;
          }
          flushTable();

          // Headings
          const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
          if (headingMatch) {
            flushList();
            const level = headingMatch[1].length;
            const Tag = `h${Math.min(level + 2, 6)}` as keyof JSX.IntrinsicElements;
            result.push(<Tag key={`h-${keyIndex++}`} className="chat-heading">{renderInline(headingMatch[2])}</Tag>);
            continue;
          }

          // Unordered list
          const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
          if (ulMatch) {
            if (listType === 'ol') flushList();
            listType = 'ul';
            listItems.push(ulMatch[1]);
            continue;
          }

          // Ordered list
          const olMatch = line.match(/^[\s]*\d+[.)]\s+(.+)$/);
          if (olMatch) {
            if (listType === 'ul') flushList();
            listType = 'ol';
            listItems.push(olMatch[1]);
            continue;
          }

          // Regular line
          flushList();
          if (line.trim() === '') {
            result.push(<br key={`br-${keyIndex++}`} />);
          } else {
            result.push(<span key={`p-${keyIndex++}`}>{renderInline(line)}<br /></span>);
          }
        }
        flushList();
        flushBlockquote();
        flushTable();
        return result;
      };

      // Inline formatting: bold, italic, inline code, links
      const renderInline = (text: string): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
        let lastIndex = 0;
        let match;
        let ki = 0;

        while ((match = inlineRegex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            result.push(text.slice(lastIndex, match.index));
          }

          const matched = match[0];
          if (match[2] && match[3]) {
            // Link: [text](url) - validate protocol to prevent javascript: XSS
            const url = match[3];
            const isSafeUrl = /^https?:\/\//.test(url) || url.startsWith('mailto:');
            if (isSafeUrl) {
              result.push(<a key={`a-${ki++}`} href={url} target="_blank" rel="noopener noreferrer" className="chat-link">{match[2]}</a>);
            } else {
              result.push(<span key={`a-${ki++}`} className="chat-link-text">{match[2]}</span>);
            }
          } else if (matched.startsWith('**') && matched.endsWith('**')) {
            result.push(<strong key={`b-${ki++}`}>{matched.slice(2, -2)}</strong>);
          } else if (matched.startsWith('*') && matched.endsWith('*')) {
            result.push(<em key={`i-${ki++}`}>{matched.slice(1, -1)}</em>);
          } else if (matched.startsWith('`') && matched.endsWith('`')) {
            result.push(<code key={`c-${ki++}`} className="inline-code">{matched.slice(1, -1)}</code>);
          }

          lastIndex = match.index + matched.length;
        }

        if (lastIndex < text.length) {
          result.push(text.slice(lastIndex));
        }
        return result;
      };

      return <span key={i}>{renderBlockFormatting(part)}</span>;
    });
  }, [getMessageArtifacts, setActiveArtifact]);

  return { renderContent, getMessageArtifacts };
}
