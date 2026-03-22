import { type ReactNode, useCallback, useRef } from 'react';
import { X, Pin, PinOff } from 'lucide-react';
import './PanelShell.css';

interface PanelShellProps {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  pinned: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  width: number;
  onResize: (width: number) => void;
  children: ReactNode;
}

export function PanelShell({
  title, icon: Icon, pinned, onClose, onTogglePin, width, onResize, children,
}: PanelShellProps) {
  const resizeRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      onResize(startWidth + delta);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onResize]);

  return (
    <div className="panel-shell" style={{ width }}>
      <div className="panel-shell__resize" ref={resizeRef} onMouseDown={handleMouseDown} />
      <div className="panel-shell__header">
        <div className="panel-shell__title">
          <Icon size={16} />
          <span>{title}</span>
        </div>
        <div className="panel-shell__actions">
          <button
            className="panel-shell__btn"
            onClick={onTogglePin}
            aria-label={pinned ? 'Panel lospinnen' : 'Panel anpinnen'}
          >
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button
            className="panel-shell__btn"
            onClick={onClose}
            aria-label="Panel schliessen"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="panel-shell__content">
        {children}
      </div>
    </div>
  );
}
