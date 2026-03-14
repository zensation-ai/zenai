/**
 * Voice WebSocket Signaling Server
 *
 * WebSocket-based signaling for real-time voice communication.
 * Handles audio streaming, VAD status, and transcript delivery.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { logger } from '../../utils/logger';
import { voicePipeline } from './voice-pipeline';
import type { VADResult } from './turn-taking';

// ============================================================
// Types
// ============================================================

export interface SignalingMessage {
  type:
    | 'join'
    | 'audio'
    | 'config'
    | 'transcript'
    | 'response_audio'
    | 'response_text'
    | 'vad'
    | 'error'
    | 'session_start'
    | 'session_end'
    | 'ping'
    | 'pong';
  sessionId?: string;
  data?: unknown;
}

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

// ============================================================
// Voice Signaling Server
// ============================================================

export class VoiceSignalingServer {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, WebSocket> = new Map(); // sessionId -> ws

  /**
   * Attach to existing HTTP server
   */
  initialize(server: http.Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/voice',
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    logger.info('Voice WebSocket server initialized on /ws/voice', {
      operation: 'voice-signaling',
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const context = (url.searchParams.get('context') || 'personal') as AIContext;

    let sessionId: string | null = null;

    logger.info('Voice WebSocket connection established', {
      context,
      operation: 'voice-signaling',
    });

    ws.on('message', async (rawData: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const data = Buffer.isBuffer(rawData)
          ? rawData.toString('utf-8')
          : rawData instanceof ArrayBuffer
            ? Buffer.from(rawData).toString('utf-8')
            : Buffer.concat(rawData as Buffer[]).toString('utf-8');

        const message: SignalingMessage = JSON.parse(data);
        await this.handleMessage(ws, sessionId || '', context, message, (id) => {
          sessionId = id;
        });
      } catch (error) {
        logger.error('Voice WebSocket message parse error', error instanceof Error ? error : undefined, {
          operation: 'voice-signaling',
        });
        this.sendJSON(ws, {
          type: 'error',
          data: { message: 'Invalid message format' },
        });
      }
    });

    ws.on('close', async () => {
      if (sessionId) {
        try {
          await voicePipeline.endSession(sessionId);
        } catch {
          // Ignore cleanup errors
        }
        this.connections.delete(sessionId);
      }
      logger.info('Voice WebSocket connection closed', {
        sessionId,
        operation: 'voice-signaling',
      });
    });

    ws.on('error', (error) => {
      logger.error('Voice WebSocket error', error, {
        sessionId,
        operation: 'voice-signaling',
      });
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(
    ws: WebSocket,
    currentSessionId: string,
    context: AIContext,
    message: SignalingMessage,
    setSessionId: (id: string) => void
  ): Promise<void> {
    switch (message.type) {
      case 'ping': {
        this.sendJSON(ws, { type: 'pong' });
        break;
      }

      case 'join': {
        try {
          const config = (message.data && typeof message.data === 'object')
            ? message.data as Record<string, unknown>
            : {};
          const result = await voicePipeline.startSession(context, {
            sttProvider: config.sttProvider as string | undefined,
            ttsProvider: config.ttsProvider as string | undefined,
            ttsVoice: config.ttsVoice as string | undefined,
            language: config.language as string | undefined,
            silenceThreshold_ms: config.silenceThreshold_ms as number | undefined,
          });

          setSessionId(result.sessionId);
          this.connections.set(result.sessionId, ws);

          this.sendJSON(ws, {
            type: 'session_start',
            sessionId: result.sessionId,
            data: {
              chatSessionId: result.chatSessionId,
            },
          });
        } catch (error) {
          this.sendJSON(ws, {
            type: 'error',
            data: {
              message: `Failed to start session: ${error instanceof Error ? error.message : String(error)}`,
            },
          });
        }
        break;
      }

      case 'audio': {
        if (!currentSessionId) {
          this.sendJSON(ws, {
            type: 'error',
            data: { message: 'No active session. Send "join" first.' },
          });
          return;
        }

        try {
          // Decode base64 audio
          const audioData = message.data as { audio?: string } | undefined;
          if (!audioData?.audio) {
            this.sendJSON(ws, {
              type: 'error',
              data: { message: 'Missing audio data' },
            });
            return;
          }

          const audioBuffer = Buffer.from(audioData.audio, 'base64');

          // Process audio chunk through pipeline
          const result = await voicePipeline.processAudioChunk(currentSessionId, audioBuffer);

          // Always send VAD status
          this.sendJSON(ws, {
            type: 'vad',
            sessionId: currentSessionId,
            data: {
              isSpeaking: result.vad.isSpeaking,
              volume: result.vad.volume,
              silenceDuration_ms: result.vad.silenceDuration_ms,
              turnComplete: result.vad.turnComplete,
            },
          });

          // Send transcript if available
          if (result.transcript !== undefined) {
            this.sendJSON(ws, {
              type: 'transcript',
              sessionId: currentSessionId,
              data: { text: result.transcript },
            });
          }

          // Send response text if available
          if (result.responseText) {
            this.sendJSON(ws, {
              type: 'response_text',
              sessionId: currentSessionId,
              data: { text: result.responseText },
            });
          }

          // Send response audio if available
          if (result.responseAudio && result.responseAudio.length > 0) {
            for (const audioChunk of result.responseAudio) {
              this.sendJSON(ws, {
                type: 'response_audio',
                sessionId: currentSessionId,
                data: { audio: audioChunk.toString('base64') },
              });
            }
          }
        } catch (error) {
          this.sendJSON(ws, {
            type: 'error',
            sessionId: currentSessionId,
            data: {
              message: `Audio processing failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          });
        }
        break;
      }

      case 'config': {
        if (!currentSessionId) return;
        // Config updates could be applied to the session
        logger.info('Voice session config update', {
          sessionId: currentSessionId,
          config: message.data,
          operation: 'voice-signaling',
        });
        break;
      }

      default: {
        this.sendJSON(ws, {
          type: 'error',
          data: { message: `Unknown message type: ${message.type}` },
        });
      }
    }
  }

  /**
   * Send audio response to client
   */
  sendAudioToClient(sessionId: string, audio: Buffer): void {
    const ws = this.connections.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendJSON(ws, {
        type: 'response_audio',
        sessionId,
        data: { audio: audio.toString('base64') },
      });
    }
  }

  /**
   * Send text response to client
   */
  sendTextToClient(sessionId: string, text: string): void {
    const ws = this.connections.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendJSON(ws, {
        type: 'response_text',
        sessionId,
        data: { text },
      });
    }
  }

  /**
   * Send VAD status to client
   */
  sendVADStatus(sessionId: string, vad: VADResult): void {
    const ws = this.connections.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendJSON(ws, {
        type: 'vad',
        sessionId,
        data: vad,
      });
    }
  }

  /**
   * Cleanup
   */
  close(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.connections.clear();
  }

  /**
   * Send JSON message
   */
  private sendJSON(ws: WebSocket, message: SignalingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

export const voiceSignaling = new VoiceSignalingServer();
