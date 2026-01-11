/**
 * Safely access localStorage
 * Handles private browsing mode, quota exceeded, and other edge cases
 */
export function safeLocalStorage(action: 'get' | 'set', key: string, value?: string): string | null {
  try {
    if (action === 'get') {
      return localStorage.getItem(key);
    } else if (action === 'set' && value !== undefined) {
      localStorage.setItem(key, value);
    }
  } catch (error) {
    // Silent fail - localStorage not available (private browsing, quota exceeded, etc.)
    console.debug('localStorage not available:', error);
  }
  return null;
}
