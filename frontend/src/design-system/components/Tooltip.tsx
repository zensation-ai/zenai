import { useState, useRef, useId } from 'react';
import type { ReactNode } from 'react';
import './Tooltip.css';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  return (
    <span
      ref={wrapperRef}
      className="ds-tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`ds-tooltip ds-tooltip--${placement}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
