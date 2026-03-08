import { safeLocalStorage } from './storage';

/**
 * Check if running inside Electron (without importing from electron.ts to avoid circular deps)
 */
const isElectronEnv = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

/**
 * Returns the API base URL.
 * - In Electron: always connects to localhost backend
 * - In web: uses VITE_API_URL environment variable
 * Use this for fetch() calls and <img src> URLs that can't go through axios.
 * Axios calls don't need this - they use axios.defaults.baseURL set in main.tsx.
 */
export function getApiBaseUrl(): string {
  if (isElectronEnv) {
    return `http://localhost:${import.meta.env.VITE_BACKEND_PORT || '3000'}`;
  }
  return import.meta.env.VITE_API_URL || '';
}

/**
 * Returns standard headers for fetch() calls.
 * Includes API key authentication matching the axios interceptor in main.tsx.
 */
export function getApiFetchHeaders(contentType?: string): Record<string, string> {
  const apiKey = safeLocalStorage('get', 'apiKey') || import.meta.env.VITE_API_KEY;
  const headers: Record<string, string> = {};

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return headers;
}
