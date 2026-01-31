import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.zensation.mybrain',
  appName: 'My Brain',
  webDir: 'dist',
  server: {
    // Production: Use Railway backend
    // The web assets are bundled in the app, API calls go to production
    androidScheme: 'https',
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
