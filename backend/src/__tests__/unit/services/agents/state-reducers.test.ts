/**
 * Tests for Phase 129: Reducer-Driven State Management
 *
 * Covers BUILT_IN_REDUCERS, applyReducer, applyBatchReducers, getReducerForKey
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  BUILT_IN_REDUCERS,
  DEFAULT_KEY_REDUCERS,
  applyReducer,
  applyBatchReducers,
  getReducerForKey,
} from '../../../../services/agents/state-reducers';

describe('BUILT_IN_REDUCERS', () => {
  describe('append', () => {
    it('concatenates two arrays', () => {
      const result = BUILT_IN_REDUCERS.append(['a', 'b'], ['c', 'd']);
      expect(result).toEqual(['a', 'b', 'c', 'd']);
    });

    it('wraps non-array update in array and appends', () => {
      const result = BUILT_IN_REDUCERS.append(['a'], 'b');
      expect(result).toEqual(['a', 'b']);
    });

    it('treats non-array current as empty array base', () => {
      const result = BUILT_IN_REDUCERS.append(null, ['x', 'y']);
      expect(result).toEqual(['x', 'y']);
    });

    it('wraps both non-arrays', () => {
      const result = BUILT_IN_REDUCERS.append('a', 'b');
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('replace', () => {
    it('returns the update value, discarding current', () => {
      expect(BUILT_IN_REDUCERS.replace('old', 'new')).toBe('new');
    });

    it('replaces object with new object', () => {
      const update = { x: 1 };
      expect(BUILT_IN_REDUCERS.replace({ y: 2 }, update)).toBe(update);
    });

    it('replaces with null update', () => {
      expect(BUILT_IN_REDUCERS.replace('something', null)).toBeNull();
    });
  });

  describe('max', () => {
    it('returns the larger number', () => {
      expect(BUILT_IN_REDUCERS.max(3, 7)).toBe(7);
    });

    it('returns current when it is larger', () => {
      expect(BUILT_IN_REDUCERS.max(9, 2)).toBe(9);
    });

    it('treats non-number current as 0', () => {
      expect(BUILT_IN_REDUCERS.max(null, 5)).toBe(5);
    });

    it('treats non-number update as 0', () => {
      expect(BUILT_IN_REDUCERS.max(5, null)).toBe(5);
    });
  });

  describe('min', () => {
    it('returns the smaller number', () => {
      expect(BUILT_IN_REDUCERS.min(3, 7)).toBe(3);
    });

    it('returns update when it is smaller', () => {
      expect(BUILT_IN_REDUCERS.min(9, 2)).toBe(2);
    });

    it('treats non-number current as Infinity', () => {
      expect(BUILT_IN_REDUCERS.min(null, 5)).toBe(5);
    });
  });

  describe('merge', () => {
    it('merges two objects shallowly', () => {
      const result = BUILT_IN_REDUCERS.merge({ a: 1, b: 2 }, { b: 3, c: 4 });
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('treats non-object current as empty object', () => {
      const result = BUILT_IN_REDUCERS.merge(null, { x: 1 });
      expect(result).toEqual({ x: 1 });
    });

    it('treats non-object update as empty object', () => {
      const result = BUILT_IN_REDUCERS.merge({ a: 1 }, null);
      expect(result).toEqual({ a: 1 });
    });
  });

  describe('increment', () => {
    it('adds update to current', () => {
      expect(BUILT_IN_REDUCERS.increment(3, 2)).toBe(5);
    });

    it('defaults update to 1 when not a number', () => {
      expect(BUILT_IN_REDUCERS.increment(4, null)).toBe(5);
    });

    it('starts from 0 when current is not a number', () => {
      expect(BUILT_IN_REDUCERS.increment(null, 3)).toBe(3);
    });
  });
});

describe('getReducerForKey', () => {
  it('returns append for findings', () => {
    expect(getReducerForKey('findings')).toBe('append');
  });

  it('returns replace for summary', () => {
    expect(getReducerForKey('summary')).toBe('replace');
  });

  it('returns max for confidence', () => {
    expect(getReducerForKey('confidence')).toBe('max');
  });

  it('returns replace as default for unknown keys', () => {
    expect(getReducerForKey('unknownRandomKey')).toBe('replace');
  });
});

describe('applyReducer', () => {
  it('uses explicit reducerName when provided', () => {
    const result = applyReducer('anything', ['a'], ['b'], 'append');
    expect(result).toEqual(['a', 'b']);
  });

  it('uses DEFAULT_KEY_REDUCERS when no override given', () => {
    // findings → append
    const result = applyReducer('findings', ['existing'], ['new']);
    expect(result).toEqual(['existing', 'new']);
  });

  it('falls back to replace for unknown key without override', () => {
    const result = applyReducer('randomKey', 'old', 'new');
    expect(result).toBe('new');
  });

  it('override takes precedence over key default', () => {
    // summary default is replace, but we force append
    const result = applyReducer('summary', ['old'], ['new'], 'append');
    expect(result).toEqual(['old', 'new']);
  });
});

describe('applyBatchReducers', () => {
  it('applies reducers for each key in updates', () => {
    const current = { findings: ['a'], confidence: 0.5 };
    const updates = { findings: ['b'], confidence: 0.8 };
    const result = applyBatchReducers(current, updates);
    expect(result.findings).toEqual(['a', 'b']);
    expect(result.confidence).toBe(0.8);
  });

  it('does not modify the original currentState (immutability)', () => {
    const current = { findings: ['a'] };
    const updates = { findings: ['b'] };
    applyBatchReducers(current, updates);
    expect(current.findings).toEqual(['a']);
  });

  it('respects reducerOverrides per key', () => {
    const current = { summary: 'old summary' };
    const updates = { summary: 'new summary' };
    // Force append instead of replace
    const result = applyBatchReducers(current, updates, { summary: 'append' });
    expect(result.summary).toEqual(['old summary', 'new summary']);
  });

  it('carries over current keys not present in updates', () => {
    const current = { findings: ['a'], conclusion: 'done' };
    const updates = { findings: ['b'] };
    const result = applyBatchReducers(current, updates);
    expect(result.conclusion).toBe('done');
  });

  it('adds new keys from updates that do not exist in current', () => {
    const current = {};
    const updates = { stepCount: 1 };
    const result = applyBatchReducers(current, updates);
    expect(result.stepCount).toBe(1);
  });
});
