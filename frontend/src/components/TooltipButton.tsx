/**
 * TooltipButton Component
 *
 * Kombiniert Button mit Enhanced Tooltip für sofortige Integration.
 * Unterstützt alle Standard-Button-Varianten plus Tooltip-Features.
 *
 * Features:
 * - Automatic tooltip from BUTTON_TOOLTIPS oder custom content
 * - Ripple-Effekt beim Klick
 * - Keyboard-Shortcut Display
 * - Loading State
 * - Icon Support
 */

import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { EnhancedTooltip } from './HumanizedUI';
import { BUTTON_TOOLTIPS, type TooltipContent } from '../utils/humanizedMessages';
import { formatShortcut, useKeyboardShortcut } from '../hooks/useHumanizedFeedback';
import './TooltipButton.css';

// ============================================
// TYPES
// ============================================

export interface TooltipButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Button content */
  children: ReactNode;

  /** Tooltip ID für automatische Tooltip-Inhalte */
  tooltipId?: keyof typeof BUTTON_TOOLTIPS;

  /** Oder custom tooltip content */
  tooltip?: TooltipContent | string;

  /** Button Variante */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

  /** Button Größe */
  size?: 'small' | 'medium' | 'large';

  /** Icon vor dem Text */
  icon?: ReactNode;

  /** Icon nach dem Text */
  iconRight?: ReactNode;

  /** Loading State */
  loading?: boolean;

  /** Tooltip Position */
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';

  /** Shortcut aktivieren (führt onClick aus) */
  enableShortcut?: boolean;

  /** Zeige keinen Tooltip */
  hideTooltip?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const TooltipButton = forwardRef<HTMLButtonElement, TooltipButtonProps>(({
  children,
  tooltipId,
  tooltip,
  variant = 'primary',
  size = 'medium',
  icon,
  iconRight,
  loading = false,
  tooltipPosition = 'top',
  enableShortcut = false,
  hideTooltip = false,
  className = '',
  disabled,
  onClick,
  ...props
}, ref) => {
  // Resolve tooltip content
  const tooltipContent: TooltipContent | undefined = (() => {
    if (hideTooltip) return undefined;
    if (typeof tooltip === 'string') {
      return { label: tooltip };
    }
    if (tooltip) return tooltip;
    if (tooltipId && BUTTON_TOOLTIPS[tooltipId]) {
      return BUTTON_TOOLTIPS[tooltipId];
    }
    return undefined;
  })();

  // Keyboard Shortcut
  const shortcut = tooltipContent?.shortcut;
  useKeyboardShortcut(
    shortcut || '',
    () => {
      if (!disabled && !loading && onClick) {
        onClick({} as React.MouseEvent<HTMLButtonElement>);
      }
    },
    enableShortcut && !!shortcut && !disabled && !loading
  );

  // Format shortcut for display
  const formattedShortcut = shortcut ? formatShortcut(shortcut) : undefined;

  // Button Element
  const buttonElement = (
    <button
      ref={ref}
      className={`tooltip-button ${variant} ${size} ${loading ? 'loading' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {/* Loading Spinner */}
      {loading && (
        <span className="button-spinner" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="31.4 31.4"
            />
          </svg>
        </span>
      )}

      {/* Icon Left */}
      {icon && !loading && (
        <span className="button-icon icon-left">{icon}</span>
      )}

      {/* Content */}
      <span className="button-content">{children}</span>

      {/* Icon Right */}
      {iconRight && !loading && (
        <span className="button-icon icon-right">{iconRight}</span>
      )}

      {/* Ripple Container (CSS-managed) */}
      <span className="button-ripple" aria-hidden="true" />
    </button>
  );

  // Wrap with tooltip if content exists
  if (tooltipContent) {
    return (
      <EnhancedTooltip
        content={{
          ...tooltipContent,
          shortcut: formattedShortcut,
        }}
        position={tooltipPosition}
        disabled={disabled || loading}
      >
        {buttonElement}
      </EnhancedTooltip>
    );
  }

  return buttonElement;
});

TooltipButton.displayName = 'TooltipButton';

// ============================================
// ICON BUTTON VARIANT
// ============================================

export interface IconButtonProps extends Omit<TooltipButtonProps, 'children' | 'icon' | 'iconRight'> {
  /** Icon als einziger Inhalt */
  icon: ReactNode;
  /** Aria Label (required für Icon-only buttons) */
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  icon,
  size = 'medium',
  className = '',
  ...props
}, ref) => {
  return (
    <TooltipButton
      ref={ref}
      size={size}
      className={`icon-only ${className}`}
      {...props}
    >
      {icon}
    </TooltipButton>
  );
});

IconButton.displayName = 'IconButton';

// ============================================
// ACTION BUTTON (mit integrierten Actions)
// ============================================

export interface ActionButtonProps extends TooltipButtonProps {
  /** Action type für automatisches Feedback */
  actionType?: 'archive' | 'save' | 'delete' | 'share' | 'favorite';
  /** Callback nach erfolgreicher Aktion */
  onActionComplete?: () => void;
}

// Pre-configured action buttons
export const ArchiveButton = forwardRef<HTMLButtonElement, Omit<ActionButtonProps, 'tooltipId' | 'variant' | 'icon'>>(
  (props, ref) => (
    <TooltipButton
      ref={ref}
      tooltipId="archiveIdea"
      variant="secondary"
      icon="📦"
      {...props}
    />
  )
);
ArchiveButton.displayName = 'ArchiveButton';

export const SaveButton = forwardRef<HTMLButtonElement, Omit<ActionButtonProps, 'tooltipId' | 'variant' | 'icon'>>(
  (props, ref) => (
    <TooltipButton
      ref={ref}
      tooltipId="saveIdea"
      variant="primary"
      icon="💾"
      enableShortcut
      {...props}
    />
  )
);
SaveButton.displayName = 'SaveButton';

export const DeleteButton = forwardRef<HTMLButtonElement, Omit<ActionButtonProps, 'tooltipId' | 'variant' | 'icon'>>(
  (props, ref) => (
    <TooltipButton
      ref={ref}
      tooltipId="deleteIdea"
      variant="danger"
      icon="🗑️"
      {...props}
    />
  )
);
DeleteButton.displayName = 'DeleteButton';

export const ShareButton = forwardRef<HTMLButtonElement, Omit<ActionButtonProps, 'tooltipId' | 'variant' | 'icon'>>(
  (props, ref) => (
    <TooltipButton
      ref={ref}
      tooltipId="shareIdea"
      variant="secondary"
      icon="📤"
      enableShortcut
      {...props}
    />
  )
);
ShareButton.displayName = 'ShareButton';

export const FavoriteButton = forwardRef<HTMLButtonElement, Omit<ActionButtonProps, 'tooltipId' | 'icon'> & { isFavorite?: boolean }>(
  ({ isFavorite = false, variant = 'ghost', ...props }, ref) => (
    <TooltipButton
      ref={ref}
      tooltipId="favoriteIdea"
      variant={variant}
      icon={isFavorite ? '⭐' : '☆'}
      enableShortcut
      {...props}
    />
  )
);
FavoriteButton.displayName = 'FavoriteButton';

export const VoiceButton = forwardRef<HTMLButtonElement, Omit<ActionButtonProps, 'tooltipId' | 'icon'> & { isRecording?: boolean }>(
  ({ isRecording = false, variant = 'primary', ...props }, ref) => (
    <TooltipButton
      ref={ref}
      tooltipId="voice"
      variant={isRecording ? 'danger' : variant}
      icon={isRecording ? '⏹️' : '🎙️'}
      enableShortcut
      {...props}
    />
  )
);
VoiceButton.displayName = 'VoiceButton';

// ============================================
// EXPORTS
// ============================================

export default TooltipButton;
