import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import './Dropdown.css';

export interface DropdownItem {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  onSelect: (value: string) => void;
  placement?: 'bottom-start' | 'bottom-end';
}

export function Dropdown({ trigger, items, onSelect, placement = 'bottom-start' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = () => setOpen((v) => !v);

  const handleSelect = (value: string) => {
    onSelect(value);
    setOpen(false);
  };

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
    <div
      ref={containerRef}
      className="ds-dropdown"
      aria-haspopup="menu"
      aria-expanded={open}
    >
      <div className="ds-dropdown__trigger" onClick={toggle}>
        {trigger}
      </div>
      {open && (
        <ul
          role="menu"
          className={`ds-dropdown__menu ds-dropdown__menu--${placement}`}
        >
          {items.map((item) => (
            <li
              key={item.value}
              role="menuitem"
              className={`ds-dropdown__item${item.disabled ? ' ds-dropdown__item--disabled' : ''}`}
              onClick={() => !item.disabled && handleSelect(item.value)}
              tabIndex={item.disabled ? -1 : 0}
              onKeyDown={(e) => {
                if (!item.disabled && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleSelect(item.value);
                }
              }}
              aria-disabled={item.disabled}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
