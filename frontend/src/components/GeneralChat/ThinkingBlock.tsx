/**
 * ThinkingBlock Component
 *
 * Expandable disclosure for AI thinking/reasoning content.
 * Collapsed (default): "Gedankengang" label + 2-line preview with text fade.
 * Expanded: full markdown-rendered content.
 * During streaming: auto-scroll, pulsing border animation.
 *
 * @module components/GeneralChat/ThinkingBlock
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { motionVariants, reducedMotionVariants, useReducedMotion } from '@/lib/motion';

export type ThinkingDisplayMode = 'omitted' | 'collapsible' | 'visible' | 'visible_progress';

export interface ThinkingBlockProps {
  /** The thinking/reasoning content from the AI */
  content: string;
  /** Whether the thinking is still being streamed */
  isStreaming: boolean;
  /** Display mode from adaptive thinking tier (default: collapsible) */
  displayMode?: ThinkingDisplayMode;
  /** Custom label from thinking tier (e.g. "Analyse", "Tiefe Reflexion") */
  label?: string;
}

export function ThinkingBlock({ content, isStreaming, displayMode = 'collapsible', label }: ThinkingBlockProps) {
  // 'visible' and 'visible_progress' start expanded; 'collapsible' starts collapsed
  const [expanded, setExpanded] = useState(displayMode === 'visible' || displayMode === 'visible_progress');
  const contentRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  const slideVariant = prefersReduced ? reducedMotionVariants.slideUp : motionVariants.slideUp;

  // Sync expanded state when displayMode changes (e.g. tier arrives mid-stream)
  useEffect(() => {
    if (displayMode === 'visible' || displayMode === 'visible_progress') {
      setExpanded(true);
    }
  }, [displayMode]);

  // Auto-scroll during streaming when expanded
  useEffect(() => {
    if (isStreaming && expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  const handleToggle = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded(prev => !prev);
    }
  }, []);

  if (!content) return null;

  // Create a 2-line preview (first ~150 chars)
  const previewText = content.length > 150
    ? content.slice(0, 150).trim() + '...'
    : content;

  return (
    <div
      className={`thinking-block${isStreaming ? ' thinking-block--streaming' : ''}${expanded ? ' thinking-block--expanded' : ''}`}
      role="region"
      aria-label="KI-Gedankengang"
    >
      <button
        type="button"
        className="thinking-block-toggle"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={expanded}
        aria-controls="thinking-block-content"
      >
        <span className="thinking-block-icon" aria-hidden="true">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.8-3.5 6-.3.2-.5.5-.5.9V17h-6v-1.1c0-.4-.2-.7-.5-.9C6.3 13.8 5 11.5 5 9a7 7 0 0 1 7-7z"/>
            <line x1="9" y1="21" x2="15" y2="21"/>
          </svg>
        </span>
        <span className="thinking-block-label">
          {label || 'Gedankengang'}
          {isStreaming && displayMode === 'visible_progress' && (
            <span className="thinking-block-progress-indicator" aria-label="verarbeitet">
              <span className="thinking-block-progress-bar" />
            </span>
          )}
          {isStreaming && displayMode !== 'visible_progress' && (
            <span className="thinking-block-streaming-dot" aria-label="denkt noch nach">...</span>
          )}
        </span>
        <span className={`thinking-block-chevron${expanded ? ' thinking-block-chevron--open' : ''}`} aria-hidden="true">
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </button>

      <AnimatePresence mode="wait" initial={false}>
        {expanded ? (
          <motion.div
            key="content"
            id="thinking-block-content"
            className="thinking-block-content"
            variants={slideVariant}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div ref={contentRef} className="thinking-block-content-inner">
              <pre className="thinking-block-text">{content}</pre>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            className="thinking-block-preview"
            aria-hidden="true"
            variants={slideVariant}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <span className="thinking-block-preview-text">{previewText}</span>
            <span className="thinking-block-fade" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
