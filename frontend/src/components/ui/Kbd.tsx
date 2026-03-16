/**
 * Kbd - Keyboard shortcut badge
 *
 * Renders a keyboard shortcut in a GitHub-style badge.
 * Small, rounded, subtle border, monospace font.
 */

import { memo, type ReactNode } from 'react';
import './Kbd.css';

interface KbdProps {
  children: ReactNode;
  className?: string;
}

export const Kbd = memo<KbdProps>(function Kbd({ children, className }) {
  return (
    <kbd className={`zen-kbd${className ? ` ${className}` : ''}`}>
      {children}
    </kbd>
  );
});

export default Kbd;
