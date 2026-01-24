import { useState, useCallback, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '../neurodesign.css';
import './ConfirmDialog.css';

// ===========================================
// Types
// ===========================================

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
  resolve: ((value: boolean) => void) | null;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

// ===========================================
// Context
// ===========================================

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// ===========================================
// Provider Component
// ===========================================

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    message: '',
    resolve: null,
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        ...options,
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, [state.resolve]);

  // Handle keyboard navigation and escape
  useEffect(() => {
    if (!state.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Tab') {
        // Trap focus within dialog
        const focusableElements = dialogRef.current?.querySelectorAll(
          'button:not([disabled])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the cancel button by default (safer option)
    cancelButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [state.isOpen, handleCancel]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (state.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [state.isOpen]);

  const variantClass = state.variant || 'danger';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.isOpen &&
        createPortal(
          <div
            className="confirm-dialog-overlay"
            onClick={handleCancel}
            role="presentation"
          >
            <div
              ref={dialogRef}
              className={`confirm-dialog liquid-glass neuro-human-fade-in confirm-dialog-${variantClass}`}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-message"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="confirm-dialog-title" className="confirm-dialog-title">
                {state.title || 'Bestätigung'}
              </h2>
              <p id="confirm-dialog-message" className="confirm-dialog-message">
                {state.message}
              </p>
              <div className="confirm-dialog-actions">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  className="confirm-dialog-button cancel neuro-press-effect neuro-focus-ring"
                  onClick={handleCancel}
                >
                  {state.cancelText || 'Abbrechen'}
                </button>
                <button
                  ref={confirmButtonRef}
                  type="button"
                  className={`confirm-dialog-button confirm neuro-button neuro-focus-ring confirm-${variantClass}`}
                  onClick={handleConfirm}
                >
                  {state.confirmText || 'Bestätigen'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

// ===========================================
// Hook
// ===========================================

/**
 * Hook to show confirmation dialogs
 *
 * @example
 * const confirm = useConfirm();
 *
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: 'Löschen',
 *     message: 'Möchtest du diesen Eintrag wirklich löschen?',
 *     confirmText: 'Löschen',
 *     variant: 'danger'
 *   });
 *   if (confirmed) {
 *     // perform delete
 *   }
 * };
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
}
