/**
 * Types and helpers for the Integrations Dashboard
 */

// Type-safe error extraction
export interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  const apiError = error as ApiError;
  return apiError.response?.data?.message || apiError.message || fallback;
}

export interface Integration {
  id: string;
  provider: string;
  name: string;
  description?: string;
  isEnabled: boolean;
  isConnected: boolean;
  features: string[];
  lastSyncAt?: string;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  errorMessage?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  isActive: boolean;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt?: string;
  failureCount: number;
}

export interface IntegrationsPageProps {
  onBack: () => void;
  embedded?: boolean;
}
