/**
 * Native Platform Utilities
 * Provides access to native device features via Capacitor
 */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Check if running on native platform (iOS/Android)
 */
export const isNative = Capacitor.isNativePlatform();

/**
 * Check specific platform
 */
export const isIOS = Capacitor.getPlatform() === 'ios';
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isWeb = Capacitor.getPlatform() === 'web';

/**
 * Haptic Feedback
 */
export const haptic = {
  /**
   * Light impact - for selections, toggles
   */
  light: async () => {
    if (isNative) {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  },

  /**
   * Medium impact - for confirmations, successful actions
   */
  medium: async () => {
    if (isNative) {
      await Haptics.impact({ style: ImpactStyle.Medium });
    }
  },

  /**
   * Heavy impact - for important actions, errors
   */
  heavy: async () => {
    if (isNative) {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    }
  },

  /**
   * Success notification
   */
  success: async () => {
    if (isNative) {
      await Haptics.notification({ type: NotificationType.Success });
    }
  },

  /**
   * Warning notification
   */
  warning: async () => {
    if (isNative) {
      await Haptics.notification({ type: NotificationType.Warning });
    }
  },

  /**
   * Error notification
   */
  error: async () => {
    if (isNative) {
      await Haptics.notification({ type: NotificationType.Error });
    }
  },
};

/**
 * Keyboard utilities
 */
export const keyboard = {
  /**
   * Hide the keyboard
   */
  hide: async () => {
    if (isNative) {
      await Keyboard.hide();
    }
  },

  /**
   * Show the keyboard
   */
  show: async () => {
    if (isNative) {
      await Keyboard.show();
    }
  },

  /**
   * Add keyboard show listener
   */
  onShow: (callback: (info: { keyboardHeight: number }) => void) => {
    if (isNative) {
      Keyboard.addListener('keyboardWillShow', callback);
    }
  },

  /**
   * Add keyboard hide listener
   */
  onHide: (callback: () => void) => {
    if (isNative) {
      Keyboard.addListener('keyboardWillHide', callback);
    }
  },
};

/**
 * Status bar utilities
 */
export const statusBar = {
  /**
   * Set dark status bar (light content)
   */
  setDark: async () => {
    if (isNative) {
      await StatusBar.setStyle({ style: Style.Dark });
    }
  },

  /**
   * Set light status bar (dark content)
   */
  setLight: async () => {
    if (isNative) {
      await StatusBar.setStyle({ style: Style.Light });
    }
  },

  /**
   * Hide status bar
   */
  hide: async () => {
    if (isNative) {
      await StatusBar.hide();
    }
  },

  /**
   * Show status bar
   */
  show: async () => {
    if (isNative) {
      await StatusBar.show();
    }
  },
};

/**
 * Splash screen utilities
 */
export const splashScreen = {
  /**
   * Hide splash screen
   */
  hide: async () => {
    if (isNative) {
      await SplashScreen.hide();
    }
  },

  /**
   * Show splash screen
   */
  show: async () => {
    if (isNative) {
      await SplashScreen.show();
    }
  },
};

/**
 * Initialize native features on app start
 */
export const initializeNative = async () => {
  if (!isNative) return;

  try {
    // Set dark status bar for our dark theme
    await statusBar.setDark();

    // Hide splash screen after app is ready
    await splashScreen.hide();

    console.log(`Running on ${Capacitor.getPlatform()} platform`);
  } catch (error) {
    console.error('Failed to initialize native features:', error);
  }
};
