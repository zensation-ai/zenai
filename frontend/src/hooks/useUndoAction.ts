import { useCallback, useRef } from 'react';
import { showToast } from '../components/Toast';

interface UndoActionParams {
  optimisticRemove: () => void;
  executeAction: () => Promise<void>;
  undoRestore: () => void;
  message: string;
  duration?: number;
}

export function useUndoAction() {
  const cancelledRef = useRef(false);

  return useCallback(({
    optimisticRemove,
    executeAction,
    undoRestore,
    message,
    duration = 5000,
  }: UndoActionParams) => {
    cancelledRef.current = false;
    optimisticRemove();

    showToast(message, {
      type: 'info',
      duration,
      undoLabel: 'Rückgängig',
      onUndo: () => {
        cancelledRef.current = true;
        undoRestore();
      },
    });

    setTimeout(() => {
      if (!cancelledRef.current) {
        executeAction().catch(() => {
          undoRestore();
          showToast('Aktion fehlgeschlagen', 'error');
        });
      }
    }, duration);
  }, []);
}
