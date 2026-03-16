import type { Express } from 'express';
import type { Module } from '../../core/module';
import { voiceRealtimeRouter } from '../../routes/voice-realtime';

export class VoiceModule implements Module {
  name = 'voice';

  registerRoutes(app: Express): void {
    // Phase 57: Real-Time Voice Pipeline
    app.use('/api', voiceRealtimeRouter);
  }

  async onStartup(): Promise<void> {
    // WebSocket initialization needs the HTTP server, handled separately in main.ts
  }
}
