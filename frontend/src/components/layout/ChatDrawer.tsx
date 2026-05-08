/**
 * ChatDrawer — Resizable Right Drawer for Chat in Workspace Mode
 *
 * Slides in from the right when toggled open via TopBar.
 * Width is controlled by state.chatDrawerWidth (300-600px) with a drag handle.
 */

import { useRef, useCallback, useEffect, type ReactNode, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { useLayoutMode } from '../../contexts/LayoutModeContext';

interface ChatDrawerProps {
  children: ReactNode;
}

export function ChatDrawer({ children }: ChatDrawerProps) {
  const { state, dispatch } = useLayoutMode();
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = state.chatDrawerWidth;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [state.chatDrawerWidth]
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      // Dragging left edge: moving left increases width
      const delta = startX.current - e.clientX;
      const newWidth = startWidth.current + delta;
      dispatch({ type: 'SET_CHAT_DRAWER_WIDTH', width: newWidth });
    }

    function handleMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dispatch]);

  if (!state.chatDrawerOpen) return null;

  return (
    <aside
      className="relative h-full flex shrink-0 border-l border-border bg-bg max-md:hidden w-[var(--w)]"
      style={{ '--w': `${state.chatDrawerWidth}px` } as CSSProperties}
      aria-label="Chat"
    >
      {/* Drag handle on the left edge */}
      <div
        className="absolute -left-[3px] top-0 bottom-0 w-1.5 cursor-col-resize z-10 transition-[background] duration-150 hover:bg-primary/50"
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Chat-Breite ändern"
      />

      <div className="flex flex-col w-full h-full overflow-hidden">
        <header className="flex items-center justify-between px-3.5 py-2.5 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-text">Chat</span>
          <button
            className="flex items-center justify-center size-7 border-none rounded-md bg-transparent text-text-muted cursor-pointer transition-[background,color] duration-150 hover:bg-surface-hover hover:text-text"
            onClick={() => dispatch({ type: 'TOGGLE_CHAT_DRAWER' })}
            title="Chat schließen"
            aria-label="Chat schließen"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </aside>
  );
}

export default ChatDrawer;
