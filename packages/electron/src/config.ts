import ElectronStore from 'electron-store';
import { DEFAULT_API_PORT, DEFAULT_FRONTEND_PORT } from '@zenai/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActiveContext = 'personal' | 'work' | 'learning' | 'creative';
export type DockMode = 'spotlight' | 'menubar' | 'both';

export interface AppConfig {
  /** URL of the cloud/remote ZenAI backend */
  cloudBackendUrl: string;
  /** Port used by the locally spawned backend process */
  localBackendPort: number;
  /** Global shortcut that opens the spotlight overlay */
  spotlightShortcut: string;
  /** Global shortcut that opens the search overlay */
  searchShortcut: string;
  /** How the app attaches to the desktop shell */
  dockMode: DockMode;
  /** Interval (ms) between backend health-check pings */
  healthCheckInterval: number;
  /** Vite dev-server port when running in development */
  frontendDevPort: number;
  /** Which ZenAI context is currently active */
  activeContext: ActiveContext;
  /** How long (ms) to wait for the local backend to start before giving up */
  localBackendStartupTimeout: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: AppConfig = {
  cloudBackendUrl: 'https://ki-ab-production.up.railway.app',
  localBackendPort: DEFAULT_API_PORT,
  spotlightShortcut: 'CommandOrControl+Space',
  searchShortcut: 'CommandOrControl+Shift+F',
  dockMode: 'spotlight',
  healthCheckInterval: 30_000,
  frontendDevPort: DEFAULT_FRONTEND_PORT,
  activeContext: 'personal',
  localBackendStartupTimeout: 30_000,
};

// ─── Environment variable overrides ──────────────────────────────────────────

/**
 * Maps each AppConfig key to an optional environment variable name.
 * When the env var is present at the time createConfig() is called, its value
 * takes precedence over both the persisted store value and the default.
 */
export const ENV_MAP: Partial<Record<keyof AppConfig, string>> = {
  cloudBackendUrl: 'ZENAI_CLOUD_BACKEND_URL',
  localBackendPort: 'ZENAI_LOCAL_BACKEND_PORT',
  spotlightShortcut: 'ZENAI_SPOTLIGHT_SHORTCUT',
  searchShortcut: 'ZENAI_SEARCH_SHORTCUT',
  dockMode: 'ZENAI_DOCK_MODE',
  healthCheckInterval: 'ZENAI_HEALTH_CHECK_INTERVAL',
  frontendDevPort: 'ZENAI_FRONTEND_DEV_PORT',
  activeContext: 'ZENAI_ACTIVE_CONTEXT',
  localBackendStartupTimeout: 'ZENAI_LOCAL_BACKEND_STARTUP_TIMEOUT',
};

// ─── Internal store interface ──────────────────────────────────────────────────
// Abstracts over ElectronStore so tests can inject a compatible mock.

interface InternalStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

// ─── ConfigStore interface ────────────────────────────────────────────────────

export interface ConfigStore {
  get<K extends keyof AppConfig>(key: K): AppConfig[K];
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void;
  getAll(): AppConfig;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a ConfigStore backed by electron-store with:
 *  1. Compile-time defaults from DEFAULT_CONFIG
 *  2. Values persisted across app launches via electron-store
 *  3. Runtime environment variable overrides applied at creation time
 */
export function createConfig(): ConfigStore {
  // electron-store instance; cast to InternalStore for safe key-value access.
  const raw = new ElectronStore<AppConfig>({ defaults: DEFAULT_CONFIG }) as unknown as InternalStore;

  // Apply environment variable overrides into the store at startup.
  for (const [configKey, envVar] of Object.entries(ENV_MAP) as [keyof AppConfig, string][]) {
    const envValue = process.env[envVar];
    if (envValue === undefined) continue;

    const defaultValue = DEFAULT_CONFIG[configKey];

    if (typeof defaultValue === 'number') {
      const parsed = Number(envValue);
      if (!isNaN(parsed)) {
        raw.set(configKey, parsed);
      }
    } else {
      raw.set(configKey, envValue);
    }
  }

  return {
    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
      return raw.get(key as string) as AppConfig[K];
    },

    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
      raw.set(key as string, value);
    },

    getAll(): AppConfig {
      const result = {} as Record<string, unknown>;
      for (const key of Object.keys(DEFAULT_CONFIG) as (keyof AppConfig)[]) {
        result[key as string] = raw.get(key as string);
      }
      return result as unknown as AppConfig;
    },
  };
}
