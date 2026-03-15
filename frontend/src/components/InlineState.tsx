/**
 * InlineState - Unified empty/error/loading state component
 *
 * Replaces ad-hoc implementations with consistent patterns.
 * Adapts to dark glassmorphism theme.
 */

import { memo, type ReactNode } from 'react';
import './InlineState.css';

interface InlineStateProps {
  variant: 'empty' | 'error' | 'loading';
  icon?: string;
  title: string;
  message?: string;
  action?: ReactNode;
  compact?: boolean;
}

function InlineStateComponent({ variant, icon, title, message, action, compact }: InlineStateProps) {
  const defaultIcons: Record<string, string> = {
    empty: '📭',
    error: '⚠️',
    loading: '⏳',
  };

  return (
    <div className={`inline-state inline-state--${variant}${compact ? ' inline-state--compact' : ''}`} role={variant === 'error' ? 'alert' : 'status'}>
      <span className="inline-state-icon" aria-hidden="true">{icon || defaultIcons[variant]}</span>
      <h4 className="inline-state-title">{title}</h4>
      {message && <p className="inline-state-message">{message}</p>}
      {action && <div className="inline-state-action">{action}</div>}
    </div>
  );
}

export const InlineState = memo(InlineStateComponent);
