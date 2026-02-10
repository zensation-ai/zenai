/**
 * Voice Pipeline WebSocket Handler
 *
 * Handles WebSocket connections for the real-time voice conversation pipeline.
 * Protocol: Binary frames for audio data, text frames for JSON control messages.
 *
 * Phase 33 Sprint 4 - Feature 9
 */

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../utils/logger';
import {
  createPipelineSession,
  processVoiceTurn,
  interruptPipeline,
  cleanupSession,
  type ClientMessage,
  type ServerMessage,
  type VoicePipelineSession,
} from '../services/voice-pipeline';
import { TTS_VOICES, type TTSVoice } from '../services/tts';

// ============================================================
// WebSocket Connection Handler
// ============================================================

/**
 * Handle a new WebSocket connection for the voice pipeline.
 * Each connection creates an independent voice conversation session.
 */
export function handleVoicePipelineConnection(ws: WebSocket, _req: IncomingMessage): void {
  const session: VoicePipelineSession = createPipelineSession();
  let audioChunks: Buffer[] = [];

  logger.info('Voice pipeline connection opened', {
    sessionId: session.id,
    operation: 'voice-pipeline-connect',
  });

  // Send session start
  sendMessage(ws, { type: 'session_start', sessionId: session.id });

  // Setup heartbeat
  const aliveWs = ws as WebSocket & { isAlive: boolean };
  aliveWs.isAlive = true;
  ws.on('pong', () => {
    aliveWs.isAlive = true;
  });

  // ============================================================
  // Message Handler
  // ============================================================

  ws.on('message', async (data: Buffer | string) => {
    try {
      // Binary data = audio chunk
      if (Buffer.isBuffer(data)) {
        audioChunks.push(data);
        return;
      }

      // Text data = JSON control message
      let message: ClientMessage;
      try {
        message = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        sendMessage(ws, {
          type: 'error',
          message: 'Invalid JSON message',
          code: 'INVALID_MESSAGE',
        });
        return;
      }

      switch (message.type) {
        case 'audio_end': {
          if (session.isProcessing) {
            sendMessage(ws, {
              type: 'error',
              message: 'Pipeline busy, please wait',
              code: 'PIPELINE_BUSY',
            });
            return;
          }

          // Concatenate audio chunks
          const audioBuffer = Buffer.concat(audioChunks);
          audioChunks = [];

          if (audioBuffer.length < 100) {
            sendMessage(ws, {
              type: 'error',
              message: 'Audio too short',
              code: 'AUDIO_TOO_SHORT',
            });
            return;
          }

          session.isProcessing = true;

          // Process the voice turn (streaming results)
          try {
            for await (const msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
              if (ws.readyState !== WebSocket.OPEN) {
                break;
              }

              if (msg.type === 'audio_chunk') {
                // Send binary audio data directly
                ws.send(msg.data, { binary: true });
              } else {
                sendMessage(ws, msg);
              }
            }
          } finally {
            session.isProcessing = false;
          }
          break;
        }

        case 'config': {
          if (message.voice && TTS_VOICES.some(v => v.id === message.voice)) {
            session.voice = message.voice as TTSVoice;
          }
          if (message.speed) {
            session.speed = message.speed;
          }
          if (message.chatSessionId) {
            session.chatSessionId = message.chatSessionId;
          }

          logger.info('Voice pipeline config updated', {
            sessionId: session.id,
            voice: session.voice,
            speed: session.speed,
            operation: 'voice-pipeline-config',
          });
          break;
        }

        case 'interrupt': {
          interruptPipeline(session);
          audioChunks = [];
          break;
        }

        case 'ping': {
          sendMessage(ws, { type: 'pong' });
          break;
        }

        default: {
          sendMessage(ws, {
            type: 'error',
            message: `Unknown message type`,
            code: 'UNKNOWN_MESSAGE',
          });
        }
      }
    } catch (error) {
      logger.error('Voice pipeline message error', error instanceof Error ? error : undefined, {
        sessionId: session.id,
        operation: 'voice-pipeline-message',
      });
      sendMessage(ws, {
        type: 'error',
        message: 'Internal pipeline error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // ============================================================
  // Close / Error Handlers
  // ============================================================

  ws.on('close', () => {
    cleanupSession(session);
    audioChunks = [];
    logger.info('Voice pipeline connection closed', {
      sessionId: session.id,
      totalTurns: session.metrics.totalTurns,
      operation: 'voice-pipeline-disconnect',
    });
  });

  ws.on('error', (error) => {
    logger.error('Voice pipeline WebSocket error', error, {
      sessionId: session.id,
      operation: 'voice-pipeline-error',
    });
    cleanupSession(session);
  });
}

// ============================================================
// Helpers
// ============================================================

function sendMessage(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
