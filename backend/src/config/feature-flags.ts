// backend/src/config/feature-flags.ts

export const FEATURES = {
  /** Phase A: Core multi-tenancy data model and API */
  MULTI_TENANCY_ENABLED: process.env.MULTI_TENANCY_ENABLED === 'true',
  /** Phase C: Billing at org/workspace level */
  WORKSPACE_BILLING: process.env.WORKSPACE_BILLING === 'true',
  /** Phase D: Custom context names beyond the 4 defaults */
  CUSTOM_CONTEXTS: process.env.CUSTOM_CONTEXTS === 'true',
  /** Phase D: Search across workspaces */
  CROSS_WORKSPACE_SEARCH: process.env.CROSS_WORKSPACE_SEARCH === 'true',
};
