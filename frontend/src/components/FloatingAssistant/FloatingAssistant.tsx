/**
 * FloatingAssistant - Global AI helper bubble
 *
 * A floating action button that expands into a chat panel.
 * Always available regardless of the current page.
 * Supports text and voice input, app knowledge, and action execution.
 *
 * Keyboard shortcut: Cmd+Shift+A (Mac) / Ctrl+Shift+A (Windows)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Page } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import { GeneralChat } from '../GeneralChat';
import { ErrorBoundary } from '../ErrorBoundary';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { safeLocalStorage } from '../../utils/storage';
import { QuickActions } from './QuickActions';
import './FloatingAssistant.css';

interface FloatingAssistantProps {
  context: AIContext;
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const ONBOARDING_KEY = 'zenai-assistant-seen';
const ASSISTANT_INPUT_EVENT = 'zenai-assistant-fill-input';

export function FloatingAssistant({ context, currentPage, onNavigate }: FloatingAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const bubbleRef = useRef<HTMLButtonElement>(null);

  const panelRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    initialFocusSelector: '.chat-input',
    restoreFocus: true,
  });

  // Onboarding: show tooltip on first visit
  useEffect(() => {
    const seen = safeLocalStorage('get', ONBOARDING_KEY);
    if (!seen) {
      const timer = setTimeout(() => setShowTooltip(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismissTooltip = useCallback(() => {
    setShowTooltip(false);
    safeLocalStorage('set', ONBOARDING_KEY, 'true');
  }, []);

  // Toggle handler
  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
    if (showTooltip) dismissTooltip();
  }, [showTooltip, dismissTooltip]);

  // Close handler
  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Keyboard shortcut: Cmd+Shift+A / Ctrl+Shift+A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleToggle();
      }
      // Escape closes the panel
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleToggle, handleClose, isOpen]);

  // Mobile: body scroll lock when panel is open
  useEffect(() => {
    if (isOpen && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Quick action handler: dispatch custom event to fill chat input
  const handleQuickAction = useCallback((prompt: string) => {
    window.dispatchEvent(
      new CustomEvent(ASSISTANT_INPUT_EVENT, { detail: { prompt } })
    );
  }, []);

  // Listen for navigation actions from assistant responses
  useEffect(() => {
    const handleMessage = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.action === 'navigate' && detail?.page) {
        onNavigate(detail.page as Page);
      }
    };

    window.addEventListener('zenai-assistant-navigate', handleMessage);
    return () => window.removeEventListener('zenai-assistant-navigate', handleMessage);
  }, [onNavigate]);

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const shortcutLabel = isMac ? '\u2318\u21E7A' : 'Ctrl+Shift+A';

  return createPortal(
    <>
      {/* Floating Bubble */}
      <button
        ref={bubbleRef}
        type="button"
        className={`assistant-bubble ${isOpen ? 'open' : ''}`}
        onClick={handleToggle}
        aria-label={isOpen ? 'Assistent schließen' : 'Assistent öffnen'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className="assistant-bubble-icon" aria-hidden="true">
          {isOpen ? '\u2715' : '\u{1F9E0}'}
        </span>
      </button>

      {/* Onboarding Tooltip */}
      {showTooltip && !isOpen && (
        <div className="assistant-tooltip" role="tooltip">
          <button
            type="button"
            className="assistant-tooltip-dismiss"
            onClick={dismissTooltip}
            aria-label="Hinweis schließen"
          >
            \u2715
          </button>
          <p className="assistant-tooltip-text">
            Ich bin Zen, dein KI-Assistent. Frag mich alles zur App!
            <kbd className="assistant-tooltip-kbd">{shortcutLabel}</kbd>
          </p>
          <div className="assistant-tooltip-arrow" aria-hidden="true" />
        </div>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="assistant-panel"
          role="dialog"
          aria-modal={window.innerWidth < 768}
          aria-label="ZenAI Assistent"
        >
          {/* Header */}
          <div className="assistant-header">
            <div className="assistant-header-left">
              <span className="assistant-header-avatar" aria-hidden="true">{'\u{1F9E0}'}</span>
              <div className="assistant-header-info">
                <span className="assistant-header-name">Zen</span>
                <span className="assistant-header-status">Dein KI-Assistent</span>
              </div>
            </div>
            <button
              type="button"
              className="assistant-close-btn"
              onClick={handleClose}
              aria-label="Assistent schließen"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M13.5 4.5L4.5 13.5M4.5 4.5l9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Quick Actions */}
          <QuickActions currentPage={currentPage} onAction={handleQuickAction} />

          {/* Chat */}
          <div className="assistant-chat-container">
            <ErrorBoundary fallback={<div style={{ padding: 16 }}>Chat nicht verfügbar.</div>}>
              <GeneralChat
                context={context}
                isCompact={true}
                assistantMode={true}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

/** Event name for filling the assistant chat input */
export { ASSISTANT_INPUT_EVENT };
