import type { Express } from 'express';
import type { Module } from '../../core/module';
import { generalChatRouter } from '../../routes/general-chat';
import { personalizationChatRouter } from '../../routes/personalization-chat';

export class ChatModule implements Module {
  name = 'chat';

  registerRoutes(app: Express): void {
    // Phase 29: General Chat - Must be before context-aware routes
    app.use('/api/chat', generalChatRouter);
    // Phase 21: Personalization Chat
    app.use('/api/personalization', personalizationChatRouter);
  }
}
