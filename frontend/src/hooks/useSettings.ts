import { useState, useCallback } from 'react';
import { safeLocalStorage } from '../utils/storage';

export interface AppSettings {
  theme: 'dark' | 'light' | 'auto';
  language: 'de' | 'en';
  startPage: 'home' | 'ideas' | 'insights';
  aiModel: 'claude-sonnet' | 'claude-haiku' | 'ollama';
  proactiveSuggestions: boolean;
  memorySystem: boolean;
  dataProcessing: boolean;
  cockpitMode: boolean;
}

const STORAGE_KEY = 'zenai-settings';

const DEFAULTS: AppSettings = {
  theme: 'dark',
  language: 'de',
  startPage: 'home',
  aiModel: 'claude-sonnet',
  proactiveSuggestions: true,
  memorySystem: true,
  dataProcessing: true,
  cockpitMode: false,
};

function loadSettings(): AppSettings {
  const raw = safeLocalStorage('get', STORAGE_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      safeLocalStorage('set', STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSetting } as const;
}
