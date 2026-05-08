import type { Express } from 'express';
import type { Module } from '../../core/module';
import { generalChatRouter } from '../../routes/general-chat';
import { personalizationChatRouter } from '../../routes/personalization-chat';
import { initLLMCache } from '../../services/llm-cache';
import { getRedisClient } from '../../utils/cache';
import { logger } from '../../utils/logger';

export class ChatModule implements Module {
  name = 'chat';

  registerRoutes(app: Express): void {
    // Phase 29: General Chat - Must be before context-aware routes
    app.use('/api/chat', generalChatRouter);
    // Phase 21: Personalization Chat
    app.use('/api/personalization', personalizationChatRouter);
  }

  async onStartup(): Promise<void> {
    // V4: Initialize LLM response cache with Redis (if available)
    const redis = getRedisClient();
    if (redis) {
      initLLMCache(redis as unknown as Parameters<typeof initLLMCache>[0]);
      logger.info('[ChatModule] LLM response cache initialized with Redis');
    } else {
      logger.info('[ChatModule] LLM response cache disabled (no Redis)');
    }
  }
}
