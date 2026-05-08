/**
 * useTextSelection — tracks text selections inside .inline-assist-enabled containers.
 * Returns the selected text, its bounding rect, visibility state, and a dismiss function.
 * Debounced by 300ms to avoid excessive re-renders during selection drag.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TextSelectionState {
  text: string;
  rect: DOMRect | null;
  isVisible: boolean;
  dismiss: () => void;
}

export function useTextSelection(): TextSelectionState {
  const [text, setText] = useState('');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setText('');
    setRect(null);
    setIsVisible(false);
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        const selection = window.getSelection();

        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          setIsVisible(false);
          return;
        }

        const selectedText = selection.toString().trim();
        if (!selectedText) {
          setIsVisible(false);
          return;
        }

        // Check if the selection is inside an .inline-assist-enabled container
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element =
          container.nodeType === Node.TEXT_NODE
            ? container.parentElement
            : (container as Element);

        const enabledContainer = element?.closest('.inline-assist-enabled');
        if (!enabledContainer) {
          setIsVisible(false);
          return;
        }

        const boundingRect = range.getBoundingClientRect();
        setText(selectedText);
        setRect(boundingRect);
        setIsVisible(true);
      }, 300);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return { text, rect, isVisible, dismiss };
}
