/**
 * Integration Framework Types - Phase 1
 *
 * Type definitions for the generic connector infrastructure.
 * All integrations (Gmail, Calendar, Slack, etc.) implement these interfaces.
 */

export type IntegrationCategory = 'email' | 'calendar' | 'messaging' | 'storage' | 'crm' | 'dev';
export type AIContext = 'personal' | 'work' | 'learning' | 'creative';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'syncing';

export const SYNC_INTERVAL_MIN = 5;
export const SYNC_INTERVAL_MAX = 1440;
export const SYNC_INTERVAL_DEFAULT = 15;

export interface ConnectorDefinition {
  id: string;
  name: string;
  provider: string;
  category: IntegrationCategory;
  capabilities: string[];
  requiredScopes: string[];
  webhookSupported: boolean;
  syncSupported: boolean;
  defaultContext: AIContext;
  icon?: string;
  description?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: Date;
  scopes: string[];
}

export interface SyncOptions {
  fullSync?: boolean;
  since?: Date;
  targetContext?: AIContext;
}

export interface SyncResult {
  itemsSynced: number;
  errors: number;
  nextSyncToken?: string;
  duration: number;
}

export interface HealthStatus {
  connected: boolean;
  lastSync?: Date;
  error?: string;
  tokenValid: boolean;
  tokenExpiresAt?: Date;
}

export interface RawWebhookEvent {
  headers: Record<string, string>;
  body: Buffer | Record<string, unknown>;
}

export interface IntegrationEvent {
  id: string;
  connectorId: string;
  userId: string;
  type: string;
  targetContext: AIContext;
  payload: Record<string, unknown>;
  timestamp: Date;
}

export interface IntegrationConfig {
  targetContext: AIContext;
  syncEnabled: boolean;
  syncIntervalMinutes?: number;
}

export interface UserIntegration {
  connectorId: string;
  definition: ConnectorDefinition;
  status: IntegrationStatus;
  config: IntegrationConfig;
  lastSyncAt?: Date;
  error?: string;
}

export interface Connector {
  definition: ConnectorDefinition;

  /** Called after tokens are stored and user_integration row created. */
  connect(userId: string, tokens: OAuthTokens): Promise<void>;

  /** Called before tokens and user_integration row are deleted. */
  disconnect(userId: string): Promise<void>;

  /** MUST NOT throw. Errors counted in SyncResult.errors. */
  sync(userId: string, options: SyncOptions): Promise<SyncResult>;

  health(userId: string): Promise<HealthStatus>;

  /** Verify webhook signature and normalize event. Return null to ignore. */
  handleWebhook?(event: RawWebhookEvent): Promise<IntegrationEvent | null>;
}
