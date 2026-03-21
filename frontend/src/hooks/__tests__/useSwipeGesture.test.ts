import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSwipeHandlers } from '../useSwipeGesture';

describe('useSwipeHandlers', () => {
  it('returns touch handlers', () => {
    const { result } = renderHook(() =>
      useSwipeHandlers({ onSwipeLeft: vi.fn() })
    );
    expect(result.current.onTouchStart).toBeDefined();
    expect(result.current.onTouchEnd).toBeDefined();
  });

  it('both handlers are functions', () => {
    const { result } = renderHook(() =>
      useSwipeHandlers({ onSwipeLeft: vi.fn(), onSwipeRight: vi.fn() })
    );
    expect(typeof result.current.onTouchStart).toBe('function');
    expect(typeof result.current.onTouchEnd).toBe('function');
  });
});
