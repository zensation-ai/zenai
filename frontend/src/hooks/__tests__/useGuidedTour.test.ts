/**
 * Unit Tests for useGuidedTour Hook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGuidedTour } from '../useGuidedTour';
import { TOUR_STEPS } from '../../components/GuidedTour/tour-steps';

describe('useGuidedTour', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts inactive', () => {
    const { result } = renderHook(() => useGuidedTour());
    expect(result.current.isActive).toBe(false);
  });

  it('starts at step 0', () => {
    const { result } = renderHook(() => useGuidedTour());
    expect(result.current.currentStep).toBe(0);
  });

  it('reports correct totalSteps', () => {
    const { result } = renderHook(() => useGuidedTour());
    expect(result.current.totalSteps).toBe(TOUR_STEPS.length);
  });

  it('start() activates tour at step 0', () => {
    const { result } = renderHook(() => useGuidedTour());
    act(() => result.current.start());
    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStep).toBe(0);
  });

  it('next() advances to step 1', () => {
    const { result } = renderHook(() => useGuidedTour());
    act(() => result.current.start());
    act(() => result.current.next());
    expect(result.current.currentStep).toBe(1);
  });

  it('back() decrements step', () => {
    const { result } = renderHook(() => useGuidedTour());
    act(() => result.current.start());
    act(() => result.current.next());
    act(() => result.current.back());
    expect(result.current.currentStep).toBe(0);
  });

  it('back() does nothing on first step', () => {
    const { result } = renderHook(() => useGuidedTour());
    act(() => result.current.start());
    act(() => result.current.back());
    expect(result.current.currentStep).toBe(0);
  });

  it('skip() deactivates tour', () => {
    const { result } = renderHook(() => useGuidedTour());
    act(() => result.current.start());
    act(() => result.current.skip());
    expect(result.current.isActive).toBe(false);
  });

  it('skip() persists completion to localStorage', () => {
    const { result } = renderHook(() => useGuidedTour());
    act(() => result.current.start());
    act(() => result.current.skip());
    expect(localStorage.getItem('zenai_tour_completed')).toBe('true');
  });

  it('isCompleted reflects localStorage value', () => {
    localStorage.setItem('zenai_tour_completed', 'true');
    const { result } = renderHook(() => useGuidedTour());
    expect(result.current.isCompleted).toBe(true);
  });

  it('completing tour on last step deactivates and persists', () => {
    const { result } = renderHook(() => useGuidedTour());
    act(() => result.current.start());

    // Advance to last step
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      act(() => result.current.next());
    }
    expect(result.current.currentStep).toBe(TOUR_STEPS.length - 1);

    // Calling next on last step completes the tour
    act(() => result.current.next());
    expect(result.current.isActive).toBe(false);
    expect(localStorage.getItem('zenai_tour_completed')).toBe('true');
  });

  it('step matches current TOUR_STEPS index', () => {
    const { result } = renderHook(() => useGuidedTour());
    act(() => result.current.start());
    act(() => result.current.next());
    expect(result.current.step).toBe(TOUR_STEPS[1]);
  });
});
