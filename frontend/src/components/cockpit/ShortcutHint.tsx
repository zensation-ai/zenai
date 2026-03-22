import { useEffect } from 'react';
import './ShortcutHint.css';

interface ShortcutHintProps {
  message: string;
  visible: boolean;
  onDismiss?: () => void;
}

export function ShortcutHint({ message, visible, onDismiss }: ShortcutHintProps) {
  useEffect(() => {
    if (!visible || !onDismiss) return;
    const timer = setTimeout(() => { onDismiss(); }, 3000);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div className="shortcut-hint" role="status" aria-live="polite" onClick={onDismiss}>
      <span className="shortcut-hint__message">{message}</span>
    </div>
  );
}
