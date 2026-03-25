import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import App from './App';
import './styles/tailwind.css';
import './styles/animations.css';
import './styles/micro-interactions.css';
import './index.css';
import { safeLocalStorage } from './utils/storage';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { initializeNative } from './utils/native';
import { logError } from './utils/errors';
import { logger } from './utils/logger';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installResilienceInterceptors } from './utils/apiResilience';
import { initWebVitals } from './utils/webVitals';
// Phase 66: Sentry Error Tracking (lazy-loaded via requestIdleCallback)
import { initSentryLazy } from './services/sentry-lazy';
// Phase 76: React Query
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';

// Phase 66: Initialize Sentry after idle (keeps it off the critical path)
initSentryLazy();

// API configuration from environment
const ENV_API_KEY = import.meta.env.VITE_API_KEY;
const ENV_API_URL = import.meta.env.VITE_API_URL;

// Electron detection (inline check to avoid import order issues)
const isElectronApp = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

// Set base URL: Electron connects to localhost, web uses Railway backend
if (isElectronApp) {
  axios.defaults.baseURL = `http://localhost:${import.meta.env.VITE_BACKEND_PORT || '3000'}`;
} else if (ENV_API_URL) {
  axios.defaults.baseURL = ENV_API_URL;
}

// CSRF token management (defense-in-depth alongside API key auth)
let csrfToken: string | null = null;
let csrfFetchPromise: Promise<void> | null = null;

async function fetchCsrfToken(): Promise<void> {
  try {
    const { data } = await axios.get('/api/csrf-token');
    csrfToken = data.csrfToken;
  } catch {
    // CSRF is optional when API key auth is present; log only in dev
    if (import.meta.env.DEV) {
      logger.debug('Could not fetch CSRF token (non-critical when using API key auth)');
    }
  }
}

// Lazy CSRF: ensure token is fetched before first mutating request
async function ensureCsrfToken(): Promise<void> {
  if (csrfToken) return;
  if (!csrfFetchPromise) {
    csrfFetchPromise = fetchCsrfToken();
  }
  await csrfFetchPromise;
}

// Start fetching eagerly but don't block on it
csrfFetchPromise = fetchCsrfToken();

// Configure axios interceptors
axios.interceptors.request.use(async (config) => {
  // If this is a retry with API key (from 401 handler), don't overwrite the header
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((config as any)._retryWithApiKey || (config as any)._retryAfterRefresh) {
    // Auth header already set by the 401 retry handler — skip JWT override
  } else {
    // Phase 56: Prefer JWT token over API key
    const jwtToken = safeLocalStorage('get', 'zenai_access_token');
    const apiKey = safeLocalStorage('get', 'apiKey') || ENV_API_KEY;

    if (jwtToken) {
      config.headers.Authorization = `Bearer ${jwtToken}`;
    } else if (apiKey) {
      config.headers.Authorization = `Bearer ${apiKey}`;
    } else if (import.meta.env.DEV) {
      logger.warn('No JWT token or API key configured.');
    }
  }

  // Attach CSRF token to mutating requests (defense-in-depth)
  // Await token fetch to prevent race condition on app startup
  if (config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
    await ensureCsrfToken();
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }

  return config;
});

// Token refresh promise deduplication — prevents multiple parallel refresh attempts
let activeRefreshPromise: Promise<string | null> | null = null;

/**
 * Attempt to refresh JWT tokens. Deduplicates concurrent calls so only one
 * refresh request is in-flight at a time.
 */
async function tryRefreshToken(): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const refreshToken = safeLocalStorage('get', 'zenai_refresh_token');
      if (!refreshToken) return null;

      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        const { accessToken, refreshToken: newRefresh } = data.data;
        // Store new tokens so the next request picks them up
        safeLocalStorage('set', 'zenai_access_token', accessToken);
        safeLocalStorage('set', 'zenai_refresh_token', newRefresh);
        return accessToken as string;
      }
    } catch {
      // Refresh failed — fall through to API key fallback
    }
    return null;
  })();

  try {
    return await activeRefreshPromise;
  } finally {
    activeRefreshPromise = null;
  }
}

// Handle 401 (expired JWT) and 403 (CSRF) errors with automatic retry
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // 401: Try refreshing the JWT first, then fall back to API key
    if (error.response?.status === 401 && !config._retryWithApiKey && !config._retryAfterRefresh) {
      const isAuthEndpoint = config.url?.includes('/api/auth/');
      if (isAuthEndpoint) {
        return Promise.reject(error);
      }

      // Step 1: Try to refresh the JWT token
      const newToken = await tryRefreshToken();
      if (newToken) {
        config._retryAfterRefresh = true;
        config.headers.Authorization = `Bearer ${newToken}`;
        return axios(config);
      }

      // Step 2: Fall back to API key (safe for all methods since we couldn't refresh)
      const apiKey = safeLocalStorage('get', 'apiKey') || ENV_API_KEY;
      if (apiKey) {
        config._retryWithApiKey = true;
        config.headers.Authorization = `Bearer ${apiKey}`;
        return axios(config);
      }
    }

    // 403 CSRF: Refresh CSRF token and retry (once only — guard flag prevents infinite loop)
    if (error.response?.status === 403 && error.response?.data?.error === 'CSRF_TOKEN_INVALID' && !config._csrfRetried) {
      config._csrfRetried = true;
      await fetchCsrfToken();
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
        return axios(config);
      }
    }
    return Promise.reject(error);
  }
);

// Phase 7.1: Install resilience interceptors (retry + timeout + rate limit tracking)
installResilienceInterceptors();

// Global error listeners — catch unhandled errors and promise rejections
window.addEventListener('error', (event) => {
  logError('GlobalErrorListener', event.error ?? new Error(event.message));
});

window.addEventListener('unhandledrejection', (event) => {
  logError('UnhandledRejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
});

// Initialize native features (Capacitor)
initializeNative();

// Phase 7.5: Initialize Web Vitals monitoring (LCP, FID, CLS, INP, TTFB)
initWebVitals();

// Register Service Worker for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content available - dispatch event for UI notification
                window.dispatchEvent(new CustomEvent('sw-update-available', {
                  detail: { registration },
                }));
              }
            });
          }
        });
      })
      .catch((error) => {
        logError('PWA:serviceWorkerRegistration', error);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ThemeProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </ThemeProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
