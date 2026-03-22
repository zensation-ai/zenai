export interface Module {
  name: string;

  /** Register routes on the provided Express app */
  registerRoutes(app: import('express').Express): void;

  /** Optional: async initialization (DB checks, schedulers, etc.) */
  onStartup?(): Promise<void>;

  /** Optional: cleanup on shutdown */
  onShutdown?(): Promise<void>;

  /** Optional: health check */
  healthCheck?(): Promise<{ healthy: boolean; details?: Record<string, unknown> }>;
}
