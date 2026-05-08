/**
 * Sprint 1.2 — Content-Moderation-Middleware
 * Sprint 1.10 — consolidated behind `moderation-factory.ts`.
 *
 * This file now re-exports the factory's public surface so older imports
 * keep compiling while the three moderated routes (chat, email, social)
 * move onto `createModerationMiddleware()`.
 */

export {
  createModerationMiddleware,
  extractFromFields,
  type ModerationDomain,
  type ModerationFactoryOptions,
} from './moderation-factory';
