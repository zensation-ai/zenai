import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import './Popover.css';

export interface PopoverProps {
  trigger: ReactNode;
  content: ReactNode;
  placement?: 'bottom' | 'top' | 'left' | 'right';
}

export function Popover({ trigger, content, placement = 'bottom' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = () => setOpen((v) => !v);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={containerRef} className="ds-popover">
      <div className="ds-popover__trigger" onClick={toggle}>
        {trigger}
      </div>
      {open && (
        <div className={`ds-popover__content ds-popover__content--${placement}`}>
          {content}
        </div>
      )}
    </div>
  );
}
