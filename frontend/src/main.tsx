import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import App from './App';
import './index.css';
import { safeLocalStorage } from './utils/storage';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { initializeNative } from './utils/native';
import { logError } from './utils/errors';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installResilienceInterceptors } from './utils/apiResilience';
import { initWebVitals } from './utils/webVitals';
// Phase 66: Sentry Error Tracking
import { initSentry } from './services/sentry';

// Phase 66: Initialize Sentry early (before any other code)
initSentry();

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

async function fetchCsrfToken(): Promise<void> {
  try {
    const { data } = await axios.get('/api/csrf-token');
    csrfToken = data.csrfToken;
  } catch {
    // CSRF is optional when API key auth is present; log only in dev
    if (import.meta.env.DEV) {
      console.warn('Could not fetch CSRF token (non-critical when using API key auth)');
    }
  }
}

// Fetch initial CSRF token
fetchCsrfToken();

// Configure axios interceptors
axios.interceptors.request.use((config) => {
  // Phase 56: Prefer JWT token over API key
  const jwtToken = safeLocalStorage('get', 'zenai_access_token');
  const apiKey = safeLocalStorage('get', 'apiKey') || ENV_API_KEY;

  if (jwtToken) {
    config.headers.Authorization = `Bearer ${jwtToken}`;
  } else if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  } else if (import.meta.env.DEV) {
    console.warn('No JWT token or API key configured.');
  }

  // Attach CSRF token to mutating requests (defense-in-depth)
  if (csrfToken && config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }

  return config;
});

// Handle 401 (expired JWT) and 403 (CSRF) errors with automatic retry
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // 401: If JWT was used but expired, clear it and retry with API key
    if (error.response?.status === 401 && !config._retryWithApiKey) {
      const jwtToken = safeLocalStorage('get', 'zenai_access_token');
      const apiKey = safeLocalStorage('get', 'apiKey') || ENV_API_KEY;

      if (jwtToken && apiKey) {
        // JWT was sent but rejected — clear expired token and retry with API key
        safeLocalStorage('remove', 'zenai_access_token');
        safeLocalStorage('remove', 'zenai_refresh_token');
        config._retryWithApiKey = true;
        config.headers.Authorization = `Bearer ${apiKey}`;
        return axios(config);
      }
    }

    // 403 CSRF: Refresh CSRF token and retry
    if (error.response?.status === 403 && error.response?.data?.error === 'CSRF_TOKEN_INVALID') {
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
                // New content available, show update notification
                
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
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
