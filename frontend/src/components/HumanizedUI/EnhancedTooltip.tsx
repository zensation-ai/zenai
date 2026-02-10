import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  type TooltipContent,
  BUTTON_TOOLTIPS,
} from '../../utils/humanizedMessages';

export interface EnhancedTooltipProps {
  /** Tooltip-ID for BUTTON_TOOLTIPS lookup */
  tooltipId?: keyof typeof BUTTON_TOOLTIPS;
  /** Or direct content */
  content?: TooltipContent;
  /** Custom label override */
  label?: string;
  /** The triggered element */
  children: ReactNode;
  /** Position */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay in ms */
  delay?: number;
  /** Disabled */
  disabled?: boolean;
  /** Always show shortcut badge */
  showShortcut?: boolean;
  /** Help mode: shows a small info icon next to the element */
  helpMode?: boolean;
  /** Custom help icon (default: info circle) */
  helpIcon?: string;
}

export const EnhancedTooltip = ({
  tooltipId,
  content: directContent,
  label,
  children,
  position = 'top',
  delay = 400,
  disabled = false,
  showShortcut = true,
  helpMode = false,
  helpIcon = '\u24D8', // circled i
}: EnhancedTooltipProps) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const content: TooltipContent | undefined = directContent || (tooltipId ? BUTTON_TOOLTIPS[tooltipId] : undefined);

  const handleMouseEnter = useCallback(() => {
    if (disabled || !content) return;
    timeoutRef.current = window.setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [delay, disabled, content]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!content) {
    return <>{children}</>;
  }

  // Help mode: render a small help icon that shows tooltip on hover
  if (helpMode) {
    return (
      <div className="enhanced-tooltip-wrapper help-mode-wrapper">
        {children}
        <span
          className="help-icon-trigger"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocus={handleMouseEnter}
          onBlur={handleMouseLeave}
          tabIndex={0}
          role="button"
          aria-label="Hilfe anzeigen"
        >
          {helpIcon}
        </span>
        <div
          className={`enhanced-tooltip ${position} ${visible ? 'visible' : ''}`}
          role="tooltip"
          aria-hidden={!visible}
        >
          <div className="tooltip-header">
            <span className="tooltip-label">{label || content.label}</span>
            {showShortcut && content.shortcut && (
              <kbd className="tooltip-shortcut">{content.shortcut}</kbd>
            )}
          </div>
          {content.action && (
            <div className="tooltip-action">
              <span className="action-arrow">{'\u2192'}</span>
              <span className="action-text">{content.action}</span>
            </div>
          )}
          {content.hint && (
            <div className="tooltip-hint">
              <span className="hint-icon">{'\uD83D\uDCA1'}</span>
              <span className="hint-text">{content.hint}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="enhanced-tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      <div
        className={`enhanced-tooltip ${position} ${visible ? 'visible' : ''}`}
        role="tooltip"
        aria-hidden={!visible}
      >
        {/* Hauptlabel */}
        <div className="tooltip-header">
          <span className="tooltip-label">{label || content.label}</span>
          {showShortcut && content.shortcut && (
            <kbd className="tooltip-shortcut">{content.shortcut}</kbd>
          )}
        </div>

        {/* Aktion (was passiert beim Klick) */}
        {content.action && (
          <div className="tooltip-action">
            <span className="action-arrow">{'\u2192'}</span>
            <span className="action-text">{content.action}</span>
          </div>
        )}

        {/* Kontextuelle Hilfe */}
        {content.hint && (
          <div className="tooltip-hint">
            <span className="hint-icon">{'\uD83D\uDCA1'}</span>
            <span className="hint-text">{content.hint}</span>
          </div>
        )}
      </div>
    </div>
  );
};
