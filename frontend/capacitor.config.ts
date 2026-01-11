import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.personalai.brain',
  appName: 'Personal AI Brain',
  webDir: 'dist',
  server: {
    // For development: connect to local backend
    // Remove or change for production
    url: process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : undefined,
    cleartext: true, // Allow HTTP for local development
  },
  ios: {
    // iOS-specific settings
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
    // Disable web view bounce for more native feel
    backgroundColor: '#0a0f14',
  },
  plugins: {
    // Keyboard plugin settings
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    // Status bar settings
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0f14',
    },
    // Splash screen settings
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0f14',
      showSpinner: false,
    },
  },
};

export default config;
