import { useState, useEffect, type CSSProperties } from 'react';
import { getAIStatusMessage } from '../../utils/humanizedMessages';

export interface AIStatusIndicatorProps {
  /** Current status */
  status: 'idle' | 'listening' | 'thinking' | 'processing' | 'success' | 'error' | 'offline';
  /** Size */
  size?: 'small' | 'medium' | 'large';
  /** Show text label */
  showLabel?: boolean;
  /** Custom className */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

export const AIStatusIndicator = ({
  status,
  size = 'medium',
  showLabel = true,
  className = '',
  onClick,
}: AIStatusIndicatorProps) => {
  const statusInfo = getAIStatusMessage(status);
  const [pulseActive, setPulseActive] = useState(false);

  // Pulsing effect for active states
  useEffect(() => {
    if (['listening', 'thinking', 'processing'].includes(status)) {
      setPulseActive(true);
    } else {
      setPulseActive(false);
    }
  }, [status]);

  return (
    <div
      className={`ai-status-indicator ${status} ${size} ${className}`}
      onClick={onClick}
      role="status"
      aria-live="polite"
      aria-label={`${statusInfo.message}${statusInfo.subMessage ? ` - ${statusInfo.subMessage}` : ''}`}
      style={statusInfo.pulseColor ? { '--pulse-color': statusInfo.pulseColor } as CSSProperties : undefined}
    >
      {/* Animierter Kreis */}
      <div className="status-circle">
        {/* Hintergrund-Glow */}
        <div className={`status-glow ${pulseActive ? 'active' : ''}`} />

        {/* Outer pulse rings */}
        {pulseActive && (
          <>
            <div className="pulse-ring ring-1" />
            <div className="pulse-ring ring-2" />
            <div className="pulse-ring ring-3" />
          </>
        )}

        {/* Icon */}
        <div className="status-icon">
          <span className="icon-emoji">{statusInfo.icon}</span>
        </div>

        {/* Audio waves for Listening */}
        {status === 'listening' && (
          <div className="audio-waves">
            <span className="wave" />
            <span className="wave" />
            <span className="wave" />
            <span className="wave" />
          </div>
        )}

        {/* Thinking dots for Thinking/Processing */}
        {(status === 'thinking' || status === 'processing') && (
          <div className="thinking-dots">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
      </div>

      {/* Label */}
      {showLabel && (
        <div className="status-label">
          <span className="label-message">{statusInfo.message}</span>
          {statusInfo.subMessage && (
            <span className="label-submessage">{statusInfo.subMessage}</span>
          )}
        </div>
      )}
    </div>
  );
};
