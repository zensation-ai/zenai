/**
 * WebSocket Connection Hook for Voice Chat
 *
 * Manages WebSocket connection to the voice signaling server.
 * Handles JSON message serialization, audio as base64, and auto-reconnect.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

function getWsUrl(): string {
  return API_URL.replace(/^http/, 'ws');
}

interface SignalingMessage {
  type: string;
  sessionId?: string;
  data?: unknown;
}

export interface UseWebRTCOptions {
  context: string;
  onTranscript?: (text: string) => void;
  onResponseText?: (text: string) => void;
  onResponseAudio?: (audio: ArrayBuffer) => void;
  onVAD?: (isSpeaking: boolean, volume: number) => void;
  onError?: (error: string) => void;
  onSessionStart?: (sessionId: string) => void;
}

export interface UseWebRTCReturn {
  isConnected: boolean;
  sessionId: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendAudio: (chunk: ArrayBuffer) => void;
  sendConfig: (config: Record<string, unknown>) => void;
}

export function useWebRTC(options: UseWebRTCOptions): UseWebRTCReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setSessionId(null);
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: SignalingMessage = JSON.parse(event.data as string);

      switch (message.type) {
        case 'session_start': {
          const sid = message.sessionId || '';
          setSessionId(sid);
          optionsRef.current.onSessionStart?.(sid);
          break;
        }

        case 'transcript': {
          const textData = message.data as { text?: string } | undefined;
          if (textData?.text !== undefined) {
            optionsRef.current.onTranscript?.(textData.text);
          }
          break;
        }

        case 'response_text': {
          const rtData = message.data as { text?: string } | undefined;
          if (rtData?.text) {
            optionsRef.current.onResponseText?.(rtData.text);
          }
          break;
        }

        case 'response_audio': {
          const audioData = message.data as { audio?: string } | undefined;
          if (audioData?.audio) {
            const binary = atob(audioData.audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            optionsRef.current.onResponseAudio?.(bytes.buffer);
          }
          break;
        }

        case 'vad': {
          const vadData = message.data as { isSpeaking?: boolean; volume?: number } | undefined;
          if (vadData) {
            optionsRef.current.onVAD?.(
              vadData.isSpeaking || false,
              vadData.volume || 0
            );
          }
          break;
        }

        case 'error': {
          const errData = message.data as { message?: string } | undefined;
          optionsRef.current.onError?.(errData?.message || 'Unknown error');
          break;
        }

        case 'pong':
          // Keepalive response
          break;
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const connect = useCallback(async () => {
    cleanup();

    const wsUrl = `${getWsUrl()}/ws/voice?context=${optionsRef.current.context}&token=${API_KEY}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    return new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        setIsConnected(true);

        // Send join message to create session
        ws.send(JSON.stringify({
          type: 'join',
          data: {},
        }));

        // Start ping interval
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);

        ws.addEventListener('close', () => {
          clearInterval(pingInterval);
        }, { once: true });

        resolve();
      };

      ws.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setSessionId(null);

        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (wsRef.current === ws) {
            // Only reconnect if this is still the current connection
            connect().catch(() => {
              // Reconnect failed silently
            });
          }
        }, 3000);
      };

      ws.onmessage = handleMessage;
    });
  }, [cleanup, handleMessage]);

  const disconnect = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const sendAudio = useCallback((chunk: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Convert to base64
      const bytes = new Uint8Array(chunk);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      wsRef.current.send(JSON.stringify({
        type: 'audio',
        data: { audio: base64 },
      }));
    }
  }, []);

  const sendConfig = useCallback((config: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'config',
        data: config,
      }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    sessionId,
    connect,
    disconnect,
    sendAudio,
    sendConfig,
  };
}
