import type { Express } from 'express';
import type { Module } from '../../core/module';
import { voiceMemoRouter } from '../../routes/voice-memo';
import { ideasRouter, ideasContextRouter } from '../../routes/ideas';
import { knowledgeGraphRouter } from '../../routes/knowledge-graph';
import { meetingsRouter, contextMeetingsRouter } from '../../routes/meetings';
import { userProfileRouter, userProfileContextRouter } from '../../routes/user-profile';
import { apiKeysRouter } from '../../routes/api-keys';
import { webhooksRouter } from '../../routes/webhooks';
import { integrationsRouter } from '../../routes/integrations';
import incubatorRouter from '../../routes/incubator';
import { contextsRouter } from '../../routes/contexts';
import { voiceMemoContextRouter } from '../../routes/voice-memo-context';
import mediaRouter from '../../routes/media';
import { syncRouter } from '../../routes/sync';
import { analyticsRouter } from '../../routes/analytics';
import { exportRouter } from '../../routes/export';
import { notificationsRouter } from '../../routes/notifications';
import { digestRouter } from '../../routes/digest';
// Side-effect import: registers advanced routes on analyticsRouter
import '../../routes/analytics-advanced';
import proactiveRouter from '../../routes/proactive';
import { visionRouter } from '../../routes/vision';
import { topicEnhancementRouter } from '../../routes/topic-enhancement';
import { memoryAdminRouter } from '../../routes/memory-admin';
import { voiceRouter } from '../../routes/voice';

export class CoreRoutesModule implements Module {
  name = 'core-routes';

  registerRoutes(app: Express): void {
    // Note: healthRouter is in HealthModule (registered first to avoid apiKeyAuth catch-all)
    app.use('/api/voice-memo', voiceMemoRouter);
    app.use('/api/ideas', ideasRouter);
    app.use('/api', ideasContextRouter);
    app.use('/api/knowledge-graph', knowledgeGraphRouter);
    app.use('/api/meetings', meetingsRouter);
    app.use('/api/:context/meetings', contextMeetingsRouter);
    app.use('/api/profile', userProfileRouter);
    app.use('/api', userProfileContextRouter);

    // Phase 4: Enterprise Integration Routes (webhooks registered after email webhooks)
    app.use('/api/keys', apiKeysRouter);
    // Note: emailWebhooksRouter is registered before this in EmailModule
    app.use('/api/webhooks', webhooksRouter);
    app.use('/api/integrations', integrationsRouter);

    // Phase 5: Thought Incubator
    app.use('/api/incubator', incubatorRouter);

    // Phase 6: Context-Aware Routes
    app.use('/api', contextsRouter);
    app.use('/api', voiceMemoContextRouter);

    // Phase 7: Media
    app.use('/api', mediaRouter);

    // Phase 10: Offline Sync
    app.use('/api', syncRouter);

    // Phase 10: Analytics
    app.use('/api', analyticsRouter);

    // Phase 18: Export System
    app.use('/api/export', exportRouter);

    // Phase 19: Push Notifications
    app.use('/api', notificationsRouter);

    // Phase 27: Proactive Intelligence System - MUST be before digestRouter
    app.use('/api/proactive', proactiveRouter);

    // Phase 20: Digest
    app.use('/api', digestRouter);

    // Phase 30: Memory Admin - HiMeS Memory Management
    app.use('/api/memory', memoryAdminRouter);

    // Phase 31: Vision Integration
    app.use('/api/vision', visionRouter);

    // Phase 31: Topic Enhancement
    app.use('/api/topics', topicEnhancementRouter);

    // Phase 33 Sprint 4: Voice/TTS Integration
    app.use('/api/voice', voiceRouter);
  }
}
