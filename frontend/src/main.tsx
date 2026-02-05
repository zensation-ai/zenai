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

// Configure axios to use API key from environment or localStorage
axios.interceptors.request.use((config) => {
  const apiKey = safeLocalStorage('get', 'apiKey') || ENV_API_KEY;

  if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  } else if (import.meta.env.DEV) {
    console.warn('No API key configured. Set VITE_API_KEY in .env or localStorage.apiKey');
  }

  return config;
});

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
