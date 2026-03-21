/**
 * Tests for usePlanFeatures hook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlanFeatures } from '../usePlanFeatures';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('usePlanFeatures', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns free tier by default (no token, no demo flag)', () => {
    const { result } = renderHook(() => usePlanFeatures());
    expect(result.current.tier).toBe('free');
    expect(result.current.isDemo).toBe(false);
  });

  it('returns pro tier in demo mode', () => {
    localStorageMock.setItem('zenai_demo', 'true');
    const { result } = renderHook(() => usePlanFeatures());
    expect(result.current.tier).toBe('pro');
    expect(result.current.isDemo).toBe(true);
  });

  it('free tier has correct credit limits', () => {
    const { result } = renderHook(() => usePlanFeatures());
    const { features } = result.current;
    expect(features.monthlyCredits).toBe(50);
    expect(features.contexts).toBe(1);
    expect(features.advancedRag).toBe(false);
    expect(features.multiAgent).toBe(false);
  });

  it('pro tier has 2000 monthly credits and all features', () => {
    localStorageMock.setItem('zenai_demo', 'true');
    const { result } = renderHook(() => usePlanFeatures());
    const { features } = result.current;
    expect(features.monthlyCredits).toBe(2000);
    expect(features.contexts).toBe(4);
    expect(features.advancedRag).toBe(true);
    expect(features.multiAgent).toBe(true);
    expect(features.voiceChat).toBe(true);
    expect(features.codeExecution).toBe(true);
  });

  it('enterprise tier has unlimited credits', () => {
    // Simulate enterprise JWT claim
    const payload = btoa(JSON.stringify({ plan: 'enterprise' }));
    const fakeToken = `header.${payload}.sig`;
    localStorageMock.setItem('zenai_token', fakeToken);
    const { result } = renderHook(() => usePlanFeatures());
    const { features } = result.current;
    expect(features.monthlyCredits).toBe('unlimited');
    expect(features.contexts).toBe(4);
  });

  it('hasPlan returns true when user has exact tier', () => {
    const { result } = renderHook(() => usePlanFeatures());
    expect(result.current.hasPlan('free')).toBe(true);
  });

  it('hasPlan returns false when user tier is below minimum', () => {
    const { result } = renderHook(() => usePlanFeatures());
    expect(result.current.hasPlan('pro')).toBe(false);
    expect(result.current.hasPlan('enterprise')).toBe(false);
  });

  it('hasPlan returns true for lower tiers in pro mode', () => {
    localStorageMock.setItem('zenai_demo', 'true');
    const { result } = renderHook(() => usePlanFeatures());
    expect(result.current.hasPlan('free')).toBe(true);
    expect(result.current.hasPlan('pro')).toBe(true);
    expect(result.current.hasPlan('enterprise')).toBe(false);
  });
});
