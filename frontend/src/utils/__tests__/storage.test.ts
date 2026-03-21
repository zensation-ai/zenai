/**
 * Unit Tests for storage utilities
 *
 * Tests safeLocalStorage function:
 * - get/set/remove operations
 * - Error handling (QuotaExceeded, SecurityError)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeLocalStorage } from '../storage';

describe('safeLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('get action', () => {
    it('returns stored value', () => {
      localStorage.setItem('test-key', 'test-value');
      expect(safeLocalStorage('get', 'test-key')).toBe('test-value');
    });

    it('returns null when key does not exist', () => {
      expect(safeLocalStorage('get', 'nonexistent')).toBeNull();
    });
  });

  describe('set action', () => {
    it('stores value in localStorage', () => {
      safeLocalStorage('set', 'test-key', 'test-value');
      expect(localStorage.getItem('test-key')).toBe('test-value');
    });

    it('does not set when value is undefined', () => {
      safeLocalStorage('set', 'test-key');
      expect(localStorage.getItem('test-key')).toBeNull();
    });

    it('overwrites existing value', () => {
      localStorage.setItem('test-key', 'old');
      safeLocalStorage('set', 'test-key', 'new');
      expect(localStorage.getItem('test-key')).toBe('new');
    });
  });

  describe('remove action', () => {
    it('removes key from localStorage', () => {
      localStorage.setItem('test-key', 'value');
      safeLocalStorage('remove', 'test-key');
      expect(localStorage.getItem('test-key')).toBeNull();
    });

    it('does not throw when removing nonexistent key', () => {
      expect(() => safeLocalStorage('remove', 'nonexistent')).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('returns null on localStorage getItem error', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });

      // Silent catch — intentionally no logging (fires frequently in private browsing)
      expect(safeLocalStorage('get', 'key')).toBeNull();
    });

    it('returns null on localStorage setItem error', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      expect(safeLocalStorage('set', 'key', 'value')).toBeNull();
    });

    it('returns null on localStorage removeItem error', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });

      expect(safeLocalStorage('remove', 'key')).toBeNull();
    });
  });
});
