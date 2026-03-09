/**
 * Phase 49: Citation List Component
 *
 * Displays numbered source citations below AI messages.
 * Collapsible list showing [N] Title - snippet preview.
 */

import React, { useState } from 'react';

// ===========================================
// Types
// ===========================================

export interface Citation {
  index: number;
  title: string;
  type: string;
  snippet: string;
  relevanceScore: number;
}

export interface CitationListProps {
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}

// ===========================================
// Styles
// ===========================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: '8px',
    borderTop: '1px solid var(--border-color, #e0e0e0)',
    paddingTop: '6px',
    fontSize: '13px',
  },
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    color: 'var(--text-secondary, #666)',
    background: 'none',
    border: 'none',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'background 0.15s',
  },
  toggleHover: {
    background: 'var(--hover-bg, rgba(0,0,0,0.05))',
  },
  list: {
    listStyle: 'none',
    padding: '4px 0 0 0',
    margin: 0,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    lineHeight: 1.4,
  },
  itemHover: {
    background: 'var(--hover-bg, rgba(0,0,0,0.04))',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '20px',
    borderRadius: '4px',
    background: 'var(--primary-light, #e8f0fe)',
    color: 'var(--primary, #1a73e8)',
    fontSize: '11px',
    fontWeight: 600,
    flexShrink: 0,
    marginTop: '1px',
  },
  title: {
    fontWeight: 500,
    color: 'var(--text-primary, #333)',
  },
  separator: {
    color: 'var(--text-tertiary, #999)',
    margin: '0 2px',
  },
  snippet: {
    color: 'var(--text-secondary, #666)',
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '400px',
  },
  typeTag: {
    fontSize: '10px',
    padding: '1px 5px',
    borderRadius: '3px',
    background: 'var(--tag-bg, #f0f0f0)',
    color: 'var(--text-secondary, #666)',
    flexShrink: 0,
    marginTop: '2px',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
    letterSpacing: '0.3px',
  },
};

// ===========================================
// Component
// ===========================================

const CitationList: React.FC<CitationListProps> = ({ citations, onCitationClick }) => {
  const [expanded, setExpanded] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [toggleHovered, setToggleHovered] = useState(false);

  if (!citations || citations.length === 0) {
    return null;
  }

  const arrow = expanded ? '\u25BC' : '\u25B6';

  return (
    <div style={styles.container}>
      <button
        style={{
          ...styles.toggle,
          ...(toggleHovered ? styles.toggleHover : {}),
        }}
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={() => setToggleHovered(true)}
        onMouseLeave={() => setToggleHovered(false)}
        aria-expanded={expanded}
        aria-label={`${citations.length} Quellen ${expanded ? 'ausblenden' : 'anzeigen'}`}
      >
        <span>{arrow}</span>
        <span>{citations.length} {citations.length === 1 ? 'Quelle' : 'Quellen'}</span>
      </button>

      {expanded && (
        <ul style={styles.list}>
          {citations.map((citation) => (
            <li
              key={citation.index}
              style={{
                ...styles.item,
                ...(hoveredIndex === citation.index ? styles.itemHover : {}),
              }}
              onClick={() => onCitationClick?.(citation)}
              onMouseEnter={() => setHoveredIndex(citation.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onCitationClick?.(citation);
                }
              }}
            >
              <span style={styles.badge}>{citation.index}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={styles.title}>{citation.title}</span>
                  <span style={styles.typeTag}>{citation.type}</span>
                </span>
                {citation.snippet && (
                  <span style={styles.snippet}>{citation.snippet}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CitationList;
