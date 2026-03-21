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
  } catch {
    // Silent fail - localStorage not available (private browsing, quota exceeded, etc.)
    // Intentionally silent: this fires frequently in private browsing/SSR and is non-actionable
  }
  return null;
}
