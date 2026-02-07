import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import App from './App';
import './index.css';
import { safeLocalStorage } from './utils/storage';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ThemeProvider } from './contexts/ThemeContext';
import { initializeNative } from './utils/native';
import { logError } from './utils/errors';

// API configuration from environment
const ENV_API_KEY = import.meta.env.VITE_API_KEY;
const ENV_API_URL = import.meta.env.VITE_API_URL;

// Set base URL for production (Railway backend)
if (ENV_API_URL) {
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
  // API key authentication
  const apiKey = safeLocalStorage('get', 'apiKey') || ENV_API_KEY;
  if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  } else if (import.meta.env.DEV) {
    console.warn('No API key configured. Set VITE_API_KEY in .env or localStorage.apiKey');
  }

  // Attach CSRF token to mutating requests (defense-in-depth)
  if (csrfToken && config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }

  return config;
});

// Refresh CSRF token on 403 CSRF errors
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 403 && error.response?.data?.error === 'CSRF_TOKEN_INVALID') {
      await fetchCsrfToken();
      // Retry the original request with the new token
      if (csrfToken) {
        error.config.headers['X-CSRF-Token'] = csrfToken;
        return axios(error.config);
      }
    }
    return Promise.reject(error);
  }
);

// Initialize native features (Capacitor)
initializeNative();

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
    <BrowserRouter>
      <ThemeProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
