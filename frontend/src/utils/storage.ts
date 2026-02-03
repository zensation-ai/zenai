/**
 * Safely access localStorage
 * Handles private browsing mode, quota exceeded, and other edge cases
 */
export function safeLocalStorage(action: 'get' | 'set' | 'remove', key: string, value?: string): string | null {
  try {
    if (action === 'get') {
      return localStorage.getItem(key);
    } else if (action === 'set' && value !== undefined) {
      localStorage.setItem(key, value);
    } else if (action === 'remove') {
      localStorage.removeItem(key);
    }
  } catch (error) {
    // Silent fail - localStorage not available (private browsing, quota exceeded, etc.)
    console.debug('localStorage not available:', error);
  }
  return null;
}
