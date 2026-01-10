import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App';
import './index.css';

// Default API key for local development
const DEFAULT_API_KEY = 'ab_live_4cb9e367f27f087e3252a1f2784999e875c538eb2d01e081';

// Set default API key if not already set
if (!localStorage.getItem('apiKey')) {
  localStorage.setItem('apiKey', DEFAULT_API_KEY);
}

// Configure axios to use API key from localStorage
axios.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem('apiKey') || DEFAULT_API_KEY;
  config.headers.Authorization = `Bearer ${apiKey}`;
  return config;
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
