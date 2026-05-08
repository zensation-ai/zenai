/**
 * Kbd - Keyboard shortcut badge
 *
 * Renders a keyboard shortcut in a GitHub-style badge.
 * Small, rounded, subtle border, monospace font.
 */

import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KbdProps {
  children: ReactNode;
  className?: string;
}

export const Kbd = memo<KbdProps>(function Kbd({ children, className }) {
  return (
    <kbd className={cn(
      'inline-flex items-center justify-center min-w-5 h-5 px-[5px] font-mono text-[0.6875rem] font-medium leading-none text-text-muted bg-white/6 border border-white/10 rounded-[4px] shadow-[0_1px_0_rgba(0,0,0,0.2)] whitespace-nowrap select-none align-middle',
      className,
    )}>
      {children}
    </kbd>
  );
});

export default Kbd;
