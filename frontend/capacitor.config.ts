import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.personal.aibrain',
  appName: 'ZenAI',
  webDir: 'dist',
  server: {
    // Live URL mode: loads directly from Vercel production
    // Every Vercel deploy = instant update on iPhone (no rebuild needed)
    url: process.env.VITE_APP_URL || 'https://frontend-mu-six-93.vercel.app',
    cleartext: false,
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
    preferredContentMode: 'mobile',
    backgroundColor: '#0a0f14',
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0f14',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0f14',
      showSpinner: false,
    },
  },
};

export default config;
