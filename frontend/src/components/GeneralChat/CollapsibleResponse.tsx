/**
 * CollapsibleResponse Component
 *
 * Wraps long AI responses (>500 chars) with a collapse/expand toggle.
 * Collapsed state shows ~3 lines with a gradient fade overlay.
 * Metadata (ConfidenceBadge, ToolDisclosure) is always visible above content.
 *
 * @module components/GeneralChat/CollapsibleResponse
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { springs } from '../../design-system/springs';
import '../GeneralChat.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Character threshold above which the response is collapsible */
const COLLAPSE_THRESHOLD = 500;

/** Approximate pixel height of ~3 lines of body text */
const COLLAPSED_HEIGHT = 72;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollapsibleResponseProps {
  /** Text content (used to decide whether to collapse) */
  content: string;
  /** The rendered content (children) */
  children: React.ReactNode;
  /** Optional metadata rendered above the content (badges, tool disclosures, etc.) */
  metadata?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CollapsibleResponse({ content, children, metadata }: CollapsibleResponseProps) {
  const [expanded, setExpanded] = useState(false);

  const isLong = content.length > COLLAPSE_THRESHOLD;

  // Short responses are always fully visible — no wrapper overhead
  if (!isLong) {
    return (
      <>
        {metadata && <div className="collapsible-response__metadata">{metadata}</div>}
        <div>{children}</div>
      </>
    );
  }

  return (
    <div className="collapsible-response">
      {metadata && <div className="collapsible-response__metadata">{metadata}</div>}

      <AnimatePresence initial={false}>
        <motion.div
          key={expanded ? 'expanded' : 'collapsed'}
          className="collapsible-response__body"
          style={{
            position: 'relative',
            overflow: 'hidden',
          }}
          initial={false}
          animate={{
            maxHeight: expanded ? 9999 : COLLAPSED_HEIGHT,
          }}
          transition={{ type: 'spring', ...springs.gentle }}
        >
          {children}

          {!expanded && (
            <div className="collapsible-response__gradient" aria-hidden="true" />
          )}
        </motion.div>
      </AnimatePresence>

      <button
        type="button"
        className="collapsible-response__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(prev => !prev)}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {expanded ? 'Weniger anzeigen' : 'Vollstaendig anzeigen'}
      </button>
    </div>
  );
}
